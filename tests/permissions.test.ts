/**
 * בדיקות הרשאות — מריצות את קוד השרת האמיתי (api/state.ts ועוד) מול מסד מדומה.
 * כל בדיקה היא משפט אחד מתוך החלטות שלב 1 (docs/planning/02-החלטות.md).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb, fakeRes } from './fakeSupabase';

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, user: null as null | { crm_user_id: string; role: string; email: string } }));

vi.mock('../api/_lib/supabaseAdmin', async () => {
  const { FakeDb } = await import('./fakeSupabase');
  h.db = new FakeDb();
  return { supabaseAdmin: h.db };
});
vi.mock('../api/_lib/auth', () => ({ validateRequest: async () => h.user }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async () => ({ content: [{ type: 'text', text: '[{"platform":"email","content":"שלום"}]' }] }) };
  },
}));

import stateHandler from '../api/state';
import generateHandler from '../api/marketing-generate';
import uploadUrlHandler from '../api/storage/upload-url';
import { PERMISSIONS, permsFor, tabsFor } from '../api/_lib/permissions';
import { COLLECTIONS } from '../src/sync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';
const ALL_TABS = ['home', 'leads', 'clients', 'products', 'tasks', 'data', 'chat', 'courses', 'marketing', 'settings'];

function seed() {
  h.db.reset({
    crm_config: [{
      id: CONFIG_ID,
      users: [
        { id: 'u1', name: 'פנחס', role: 'admin', commissionRate: 0, email: 'p@x.com' },
        { id: 'u2', name: 'יוסי', role: 'salesperson', commissionRate: 0.1, email: 'yossi@x.com', phone: '050-1', password: 'legacy-secret' },
        { id: 'u3', name: 'דנה', role: 'salesperson', commissionRate: 0.15, email: 'dana@x.com', phone: '050-2' },
        { id: 'u4', name: 'רותי', role: 'secretary', commissionRate: 0, email: 'ruti@x.com' },
        { id: 'u5', name: 'מירב', role: 'office_manager', commissionRate: 0, email: 'merav@x.com' },
      ],
      statuses: [{ id: 'new', label: 'חדש' }],
      products: [{ id: 'p1', name: 'ביזנסתרפיה', price: 5700 }],
      dropdown_options: {}, custom_fields: [], labels: {},
      nav_config: ALL_TABS.map((id, order) => ({ id, visible: true, order })),
      sales_targets: { u2: 5, u3: 4 },
      automation_rules: [], table_column_prefs: {}, daily_summary_email: 'boss@x.com',
    }],
    leads: [
      { id: 'l1', name: 'רחל', phone: '1', assigned_to: 'u2', status: 'new' },
      { id: 'l2', name: 'משה', phone: '2', assigned_to: 'u3', status: 'new' },
    ],
    activities: [
      { id: 'a1', lead_id: 'l1', note: 'שיחה', created_by: 'u2', type: 'call', date: '2026-10-01' },
      { id: 'a2', lead_id: 'l2', note: 'שיחה', created_by: 'u3', type: 'call', date: '2026-10-01' },
    ],
    tasks: [
      { id: 't1', assigned_to: 'u2', note: 'לחזור', due_date: '2026-10-22', done: false },
      { id: 't2', assigned_to: 'u3', note: 'לחזור', due_date: '2026-10-22', done: false },
    ],
    clients: [
      { id: 'c1', lead_id: 'l1', product_id: 'p1', deal_value: 5700, assigned_to: 'u4', onboarding_progress: {} },
      { id: 'c2', lead_id: 'l2', product_id: 'p1', deal_value: 5700, assigned_to: 'u4', onboarding_progress: {} },
    ],
    chat_messages: [{ id: 'm1', from_user_id: 'u1', to_user_id: null, content: 'בוקר טוב', timestamp: '1', read_by: [] }],
    pinned_notes: [],
    courses: [{ id: 'co1', title: 'קורס 1', order: 0 }],
    lessons: [{ id: 'le1', course_id: 'co1', title: 'שיעור 1', order: 0 }],
    content_items: [{ id: 'ci1', lesson_id: 'le1', title: 'מצגת', order: 0 }],
    marketing_knowledge: [
      { id: 'mk1', category: 'style', title: 'קול', content: 'אישי' },
      { id: '_ai_usage_counter', category: '_ai_usage', title: 'internal', content: '{}' },
    ],
    marketing_messages: [{ id: 'mm1', week_date: '2026-10-18', platform: 'email', content: 'x', cta_type: 'nurture' }],
  });
}

const as = (role: string, uid: string) => { h.user = { crm_user_id: uid, role, email: `${uid}@x.com` }; };
const ADMIN = () => as('admin', 'u1');
const SALES = () => as('salesperson', 'u2');
const SECRETARY = () => as('secretary', 'u4');
const OFFICE = () => as('office_manager', 'u5');

async function get(): Promise<{ status: number; body: Any }> {
  const res = fakeRes();
  await stateHandler({ method: 'GET', headers: {}, body: undefined } as Any, res as Any);
  return { status: res.statusCode, body: res.body };
}
async function patch(changes: Any, config: Any = {}): Promise<{ status: number; body: Any }> {
  const res = fakeRes();
  await stateHandler({ method: 'POST', headers: {}, body: { patch: true, changes, config } } as Any, res as Any);
  return { status: res.statusCode, body: res.body };
}
const row = (table: string, id: string) => h.db.rows(table).find(r => r.id === id) as Any;
const ids = (list: Any[]) => list.map(x => x.id).sort();

beforeEach(seed);

// ─────────────────────────────────────────────────────────────────────────────
describe('טבלת ההרשאות', () => {
  it('יש בדיוק ארבעה תפקידים', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(['admin', 'office_manager', 'salesperson', 'secretary']);
  });
  it('תפקיד לא מוכר (גם טעות הקלדה) לא מקבל שום הרשאה', () => {
    expect(permsFor('Secretary')).toBeNull();
    expect(permsFor(undefined)).toBeNull();
    expect(tabsFor('intern')).toEqual([]);
  });
  it('"לשוניות מותרות" רק מצמצמות בתוך התפקיד — אי אפשר לתת לנציג קורסים', () => {
    expect(tabsFor('salesperson', ['leads', 'courses', 'marketing'])).toEqual(['leads']);
  });
  it('ניהול משרד צופה בקורסים אבל לא עורך, ולא מנהל משתמשים', () => {
    expect(PERMISSIONS.office_manager.viewCourses).toBe(true);
    expect(PERMISSIONS.office_manager.editCourses).toBe(false);
    expect(PERMISSIONS.office_manager.manageUsers).toBe(false);
    expect(PERMISSIONS.office_manager.configKeys).not.toContain('users');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('נציג מכירות — מה הוא מקבל', () => {
  it('רואה רק את הלידים, הפעילויות, המשימות והלקוחות שלו', async () => {
    SALES();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(ids(body.leads)).toEqual(['l1']);
    expect(ids(body.activities)).toEqual(['a1']);
    expect(ids(body.tasks)).toEqual(['t1']);
    expect(ids(body.clients)).toEqual(['c1']);
  });
  it('לא יודע שיש קורסים או שיווק: אין נתונים ואין אפילו את שם הלשונית', async () => {
    SALES();
    const { body } = await get();
    expect(body.courses).toEqual([]);
    expect(body.lessons).toEqual([]);
    expect(body.contentItems).toEqual([]);
    expect(body.marketingKnowledge).toEqual([]);
    expect(body.marketingMessages).toEqual([]);
    expect(ids(body.navConfig)).toEqual(['chat', 'home', 'leads', 'products', 'tasks']);
  });
  it('לא רואה עמלות, יעדים, מיילים וטלפונים של נציגים אחרים', async () => {
    SALES();
    const { body } = await get();
    const dana = body.users.find((u: Any) => u.id === 'u3');
    expect(dana).toEqual({ id: 'u3', name: 'דנה', role: 'salesperson', commissionRate: 0 });
    expect(body.users.find((u: Any) => u.id === 'u2').commissionRate).toBe(0.1);
    expect(body.salesTargets).toEqual({ u2: 5 });
    expect(body.dailySummaryEmail).toBe('');
  });
  it('לא יכול למחוק ליד, גם לא שלו', async () => {
    SALES();
    const r = await patch({ leads: { upsert: [], update: [], delete: ['l1'] } });
    expect(r.status).toBe(403);
    expect(row('leads', 'l1')).toBeDefined();
  });
  it('לא יכול לשנות ליד של נציג אחר', async () => {
    SALES();
    const r = await patch({ leads: { upsert: [], update: [{ id: 'l2', status: 'won' }], delete: [] } });
    expect(r.status).toBe(403);
    expect(row('leads', 'l2').status).toBe('new');
  });
  it('יכול לעדכן ליד שלו', async () => {
    SALES();
    const r = await patch({ leads: { upsert: [], update: [{ id: 'l1', status: 'won' }], delete: [] } });
    expect(r.status).toBe(200);
    expect(row('leads', 'l1').status).toBe('won');
  });
  it('לא יכול לשנות או למחוק קורס, גם בבקשה שנבנתה ידנית', async () => {
    SALES();
    const r = await patch({
      courses: { upsert: [], update: [{ id: 'co1', title: 'נפרץ' }], delete: [] },
      lessons: { upsert: [], update: [], delete: ['le1'] },
    });
    expect(r.body.refused).toBe(2);
    expect(row('courses', 'co1').title).toBe('קורס 1');
    expect(row('lessons', 'le1')).toBeDefined();
  });
  it('רואה את המוצרים (כדי למכור) אבל לא יכול לשנות אותם', async () => {
    SALES();
    const { body } = await get();
    expect(body.products).toEqual([{ id: 'p1', name: 'ביזנסתרפיה', price: 5700 }]);
    await patch({}, { products: [{ id: 'p1', name: 'ביזנסתרפיה', price: 1 }] });
    expect((row('crm_config', CONFIG_ID).products as Any)[0].price).toBe(5700);
  });
  it('לא יכול לשנות שיווק או הגדרות', async () => {
    SALES();
    await patch({ marketingMessages: { upsert: [], update: [], delete: ['mm1'] } }, { statuses: [] });
    expect(row('marketing_messages', 'mm1')).toBeDefined();
    expect(row('crm_config', CONFIG_ID).statuses).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('מזכירות', () => {
  it('רואה את כל הלידים, המשימות והלקוחות, ומקבלת מוצרים וקליטה', async () => {
    SECRETARY();
    const { body } = await get();
    expect(ids(body.leads)).toEqual(['l1', 'l2']);
    expect(ids(body.tasks)).toEqual(['t1', 't2']);
    expect(ids(body.clients)).toEqual(['c1', 'c2']);
    expect(body.products).toHaveLength(1);
    expect(ids(body.navConfig)).toEqual(['chat', 'clients', 'home', 'leads', 'products', 'tasks']);
  });
  it('לא רואה קורסים, שיווק, עמלות ויעדים', async () => {
    SECRETARY();
    const { body } = await get();
    expect(body.courses).toEqual([]);
    expect(body.marketingMessages).toEqual([]);
    expect(body.users.find((u: Any) => u.id === 'u2').commissionRate).toBe(0);
    expect(body.salesTargets).toEqual({});
  });
  it('יכולה להעביר ליד מנציג לנציג — וההעברה נרשמת ביומן הליד', async () => {
    SECRETARY();
    const r = await patch({ leads: { upsert: [], update: [{ id: 'l1', assigned_to: 'u3' }], delete: [] } });
    expect(r.status).toBe(200);
    expect(row('leads', 'l1').assigned_to).toBe('u3');
    const log = h.db.rows('activities').find(a => a.lead_id === 'l1' && String(a.note).includes('הועבר')) as Any;
    expect(log.note).toBe('🔀 הליד הועבר מיוסי לדנה (ע"י רותי)');
  });
  it('לא יכולה למחוק ליד', async () => {
    SECRETARY();
    const r = await patch({ leads: { upsert: [], update: [], delete: ['l2'] } });
    expect(r.status).toBe(403);
    expect(row('leads', 'l2')).toBeDefined();
  });
  it('יכולה ליצור משימה לנציג אחר', async () => {
    SECRETARY();
    const r = await patch({ tasks: { upsert: [{ id: 't3', assigned_to: 'u2', note: 'פגישה', due_date: '2026-10-23', done: false }], update: [], delete: [] } });
    expect(r.body.refused).toBe(0);
    expect(row('tasks', 't3')).toBeDefined();
  });
  it('לא יכולה לשנות מחירי מוצרים', async () => {
    SECRETARY();
    await patch({}, { products: [{ id: 'p1', name: 'ביזנסתרפיה', price: 1 }] });
    expect((row('crm_config', CONFIG_ID).products as Any)[0].price).toBe(5700);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ניהול משרד', () => {
  it('רואה הכל, כולל קורסים, שיווק ועמלות', async () => {
    OFFICE();
    const { body } = await get();
    expect(ids(body.courses)).toEqual(['co1']);
    expect(ids(body.marketingKnowledge)).toEqual(['mk1']);
    expect(body.users.find((u: Any) => u.id === 'u3').commissionRate).toBe(0.15);
    expect(body.navConfig).toHaveLength(ALL_TABS.length);
  });
  it('צופה בקורסים בלבד — לא יכול לערוך ולא למחוק', async () => {
    OFFICE();
    const r = await patch({
      courses: { upsert: [], update: [{ id: 'co1', title: 'שונה' }], delete: [] },
      contentItems: { upsert: [], update: [], delete: ['ci1'] },
    });
    expect(r.body.refused).toBe(2);
    expect(row('courses', 'co1').title).toBe('קורס 1');
    expect(row('content_items', 'ci1')).toBeDefined();
  });
  it('יכול לעבוד בשיווק ולשנות סטטוסים', async () => {
    OFFICE();
    const r = await patch(
      { marketingKnowledge: { upsert: [{ id: 'mk2', category: 'audience', title: 'מטפלים', content: '...' }], update: [], delete: [] } },
      { statuses: [{ id: 'new', label: 'חדש' }, { id: 'hot', label: 'חם' }] },
    );
    expect(r.body.refused).toBe(0);
    expect(row('marketing_knowledge', 'mk2')).toBeDefined();
    expect(row('crm_config', CONFIG_ID).statuses).toHaveLength(2);
  });
  it('לא יכול לשנות משתמשים ותפקידים (אחרת היה הופך את עצמו למנהל)', async () => {
    OFFICE();
    await patch({}, { users: [{ id: 'u5', name: 'מירב', role: 'admin' }] });
    expect((row('crm_config', CONFIG_ID).users as Any[]).find(u => u.id === 'u5').role).toBe('office_manager');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('מנהל', () => {
  it('רואה הכל — אבל אף פעם לא סיסמה, ולא את מונה ה-AI הפנימי', async () => {
    ADMIN();
    const { body } = await get();
    expect(JSON.stringify(body)).not.toContain('password');
    expect(JSON.stringify(body)).not.toContain('legacy-secret');
    expect(ids(body.marketingKnowledge)).toEqual(['mk1']);
    expect(body.users.find((u: Any) => u.id === 'u3').email).toBe('dana@x.com');
  });
  it('סיסמה שנשלחת בטעות בהגדרות לא נשמרת', async () => {
    ADMIN();
    await patch({}, { users: [{ id: 'u2', name: 'יוסי', role: 'salesperson', password: 'oops' }] });
    expect(JSON.stringify(row('crm_config', CONFIG_ID).users)).not.toContain('oops');
  });
  it('יכול לערוך ולמחוק קורסים', async () => {
    ADMIN();
    const r = await patch({ courses: { upsert: [], update: [{ id: 'co1', title: 'חדש' }], delete: [] } });
    expect(r.body.refused).toBe(0);
    expect(row('courses', 'co1').title).toBe('חדש');
  });
  it('אי אפשר לדרוס או למחוק את מונה ה-AI דרך שמירה רגילה', async () => {
    ADMIN();
    await patch({ marketingKnowledge: { upsert: [], update: [{ id: '_ai_usage_counter', content: '{"count":0}' }], delete: ['_ai_usage_counter'] } });
    expect(row('marketing_knowledge', '_ai_usage_counter').content).toBe('{}');
  });
  it('כל אוסף שהמסך שומר (COLLECTIONS ב-src/sync.ts) באמת נשמר בשרת', async () => {
    ADMIN();
    const table: Record<string, string> = {
      leads: 'leads', activities: 'activities', tasks: 'tasks', clients: 'clients',
      chatMessages: 'chat_messages', pinnedNotes: 'pinned_notes', courses: 'courses', lessons: 'lessons',
      contentItems: 'content_items', marketingKnowledge: 'marketing_knowledge', marketingMessages: 'marketing_messages',
    };
    const sample: Record<string, Any> = {
      leads: { assigned_to: 'u1' }, activities: { lead_id: 'l1' }, tasks: { assigned_to: 'u1' },
      clients: { leadId: 'l1' }, chatMessages: { fromUserId: 'u1', readBy: [] }, pinnedNotes: { userId: 'u1' },
      courses: {}, lessons: {}, contentItems: {}, marketingKnowledge: { category: 'style' }, marketingMessages: {},
    };
    const changes = Object.fromEntries(COLLECTIONS.map(k => [k, { upsert: [{ id: `new-${k}`, ...sample[k] }], update: [], delete: [] }]));
    await patch(changes);
    for (const k of COLLECTIONS) {
      expect(table[k], `אוסף ${k} חסר במיפוי הבדיקה`).toBeDefined();
      expect(row(table[k], `new-${k}`), `אוסף ${k} לא נשמר`).toBeDefined();
    }
  });
  it('שמירה לא מוחקת רשומות שלא נשלחו (הבאג של איבוד הלידים)', async () => {
    ADMIN();
    await patch({ leads: { upsert: [{ id: 'l9', name: 'חדש', assigned_to: 'u1' }], update: [], delete: [] } });
    expect(ids(h.db.rows('leads'))).toEqual(['l1', 'l2', 'l9']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('תפקיד לא מוכר', () => {
  it('לא מקבל נתונים ולא יכול לשמור', async () => {
    as('Secretary', 'u4');
    expect((await get()).status).toBe(403);
    const r = await patch({ leads: { upsert: [], update: [], delete: ['l1'] } });
    expect(r.status).toBe(403);
    expect(row('leads', 'l1')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('מחולל המסרים (AI)', () => {
  const generate = async () => {
    const res = fakeRes();
    await generateHandler({ method: 'POST', headers: {}, body: { rawContent: 'חומר', ctaType: 'nurture' } } as Any, res as Any);
    return res;
  };
  it('נציג ומזכירות לא יכולים להפעיל אותו', async () => {
    SALES();
    expect((await generate()).statusCode).toBe(403);
    SECRETARY();
    expect((await generate()).statusCode).toBe(403);
  });
  it('ניהול משרד יכול להפעיל אותו', async () => {
    OFFICE();
    expect((await generate()).statusCode).toBe(200);
  });
  it('אחרי 30 הפעלות ביום — נעצר עם הודעה בעברית', async () => {
    ADMIN();
    for (let i = 0; i < 30; i++) expect((await generate()).statusCode).toBe(200);
    const res = await generate();
    expect(res.statusCode).toBe(429);
    expect((res.body as Any).message).toContain('מכסה היומית');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('העלאת קבצי קורסים', () => {
  const ask = async (body: Any) => {
    const res = fakeRes();
    await uploadUrlHandler({ method: 'POST', headers: {}, body } as Any, res as Any);
    return res;
  };
  it('רק מי שרשאי לערוך קורסים (מנהל) מקבל כתובת העלאה', async () => {
    SALES();
    expect((await ask({ folder: 'uploads', ext: 'pdf' })).statusCode).toBe(403);
    OFFICE();
    expect((await ask({ folder: 'uploads', ext: 'pdf' })).statusCode).toBe(403);
    ADMIN();
    const res = await ask({ folder: 'lessons/le1', ext: 'pdf' });
    expect(res.statusCode).toBe(200);
    expect((res.body as Any).path).toMatch(/^lessons\/le1\/.+\.pdf$/);
  });
  it('אי אפשר לבקש העלאה לתיקייה שהאפליקציה לא משתמשת בה', async () => {
    ADMIN();
    expect((await ask({ folder: '../secret', ext: 'pdf' })).statusCode).toBe(400);
    expect((await ask({ folder: 'uploads', ext: 'p/df' })).statusCode).toBe(400);
  });
});
