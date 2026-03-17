/**
 * GET  /api/state — טעינת AppState מסונן לפי תפקיד
 * POST /api/state — שמירת AppState עם ולידציית בעלות
 *
 * שכבת האבטחה המרכזית:
 * - Admin: רואה ושומר הכל
 * - Salesperson: רואה רק הנתונים שלו, לא יכול לשמור נתונים של אחרים
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from './_lib/auth';
import { supabaseAdmin }   from './_lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isAdmin = crmUser.role === 'admin';
  const uid     = crmUser.crm_user_id;

  if (req.method === 'GET')  return handleGet(res, uid, isAdmin);
  if (req.method === 'POST') return handlePost(req, res, uid, isAdmin);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ════════════════════════════════════════════════════════════════════
// Field converters — DB (snake_case) ↔ Frontend (camelCase)
// ════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ── Leads ──────────────────────────────────────────────────────────────────────

function dbToLead(r: Row): Row {
  return {
    id:             r.id,
    name:           r.name,
    phone:          r.phone,
    email:          r.email,
    source:         r.source,
    sourceCampaign: r.source_campaign,
    profession:     r.profession,
    audience_type:  r.audience_type,
    program:        r.program,
    interestedIn:   r.interested_in   ?? [],
    status:         r.status,
    assigned_to:    r.assigned_to,
    created_at:     r.created_at,
    updated_at:     r.updated_at,
    custom_fields:  r.custom_fields   ?? {},
    followUpAt:     r.follow_up_at,
    score:          r.score           ?? 0,
    lastActivityAt: r.last_activity_at,
    dealValue:      r.deal_value,
  };
}

function leadToDb(l: Row): Row {
  return {
    id:               l.id,
    name:             l.name             ?? '',
    phone:            l.phone            ?? '',
    email:            l.email            ?? null,
    source:           l.source           ?? '',
    source_campaign:  l.sourceCampaign   ?? null,
    profession:       l.profession       ?? '',
    audience_type:    l.audience_type    ?? '',
    program:          l.program          ?? '',
    interested_in:    l.interestedIn     ?? [],
    status:           l.status           ?? 'new',
    assigned_to:      l.assigned_to      ?? '',
    created_at:       l.created_at,
    updated_at:       l.updated_at,
    custom_fields:    l.custom_fields    ?? {},
    follow_up_at:     l.followUpAt       ?? null,
    score:            l.score            ?? 0,
    last_activity_at: l.lastActivityAt   ?? null,
    deal_value:       l.dealValue        ?? null,
  };
}

// ── Clients ────────────────────────────────────────────────────────────────────

function dbToClient(r: Row): Row {
  return {
    id:                 r.id,
    leadId:             r.lead_id,
    productId:          r.product_id,
    dealValue:          r.deal_value          ?? 0,
    closedAt:           r.closed_at,
    assignedTo:         r.assigned_to,
    onboardingProgress: r.onboarding_progress ?? {},
    customSteps:        r.custom_steps        ?? [],
    notes:              r.notes,
  };
}

function clientToDb(c: Row): Row {
  return {
    id:                   c.id,
    lead_id:              c.leadId             ?? null,
    product_id:           c.productId          ?? '',
    deal_value:           c.dealValue          ?? 0,
    closed_at:            c.closedAt,
    assigned_to:          c.assignedTo         ?? '',
    onboarding_progress:  c.onboardingProgress ?? {},
    custom_steps:         c.customSteps        ?? [],
    notes:                c.notes              ?? null,
  };
}

// ── Chat messages ──────────────────────────────────────────────────────────────

function dbToChat(r: Row): Row {
  return {
    id:          r.id,
    fromUserId:  r.from_user_id,
    toUserId:    r.to_user_id,
    content:     r.content,
    timestamp:   r.timestamp,
    readBy:      r.read_by ?? [],
  };
}

function chatToDb(m: Row): Row {
  return {
    id:            m.id,
    from_user_id:  m.fromUserId,
    to_user_id:    m.toUserId    ?? null,
    content:       m.content,
    timestamp:     m.timestamp,
    read_by:       m.readBy      ?? [],
  };
}

// ── Pinned notes ───────────────────────────────────────────────────────────────

function dbToNote(r: Row): Row {
  return {
    id:        r.id,
    userId:    r.user_id,
    content:   r.content,
    createdAt: r.created_at,
    color:     r.color,
  };
}

function noteToDb(n: Row): Row {
  return {
    id:         n.id,
    user_id:    n.userId,
    content:    n.content,
    created_at: n.createdAt,
    color:      n.color,
  };
}

// Activities and Tasks fields already match between frontend and DB (snake_case in both)

// ════════════════════════════════════════════════════════════════════
// GET handler
// ════════════════════════════════════════════════════════════════════

async function handleGet(res: VercelResponse, uid: string, isAdmin: boolean) {
  // קונפיגורציה משותפת
  const { data: config, error: cfgErr } = await supabaseAdmin
    .from('crm_config')
    .select('*')
    .single();

  if (cfgErr && cfgErr.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Failed to load config' });
  }

  // לידים — מסונן לנציג (FIX: capture .eq() return value)
  const leadsQ = supabaseAdmin.from('leads').select('*');
  const { data: rawLeads = [] } = await (isAdmin ? leadsQ : leadsQ.eq('assigned_to', uid));
  const leads = (rawLeads ?? []).map(dbToLead);

  // פעילויות — רק ללידים הנראים
  const leadIds = leads.map(l => l.id as string);
  const { data: activities = [] } = leadIds.length > 0
    ? await supabaseAdmin.from('activities').select('*').in('lead_id', leadIds)
    : { data: [] };

  // משימות — מסונן לנציג (FIX: capture .eq() return value)
  const tasksQ = supabaseAdmin.from('tasks').select('*');
  const { data: tasks = [] } = await (isAdmin ? tasksQ : tasksQ.eq('assigned_to', uid));

  // לקוחות — מסונן לנציג (FIX: capture .eq() return value)
  const clientsQ = supabaseAdmin.from('clients').select('*');
  const { data: rawClients = [] } = await (isAdmin
    ? clientsQ
    : clientsQ.in('lead_id', leadIds.length > 0 ? leadIds : ['__none__']));
  const clients = (rawClients ?? []).map(dbToClient);

  // הודעות צ'אט — broadcast + שלו
  const { data: rawChat = [] } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .or(`to_user_id.is.null,from_user_id.eq.${uid},to_user_id.eq.${uid}`)
    .order('timestamp', { ascending: true });
  const chatMessages = (rawChat ?? []).map(dbToChat);

  // פתקיות — רק שלו
  const { data: rawNotes = [] } = await supabaseAdmin
    .from('pinned_notes')
    .select('*')
    .eq('user_id', uid);
  const pinnedNotes = (rawNotes ?? []).map(dbToNote);

  if (!config) {
    // הפעלה ראשונה — אין קונפיגורציה עדיין
    return res.status(200).json(null);
  }

  return res.status(200).json({
    // קונפיגורציה
    users:             config.users              ?? [],
    statuses:          config.statuses           ?? [],
    products:          config.products           ?? [],
    dropdownOptions:   config.dropdown_options   ?? {},
    customFields:      config.custom_fields      ?? [],
    labels:            config.labels             ?? {},
    navConfig:         config.nav_config         ?? [],
    salesTargets:      config.sales_targets      ?? {},
    automationRules:   config.automation_rules   ?? [],
    tableColumnPrefs:  config.table_column_prefs ?? {},
    dailySummaryEmail: config.daily_summary_email ?? '',
    // נתונים
    leads,
    activities:   activities   ?? [],
    tasks:        tasks        ?? [],
    clients,
    chatMessages,
    pinnedNotes,
    currentUserId: uid,
  });
}

// ════════════════════════════════════════════════════════════════════
// POST handler
// ════════════════════════════════════════════════════════════════════

async function handlePost(req: VercelRequest, res: VercelResponse, uid: string, isAdmin: boolean) {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // ── ולידציית בעלות לנציגים ───────────────────────────────────────────────
  if (!isAdmin) {
    const illegalLead = (incoming.leads ?? []).find(
      (l: Row) => l.assigned_to !== uid
    );
    if (illegalLead) {
      return res.status(403).json({ error: 'Cannot modify leads assigned to others' });
    }
  }

  // ── קונפיגורציה (admin בלבד) ──────────────────────────────────────────────
  if (isAdmin) {
    await supabaseAdmin.from('crm_config').upsert({
      id:                  '00000000-0000-0000-0000-000000000001',
      users:               incoming.users              ?? [],
      statuses:            incoming.statuses           ?? [],
      products:            incoming.products           ?? [],
      dropdown_options:    incoming.dropdownOptions    ?? {},
      custom_fields:       incoming.customFields       ?? [],
      labels:              incoming.labels             ?? {},
      nav_config:          incoming.navConfig          ?? [],
      sales_targets:       incoming.salesTargets       ?? {},
      automation_rules:    incoming.automationRules    ?? [],
      table_column_prefs:  incoming.tableColumnPrefs   ?? {},
      daily_summary_email: incoming.dailySummaryEmail  ?? '',
      updated_at:          new Date().toISOString(),
    });
  }

  // ── לידים: upsert + delete ────────────────────────────────────────────────
  const leadsToSave: Row[] = isAdmin
    ? incoming.leads ?? []
    : (incoming.leads ?? []).filter((l: Row) => l.assigned_to === uid);

  if (leadsToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('leads')
      .upsert(leadsToSave.map(leadToDb));
    if (error) console.error('leads upsert error:', error);
  }

  // מחיקת לידים שנמחקו
  const existingLeadsQ = supabaseAdmin.from('leads').select('id');
  const { data: existingLeads = [] } = await (isAdmin
    ? existingLeadsQ
    : existingLeadsQ.eq('assigned_to', uid));
  const incomingLeadIds = new Set((incoming.leads ?? []).map((l: Row) => l.id));
  const leadsToDelete = (existingLeads ?? [])
    .filter((l: Row) => !incomingLeadIds.has(l.id))
    .map((l: Row) => l.id);
  if (leadsToDelete.length > 0) {
    await supabaseAdmin.from('leads').delete().in('id', leadsToDelete);
  }

  // ── פעילויות: upsert + delete ─────────────────────────────────────────────
  const myLeadIds = new Set(leadsToSave.map(l => l.id));

  const activitiesToSave = (incoming.activities ?? []).filter(
    (a: Row) => myLeadIds.has(a.lead_id)
  );
  if (activitiesToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('activities')
      .upsert(activitiesToSave); // activities already snake_case in frontend
    if (error) console.error('activities upsert error:', error);
  }

  // מחיקת פעילויות שנמחקו
  if (myLeadIds.size > 0) {
    const { data: existingActs = [] } = await supabaseAdmin
      .from('activities').select('id').in('lead_id', [...myLeadIds]);
    const incomingActIds = new Set((incoming.activities ?? []).map((a: Row) => a.id));
    const actsToDelete = (existingActs ?? [])
      .filter((a: Row) => !incomingActIds.has(a.id))
      .map((a: Row) => a.id);
    if (actsToDelete.length > 0) {
      await supabaseAdmin.from('activities').delete().in('id', actsToDelete);
    }
  }

  // ── משימות: upsert + delete ───────────────────────────────────────────────
  const tasksToSave: Row[] = isAdmin
    ? incoming.tasks ?? []
    : (incoming.tasks ?? []).filter((t: Row) => t.assigned_to === uid);

  if (tasksToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('tasks')
      .upsert(tasksToSave); // tasks already snake_case
    if (error) console.error('tasks upsert error:', error);
  }

  // מחיקת משימות שנמחקו
  const existingTasksQ = supabaseAdmin.from('tasks').select('id');
  const { data: existingTasks = [] } = await (isAdmin
    ? existingTasksQ
    : existingTasksQ.eq('assigned_to', uid));
  const incomingTaskIds = new Set((incoming.tasks ?? []).map((t: Row) => t.id));
  const tasksToDelete = (existingTasks ?? [])
    .filter((t: Row) => !incomingTaskIds.has(t.id))
    .map((t: Row) => t.id);
  if (tasksToDelete.length > 0) {
    await supabaseAdmin.from('tasks').delete().in('id', tasksToDelete);
  }

  // ── לקוחות: upsert ────────────────────────────────────────────────────────
  const clientsToSave = (incoming.clients ?? []).filter(
    (c: Row) => isAdmin || myLeadIds.has(c.leadId)
  );
  if (clientsToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('clients')
      .upsert(clientsToSave.map(clientToDb));
    if (error) console.error('clients upsert error:', error);
  }

  // ── הודעות צ'אט: upsert ───────────────────────────────────────────────────
  const chatToSave = (incoming.chatMessages ?? []).filter(
    (m: Row) => isAdmin || m.fromUserId === uid
  );
  if (chatToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('chat_messages')
      .upsert(chatToSave.map(chatToDb));
    if (error) console.error('chat upsert error:', error);
  }

  // ── פתקיות: upsert + delete ───────────────────────────────────────────────
  const notesToSave = (incoming.pinnedNotes ?? []).filter(
    (n: Row) => isAdmin || n.userId === uid
  );
  if (notesToSave.length > 0) {
    const { error } = await supabaseAdmin
      .from('pinned_notes')
      .upsert(notesToSave.map(noteToDb));
    if (error) console.error('notes upsert error:', error);
  }

  // מחיקת פתקיות שנמחקו (רק שלי)
  const { data: existingNotes = [] } = await supabaseAdmin
    .from('pinned_notes').select('id').eq('user_id', uid);
  const incomingNoteIds = new Set(
    (incoming.pinnedNotes ?? [])
      .filter((n: Row) => isAdmin || n.userId === uid)
      .map((n: Row) => n.id)
  );
  const notesToDelete = (existingNotes ?? [])
    .filter((n: Row) => !incomingNoteIds.has(n.id))
    .map((n: Row) => n.id);
  if (notesToDelete.length > 0) {
    await supabaseAdmin.from('pinned_notes').delete().in('id', notesToDelete);
  }

  return res.status(200).json({ saved: true });
}
