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
  // ── ולידציית auth ─────────────────────────────────────────────────────────
  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isAdmin = crmUser.role === 'admin';
  const uid     = crmUser.crm_user_id;

  // ── GET — טעינת state ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    return handleGet(res, uid, isAdmin);
  }

  // ── POST — שמירת state ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    return handlePost(req, res, uid, isAdmin);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET handler ───────────────────────────────────────────────────────────────

async function handleGet(res: VercelResponse, uid: string, isAdmin: boolean) {
  // טעינת קונפיגורציה (משותפת לכולם)
  const { data: config, error: cfgErr } = await supabaseAdmin
    .from('crm_config')
    .select('*')
    .single();

  if (cfgErr && cfgErr.code !== 'PGRST116') { // PGRST116 = no rows
    return res.status(500).json({ error: 'Failed to load config' });
  }

  // טעינת לידים — מסונן לנציג
  const leadsQuery = supabaseAdmin.from('leads').select('*');
  if (!isAdmin) leadsQuery.eq('assigned_to', uid);
  const { data: leads = [] } = await leadsQuery;

  // טעינת פעילויות — רק ללידים הנראים
  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
  const { data: activities = [] } = leadIds.length > 0
    ? await supabaseAdmin.from('activities').select('*').in('lead_id', leadIds)
    : { data: [] };

  // טעינת משימות — מסונן לנציג
  const tasksQuery = supabaseAdmin.from('tasks').select('*');
  if (!isAdmin) tasksQuery.eq('assigned_to', uid);
  const { data: tasks = [] } = await tasksQuery;

  // טעינת לקוחות — מסונן לנציג
  const clientsQuery = supabaseAdmin.from('clients').select('*');
  if (!isAdmin) clientsQuery.in('lead_id', leadIds.length > 0 ? leadIds : ['__none__']);
  const { data: clients = [] } = await clientsQuery;

  // טעינת הודעות צ'אט — broadcast + שלו
  const { data: chatMessages = [] } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .or(`to_user_id.is.null,from_user_id.eq.${uid},to_user_id.eq.${uid}`)
    .order('timestamp', { ascending: true });

  // טעינת פתקיות — רק שלו
  const { data: pinnedNotes = [] } = await supabaseAdmin
    .from('pinned_notes')
    .select('*')
    .eq('user_id', uid);

  if (!config) {
    // הפעלה ראשונה — אין קונפיגורציה, React ישתמש ב-SEED_STATE
    return res.status(200).json(null);
  }

  // הרכבת AppState בפורמט שה-React app מצפה לו
  const appState = assembleAppState(config, {
    leads:        leads        ?? [],
    activities:   activities   ?? [],
    tasks:        tasks        ?? [],
    clients:      clients      ?? [],
    chatMessages: chatMessages ?? [],
    pinnedNotes:  pinnedNotes  ?? [],
    currentUserId: uid,
  });

  return res.status(200).json(appState);
}

// ── POST handler ──────────────────────────────────────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse, uid: string, isAdmin: boolean) {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // ── ולידציית בעלות לנציגים ───────────────────────────────────────────────
  if (!isAdmin) {
    const illegalLead = (incoming.leads ?? []).find(
      (l: { assigned_to: string }) => l.assigned_to !== uid
    );
    if (illegalLead) {
      return res.status(403).json({ error: 'Cannot modify leads assigned to others' });
    }
  }

  // ── שמירת קונפיגורציה (admin בלבד) ──────────────────────────────────────
  if (isAdmin) {
    await supabaseAdmin.from('crm_config').upsert({
      id:                  '00000000-0000-0000-0000-000000000001', // שורה יחידה קבועה
      users:               incoming.users               ?? [],
      statuses:            incoming.statuses            ?? [],
      products:            incoming.products            ?? [],
      dropdown_options:    incoming.dropdownOptions     ?? {},
      custom_fields:       incoming.customFields        ?? [],
      labels:              incoming.labels              ?? {},
      nav_config:          incoming.navConfig           ?? [],
      sales_targets:       incoming.salesTargets        ?? {},
      automation_rules:    incoming.automationRules     ?? [],
      table_column_prefs:  incoming.tableColumnPrefs    ?? {},
      daily_summary_email: incoming.dailySummaryEmail   ?? '',
      updated_at:          new Date().toISOString(),
    });
  }

  // ── שמירת לידים ─────────────────────────────────────────────────────────
  const leadsToSave: object[] = isAdmin
    ? incoming.leads ?? []
    : (incoming.leads ?? []).filter((l: { assigned_to: string }) => l.assigned_to === uid);

  if (leadsToSave.length > 0) {
    await supabaseAdmin.from('leads').upsert(leadsToSave);
  }

  // מחיקת לידים שנמחקו (נציג — רק הלידים שלו; admin — כולם)
  const { data: existingLeads = [] } = isAdmin
    ? await supabaseAdmin.from('leads').select('id')
    : await supabaseAdmin.from('leads').select('id').eq('assigned_to', uid);

  const incomingLeadIds   = new Set((incoming.leads ?? []).map((l: { id: string }) => l.id));
  const leadsToDelete = (existingLeads ?? [])
    .filter((l: { id: string }) => !incomingLeadIds.has(l.id))
    .map((l: { id: string }) => l.id);
  if (leadsToDelete.length > 0) {
    await supabaseAdmin.from('leads').delete().in('id', leadsToDelete);
  }

  // ── שמירת פעילויות ───────────────────────────────────────────────────────
  const myLeadIds = new Set((incoming.leads ?? [])
    .filter((l: { assigned_to: string }) => isAdmin || l.assigned_to === uid)
    .map((l: { id: string }) => l.id));

  const activitiesToSave = (incoming.activities ?? []).filter(
    (a: { lead_id: string }) => myLeadIds.has(a.lead_id)
  );
  if (activitiesToSave.length > 0) {
    await supabaseAdmin.from('activities').upsert(activitiesToSave);
  }

  // ── שמירת משימות ─────────────────────────────────────────────────────────
  const tasksToSave: object[] = isAdmin
    ? incoming.tasks ?? []
    : (incoming.tasks ?? []).filter((t: { assigned_to: string }) => t.assigned_to === uid);

  if (tasksToSave.length > 0) {
    await supabaseAdmin.from('tasks').upsert(tasksToSave);
  }

  // ── שמירת לקוחות ─────────────────────────────────────────────────────────
  const clientsToSave = (incoming.clients ?? []).filter(
    (c: { lead_id: string }) => isAdmin || myLeadIds.has(c.lead_id)
  );
  if (clientsToSave.length > 0) {
    await supabaseAdmin.from('clients').upsert(clientsToSave);
  }

  // ── שמירת הודעות צ'אט ────────────────────────────────────────────────────
  const chatToSave = (incoming.chatMessages ?? []).filter(
    (m: { fromUserId: string }) => isAdmin || m.fromUserId === uid
  );
  if (chatToSave.length > 0) {
    await supabaseAdmin.from('chat_messages').upsert(chatToSave);
  }

  // ── שמירת פתקיות ─────────────────────────────────────────────────────────
  const notesToSave = (incoming.pinnedNotes ?? []).filter(
    (n: { userId: string }) => isAdmin || n.userId === uid
  );
  if (notesToSave.length > 0) {
    await supabaseAdmin.from('pinned_notes').upsert(notesToSave);
  }

  return res.status(200).json({ saved: true });
}

// ── assembleAppState — ממיר שורות DB לפורמט AppState ─────────────────────────

function assembleAppState(
  config: Record<string, unknown>,
  data: {
    leads:        unknown[];
    activities:   unknown[];
    tasks:        unknown[];
    clients:      unknown[];
    chatMessages: unknown[];
    pinnedNotes:  unknown[];
    currentUserId: string;
  }
) {
  return {
    // קונפיגורציה
    users:              config.users              ?? [],
    statuses:           config.statuses           ?? [],
    products:           config.products           ?? [],
    dropdownOptions:    config.dropdown_options   ?? {},
    customFields:       config.custom_fields      ?? [],
    labels:             config.labels             ?? {},
    navConfig:          config.nav_config         ?? [],
    salesTargets:       config.sales_targets      ?? {},
    automationRules:    config.automation_rules   ?? [],
    tableColumnPrefs:   config.table_column_prefs ?? {},
    dailySummaryEmail:  config.daily_summary_email ?? '',
    // נתוני ישויות
    leads:        data.leads,
    activities:   data.activities,
    tasks:        data.tasks,
    clients:      data.clients,
    chatMessages: data.chatMessages,
    pinnedNotes:  data.pinnedNotes,
    // זהות המשתמש הנוכחי — נקבע ע"י השרת, לא הלקוח
    currentUserId: data.currentUserId,
  };
}
