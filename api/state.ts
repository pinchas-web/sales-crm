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

console.log('[CRM state.ts] module loaded — handler registered');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[CRM handler] request received:', req.method, req.url);
  try {
    const crmUser = await validateRequest(req.headers.authorization);
    if (!crmUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isAdmin = crmUser.role === 'admin';
    const uid     = crmUser.crm_user_id;

    if (req.method === 'GET')  return handleGet(res, uid, isAdmin);
    if (req.method === 'POST') {
      // לקוח ישן ששולח את כל ה-state — עלול למחוק נתונים שנוספו ע"י אחרים. חוסמים.
      if (!req.body?.patch) {
        return res.status(409).json({ error: 'outdated_client', message: 'גרסה חדשה של המערכת זמינה — רעננו את הדף' });
      }
      return handlePatch(req, res, uid, isAdmin);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[CRM] UNHANDLED EXCEPTION in handler:', err);
    return res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
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

// ── Courses ────────────────────────────────────────────────────────────────────

function dbToCourse(r: Row): Row {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description ?? '',
    color:       r.color       ?? '#6366f1',
    order:       r.order       ?? 0,
    createdAt:   r.created_at,
  };
}

function courseToDb(c: Row): Row {
  return {
    id:          c.id,
    title:       c.title       ?? '',
    description: c.description ?? '',
    color:       c.color       ?? '#6366f1',
    order:       c.order       ?? 0,
    created_at:  c.createdAt,
  };
}

// ── Lessons ────────────────────────────────────────────────────────────────────

function dbToLesson(r: Row): Row {
  return {
    id:           r.id,
    courseId:     r.course_id,
    title:        r.title,
    order:        r.order        ?? 0,
    date:         r.date,
    description:  r.description,
    columnOrder:  r.column_config?.columnOrder  ?? null,
    columnLabels: r.column_config?.columnLabels ?? null,
  };
}

function lessonToDb(l: Row): Row {
  return {
    id:            l.id,
    course_id:     l.courseId,
    title:         l.title        ?? '',
    order:         l.order        ?? 0,
    date:          l.date         ?? null,
    description:   l.description  ?? null,
    column_config: {
      columnOrder:  l.columnOrder  ?? null,
      columnLabels: l.columnLabels ?? null,
    },
  };
}

// ── Content Items ──────────────────────────────────────────────────────────────

function dbToContentItem(r: Row): Row {
  return {
    id:             r.id,
    lessonId:       r.lesson_id,
    type:           r.type,
    title:          r.title,
    fileKey:        r.file_key,
    fileUrl:        r.file_url,
    thumbnails:     r.thumbnails       ?? [],
    videoUrl:       r.video_url,
    videoThumbnail: r.video_thumbnail,
    slideCount:     r.slide_count      ?? null,
    order:          r.order            ?? 0,
  };
}

function contentItemToDb(ci: Row): Row {
  return {
    id:              ci.id,
    lesson_id:       ci.lessonId,
    type:            ci.type,
    title:           ci.title          ?? '',
    file_key:        ci.fileKey        ?? null,
    file_url:        ci.fileUrl        ?? null,
    thumbnails:      ci.thumbnails     ?? [],
    video_url:       ci.videoUrl       ?? null,
    video_thumbnail: ci.videoThumbnail ?? null,
    slide_count:     ci.slideCount     ?? null,
    order:           ci.order          ?? 0,
  };
}

// ── Marketing Knowledge ────────────────────────────────────────────────────────

function dbToMarketingKnowledge(r: Row): Row {
  return {
    id:        r.id,
    category:  r.category,
    title:     r.title,
    content:   r.content,
    updatedAt: r.updated_at,
  };
}

function marketingKnowledgeToDb(k: Row): Row {
  return {
    id:         k.id,
    category:   k.category  ?? 'products',
    title:      k.title     ?? '',
    content:    k.content   ?? '',
    updated_at: k.updatedAt ?? new Date().toISOString(),
  };
}

// ── Marketing Messages ─────────────────────────────────────────────────────────

function dbToMarketingMessage(r: Row): Row {
  return {
    id:            r.id,
    weekDate:      r.week_date,
    platform:      r.platform,
    content:       r.content,
    ctaType:       r.cta_type,
    status:        r.status,
    sequenceOrder: r.sequence_order ?? 1,
    sourceContent: r.source_content,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

function marketingMessageToDb(m: Row): Row {
  return {
    id:             m.id,
    week_date:      m.weekDate      ?? '',
    platform:       m.platform      ?? 'whatsapp_status',
    content:        m.content       ?? '',
    cta_type:       m.ctaType       ?? 'nurture',
    status:         m.status        ?? 'draft',
    sequence_order: m.sequenceOrder ?? 1,
    source_content: m.sourceContent ?? null,
    created_at:     m.createdAt,
    updated_at:     m.updatedAt     ?? new Date().toISOString(),
  };
}

// Activities and Tasks fields already match between frontend and DB (snake_case in both)

// ════════════════════════════════════════════════════════════════════
// GET handler
// ════════════════════════════════════════════════════════════════════

async function handleGet(res: VercelResponse, uid: string, isAdmin: boolean) {
  console.log(`[CRM GET] uid=${uid} isAdmin=${isAdmin}`);
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

  // קורסים — כולם גלויים לכולם (תוכן הוראה משותף)
  const { data: rawCourses = [] } = await supabaseAdmin
    .from('courses').select('*').order('order', { ascending: true });
  const courses = (rawCourses ?? []).map(dbToCourse);

  // שיעורים
  const courseIds = courses.map(c => c.id as string);
  const { data: rawLessons = [] } = courseIds.length > 0
    ? await supabaseAdmin.from('lessons').select('*').in('course_id', courseIds).order('order', { ascending: true })
    : { data: [] };
  const lessons = (rawLessons ?? []).map(dbToLesson);

  // פריטי תוכן
  const lessonIds = lessons.map(l => l.id as string);
  const { data: rawContentItems = [] } = lessonIds.length > 0
    ? await supabaseAdmin.from('content_items').select('*').in('lesson_id', lessonIds).order('order', { ascending: true })
    : { data: [] };
  const contentItems = (rawContentItems ?? []).map(dbToContentItem);

  // מאגר ידע שיווקי
  const { data: rawMktKnowledge = [] } = await supabaseAdmin
    .from('marketing_knowledge').select('*').order('category', { ascending: true });
  const marketingKnowledge = (rawMktKnowledge ?? []).map(dbToMarketingKnowledge);

  // מסרים שיווקיים
  const { data: rawMktMessages = [] } = await supabaseAdmin
    .from('marketing_messages').select('*')
    .order('week_date', { ascending: false });
  const marketingMessages = (rawMktMessages ?? []).map(dbToMarketingMessage);

  if (!config) {
    // הפעלה ראשונה — אין קונפיגורציה עדיין
    return res.status(200).json(null);
  }

  console.log(`[CRM GET] ✓ returning: leads=${leads.length} tasks=${(tasks??[]).length} activities=${(activities??[]).length} clients=${clients.length} chat=${chatMessages.length} notes=${pinnedNotes.length}`);
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
    // קורסים
    courses,
    lessons,
    contentItems,
    // שיווק
    marketingKnowledge,
    marketingMessages,
    marketingDeletedWeeks: [],
    currentUserId: uid,
  });
}

// ════════════════════════════════════════════════════════════════════
// POST handler — שמירת שינויים בלבד (patch)
// ════════════════════════════════════════════════════════════════════
//
// הלקוח שולח לכל אוסף: שורות חדשות (upsert), רק השדות שהשתנו בשורות קיימות
// (update), ו-ids שנמחקו (delete); ובנוסף מפתחות קונפיגורציה שהשתנו.
// אף שורה לא נמחקת רק כי לא נשלחה, ועדכון ממוזג לתוך הגרסה העדכנית בשרת —
// כך שני משתמשים שעורכים במקביל לא דורסים ולא מוחקים זה לזה.

type Change = { upsert?: Row[]; update?: Row[]; delete?: string[] };

const CONFIG_COLUMNS: Record<string, string> = {
  users:             'users',
  statuses:          'statuses',
  products:          'products',
  dropdownOptions:   'dropdown_options',
  customFields:      'custom_fields',
  labels:            'labels',
  navConfig:         'nav_config',
  salesTargets:      'sales_targets',
  automationRules:   'automation_rules',
  tableColumnPrefs:  'table_column_prefs',
  dailySummaryEmail: 'daily_summary_email',
};
const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

const same = (r: Row) => r;

interface CollectionSpec {
  table: string;
  fromDb: (r: Row) => Row;
  toDb: (r: Row) => Row;
  /** האם המשתמש רשאי לכתוב את השורה (אחרי מיזוג). existing = הגרסה בשרת, אם יש */
  canWrite: (row: Row, existing?: Row) => boolean;
  /** האם המשתמש רשאי למחוק את השורה הקיימת */
  canDelete: (existing: Row) => boolean;
}

async function fetchExisting(table: string, ids: string[]): Promise<Map<string, Row>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from(table).select('*').in('id', ids);
  if (error) throw new Error(`${table} select: ${error.message}`);
  return new Map((data ?? []).map((r: Row) => [r.id as string, r]));
}

async function applyCollection(spec: CollectionSpec, change: Change | undefined): Promise<number> {
  if (!change) return 0;
  const upserts = change.upsert ?? [];
  const updates = change.update ?? [];
  const deletes = change.delete ?? [];
  const existing = await fetchExisting(spec.table, [...upserts, ...updates].map(r => r.id as string).concat(deletes));
  let refused = 0;

  const rows: Row[] = [];
  for (const r of upserts) {
    const ex = existing.get(r.id as string);
    const exFront = ex ? spec.fromDb(ex) : undefined;
    if (spec.canWrite(r, exFront)) rows.push(spec.toDb(r)); else refused++;
  }
  for (const partial of updates) {
    const ex = existing.get(partial.id as string);
    if (!ex) continue;                       // נמחקה בינתיים ע"י מישהו אחר — לא מחיה אותה
    const exFront = spec.fromDb(ex);
    const merged = { ...exFront, ...partial };
    if (spec.canWrite(merged, exFront)) rows.push(spec.toDb(merged)); else refused++;
  }
  if (rows.length) {
    const { error } = await supabaseAdmin.from(spec.table).upsert(rows);
    if (error) throw new Error(`${spec.table} upsert: ${error.message}`);
    console.log(`[CRM] ${spec.table} ✓ wrote ${rows.length}`);
  }

  const delIds = deletes.filter(id => { const ex = existing.get(id); return ex && spec.canDelete(spec.fromDb(ex)); });
  refused += deletes.filter(id => existing.has(id)).length - delIds.length;
  if (delIds.length) {
    const { error } = await supabaseAdmin.from(spec.table).delete().in('id', delIds);
    if (error) throw new Error(`${spec.table} delete: ${error.message}`);
    console.log(`[CRM] ${spec.table} ✓ deleted ${delIds.length}`);
  }
  if (refused) console.warn(`[CRM] ${spec.table} — refused ${refused} change(s) (permissions)`);
  return refused;
}

async function handlePatch(req: VercelRequest, res: VercelResponse, uid: string, isAdmin: boolean) {
  const body = req.body as { changes?: Record<string, Change>; config?: Record<string, unknown>; marketingDeletedWeeks?: string[] };
  const changes = body.changes ?? {};
  const summary = Object.entries(changes)
    .map(([k, c]) => `${k}+${c.upsert?.length ?? 0}~${c.update?.length ?? 0}-${c.delete?.length ?? 0}`).join(' ');
  console.log(`[CRM PATCH] uid=${uid} isAdmin=${isAdmin} ${summary} config=${Object.keys(body.config ?? {}).join(',')}`);

  try {
    // ── קונפיגורציה (admin בלבד) — רק המפתחות שהשתנו ──────────────────────
    const cfgKeys = Object.keys(body.config ?? {}).filter(k => k in CONFIG_COLUMNS);
    if (isAdmin && cfgKeys.length) {
      const update: Row = { id: CONFIG_ID, updated_at: new Date().toISOString() };
      for (const k of cfgKeys) update[CONFIG_COLUMNS[k]] = body.config![k] ?? (k === 'dailySummaryEmail' ? '' : null);
      const { data: existing } = await supabaseAdmin.from('crm_config').select('id').eq('id', CONFIG_ID).maybeSingle();
      const { error } = existing
        ? await supabaseAdmin.from('crm_config').update(update).eq('id', CONFIG_ID)
        : await supabaseAdmin.from('crm_config').insert(update);
      if (error) throw new Error(`crm_config: ${error.message}`);
      console.log(`[CRM] crm_config ✓ ${cfgKeys.join(',')}`);
    }

    // נציג: רק לידים שמשויכים אליו (גם לפני וגם אחרי השינוי)
    const ownRow = (field: string) => (row: Row, ex?: Row) =>
      isAdmin || (row[field] === uid && (!ex || ex[field] === uid));
    let refused = await applyCollection({
      table: 'leads', fromDb: dbToLead, toDb: leadToDb,
      canWrite: ownRow('assigned_to'), canDelete: ex => isAdmin || ex.assigned_to === uid,
    }, changes.leads);
    if (refused && !isAdmin) {
      return res.status(403).json({ error: 'Cannot modify leads assigned to others' });
    }

    let mine: Set<string> | null = null;
    if (!isAdmin) {
      const { data, error } = await supabaseAdmin.from('leads').select('id').eq('assigned_to', uid);
      if (error) throw new Error(`leads select: ${error.message}`);
      mine = new Set((data ?? []).map((l: Row) => l.id as string));
    }
    const ownsLead = (leadId: unknown) => isAdmin || (typeof leadId === 'string' && mine!.has(leadId));

    refused += await applyCollection({
      table: 'activities', fromDb: same, toDb: same,
      canWrite: (r, ex) => ownsLead(r.lead_id) && (!ex || ownsLead(ex.lead_id)),
      canDelete: ex => ownsLead(ex.lead_id),
    }, changes.activities);

    refused += await applyCollection({
      table: 'tasks', fromDb: same, toDb: same,
      canWrite: ownRow('assigned_to'), canDelete: ex => isAdmin || ex.assigned_to === uid,
    }, changes.tasks);

    refused += await applyCollection({
      table: 'clients', fromDb: dbToClient, toDb: clientToDb,
      canWrite: (r, ex) => ownsLead(r.leadId) && (!ex || ownsLead(ex.leadId)),
      canDelete: () => isAdmin,
    }, changes.clients);

    // צ'אט: הכותב (או מנהל) עורך הודעה; כל מי שרואה הודעה רק מסמן אותה כנקראה.
    // read_by תמיד מתאחד עם מה שבשרת — שני קוראים לא דורסים זה את זה.
    const chat = changes.chatMessages;
    if (chat) {
      const partials = [...(chat.upsert ?? []), ...(chat.update ?? [])];
      const existing = await fetchExisting('chat_messages', partials.map(m => m.id as string));
      const rows: Row[] = [];
      for (const m of partials) {
        const ex = existing.get(m.id as string);
        if (!ex) {
          if (chat.upsert?.includes(m) && (isAdmin || m.fromUserId === uid)) rows.push(chatToDb(m));
          continue;
        }
        const exFront = dbToChat(ex);
        const canEdit = isAdmin || exFront.fromUserId === uid;
        const canSee  = canEdit || exFront.toUserId == null || exFront.toUserId === uid;
        if (!canSee) continue;
        const incomingRead: string[] = Array.isArray(m.readBy) ? m.readBy as string[] : [];
        const readBy = [...new Set([...(exFront.readBy as string[]), ...(canEdit ? incomingRead : incomingRead.filter(r => r === uid))])];
        rows.push(chatToDb(canEdit ? { ...exFront, ...m, readBy } : { ...exFront, readBy }));
      }
      if (rows.length) {
        const { error } = await supabaseAdmin.from('chat_messages').upsert(rows);
        if (error) throw new Error(`chat_messages upsert: ${error.message}`);
      }
    }

    refused += await applyCollection({
      table: 'pinned_notes', fromDb: dbToNote, toDb: noteToDb,
      canWrite: (r, ex) => (isAdmin || r.userId === uid) && (!ex || isAdmin || ex.userId === uid),
      canDelete: ex => ex.userId === uid,
    }, changes.pinnedNotes);

    // קורסים, שיווק — משותפים לכל המשתמשים (כמו קודם)
    const open = { canWrite: () => true, canDelete: () => true };
    await applyCollection({ table: 'courses', fromDb: dbToCourse, toDb: courseToDb, ...open }, changes.courses);
    await applyCollection({ table: 'lessons', fromDb: dbToLesson, toDb: lessonToDb, ...open }, changes.lessons);
    await applyCollection({ table: 'content_items', fromDb: dbToContentItem, toDb: contentItemToDb, ...open }, changes.contentItems);
    await applyCollection({ table: 'marketing_knowledge', fromDb: dbToMarketingKnowledge, toDb: marketingKnowledgeToDb, ...open }, changes.marketingKnowledge);

    const deletedWeeks = body.marketingDeletedWeeks ?? [];
    if (deletedWeeks.length) {
      const { error } = await supabaseAdmin.from('marketing_messages').delete().in('week_date', deletedWeeks);
      if (error) throw new Error(`marketing_messages weeks: ${error.message}`);
      console.log(`[CRM] marketing_messages ✓ deleted weeks: ${deletedWeeks.join(', ')}`);
    }
    await applyCollection({ table: 'marketing_messages', fromDb: dbToMarketingMessage, toDb: marketingMessageToDb, ...open }, changes.marketingMessages);

    console.log(`[CRM PATCH] ✓ done${refused ? ` (refused ${refused})` : ''}`);
    return res.status(200).json({ saved: true, refused });
  } catch (err) {
    console.error('[CRM PATCH] ERROR:', err);
    return res.status(500).json({ error: 'Save failed', details: String(err) });
  }
}
