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
import { diffRows, type RecordRow } from '../src/state-diff';

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

    if (req.method === 'GET')  return await handleGet(res, uid, isAdmin);
    if (req.method === 'POST') return await handlePost(req, res, uid, isAdmin);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[CRM] UNHANDLED EXCEPTION in handler:', err);
    return res.status(500).json({ error: 'Could not complete request' });
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

  type Query = ReturnType<ReturnType<typeof supabaseAdmin.from>['select']>;
  const all = async (table: string, filter: (q: Query) => Query = q => q): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let offset = 0; offset < 20000; offset += 500) {
      let query = filter(supabaseAdmin.from(table).select('*'));
      if (['leads','courses','lessons'].includes(table)) query = query.eq('archived', false);
      const { data } = await query.order('id').range(offset, offset + 499).throwOnError();
      rows.push(...data);
      if (data.length < 500) return rows;
    }
    throw new Error('Dataset requires paginated view');
  };
  const rawLeads = await all('leads', q => isAdmin ? q : q.eq('assigned_to', uid));
  const leads = rawLeads.map(dbToLead);
  const leadIds = leads.map(l => l.id as string);
  const [activities, tasks, rawClients, rawChat, rawNotes, rawCourses, rawMktKnowledge, rawMktMessages] = await Promise.all([
    leadIds.length ? all('activities', q => q.in('lead_id',leadIds)) : [],
    all('tasks', q => isAdmin ? q : q.eq('assigned_to',uid)),
    isAdmin ? all('clients') : leadIds.length ? all('clients', q => q.in('lead_id',leadIds)) : [],
    all('chat_messages', q => q.or(`to_user_id.is.null,from_user_id.eq.${uid},to_user_id.eq.${uid}`)),
    all('pinned_notes', q => q.eq('user_id',uid)), all('courses'),
    isAdmin ? all('marketing_knowledge') : [], isAdmin ? all('marketing_messages') : [],
  ]);
  const clients = rawClients.map(dbToClient);
  const chatMessages = rawChat.map(dbToChat).sort((a,b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const pinnedNotes = rawNotes.map(dbToNote);
  const courses = rawCourses.map(dbToCourse).sort((a,b) => a.order-b.order);
  const courseIds = courses.map(c => c.id);
  const rawLessons = courseIds.length ? await all('lessons', q => q.in('course_id',courseIds)) : [];
  const lessons = rawLessons.map(dbToLesson).sort((a,b) => a.order-b.order);
  const lessonIds = lessons.map(l => l.id);
  const rawContentItems = lessonIds.length ? await all('content_items', q => q.in('lesson_id',lessonIds)) : [];
  const contentItems = rawContentItems.map(dbToContentItem).sort((a,b) => a.order-b.order);
  const marketingKnowledge = rawMktKnowledge.map(dbToMarketingKnowledge);
  const marketingMessages = rawMktMessages.map(dbToMarketingMessage).sort((a,b) => String(b.weekDate).localeCompare(String(a.weekDate)));

  if (!config) {
    // הפעלה ראשונה — אין קונפיגורציה עדיין
    return res.status(200).json(null);
  }

  console.log(`[CRM GET] ✓ returning: leads=${leads.length} tasks=${(tasks??[]).length} activities=${(activities??[]).length} clients=${clients.length} chat=${chatMessages.length} notes=${pinnedNotes.length}`);
  return res.status(200).json({
    // קונפיגורציה
    users:             (config.users ?? []).map((user: Row) => {
      const safe = { ...user };
      delete safe.password;
      if (safe.id === uid) safe.role = isAdmin ? 'admin' : 'salesperson';
      return safe;
    }),
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
// POST handler
// ════════════════════════════════════════════════════════════════════

async function handlePost(req: VercelRequest, res: VercelResponse, uid: string, isAdmin: boolean) {
  const { before, after } = req.body ?? {};
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return res.status(400).json({ error: 'Reload the application before saving' });
  }
  const collections: [string, string, (row: Row) => Row][] = [
    ['leads', 'leads', leadToDb], ['tasks', 'tasks', r => r],
    ['activities', 'activities', r => r], ['clients', 'clients', clientToDb],
    ['chatMessages', 'chat_messages', chatToDb], ['pinnedNotes', 'pinned_notes', noteToDb],
    ['courses', 'courses', courseToDb], ['lessons', 'lessons', lessonToDb],
    ['contentItems', 'content_items', contentItemToDb],
    ['marketingKnowledge', 'marketing_knowledge', marketingKnowledgeToDb],
    ['marketingMessages', 'marketing_messages', marketingMessageToDb],
  ];
  const changes = [];
  for (const [key, table, convert] of collections) {
    if (!Array.isArray(before[key]) || !Array.isArray(after[key])) {
      return res.status(400).json({ error: 'Incomplete state; reload before saving' });
    }
    // Compare frontend rows first so defaults cannot create spurious writes.
    for (const change of diffRows(table, before[key], after[key])) {
      if (table === 'chat_messages' && !isAdmin && (change.after?.fromUserId ?? change.before?.fromUserId) !== uid) continue;
      changes.push({ table,
        before: change.before ? convert(change.before) : null,
        after: change.after ? convert(change.after) : null });
    }
  }
  if (isAdmin) {
    const config = (s: Row): RecordRow => ({
      id: '00000000-0000-0000-0000-000000000001',
      users: s.users, statuses: s.statuses, products: s.products,
      dropdown_options: s.dropdownOptions, custom_fields: s.customFields,
      labels: s.labels, nav_config: s.navConfig, sales_targets: s.salesTargets,
      automation_rules: s.automationRules, table_column_prefs: s.tableColumnPrefs,
      daily_summary_email: s.dailySummaryEmail,
    });
    changes.push(...diffRows('crm_config', [config(before)], [config(after)]));
  }
  const { error } = await supabaseAdmin.rpc('crm_apply_changes', {actor: uid, changes});
  if (error) {
    const status = error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500;
    return res.status(status).json({ error: status === 409 ? 'Record changed; reload before saving' : 'Changes were not saved' });
  }
  return res.status(200).json({saved: true});
}
