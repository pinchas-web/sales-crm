/**
 * שרת הדגמה מקומי — מריץ את קוד השרת האמיתי (api/state.ts וכו') מול מסד מדומה בזיכרון,
 * עם נתונים לדוגמה. בשביל להדגים מסכים לפי תפקיד בלי לגעת במסד האמיתי.
 *
 * הרצה (שני חלונות):
 *   npx tsx scripts/demo-server.ts     ← ה-API המדומה, על פורט 3001 (vite dev מפנה לשם את /api)
 *   npx vite --mode demo               ← המסך, עם .env.demo (כתובות מדומות, בלי מפתחות אמיתיים)
 *
 * "התחברות" בהדגמה: שומרים ב-localStorage תחת sb-localhost-auth-token session מדומה
 * שה-access_token שלו הוא auth-u1 (מנהל) / auth-u2 (נציג) / auth-u4 (מזכירות) / auth-u5 (ניהול משרד).
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { FakeDb } from '../tests/fakeSupabase';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'demo';

const db = new FakeDb();
const { supabaseAdmin } = await import('../api/_lib/supabaseAdmin');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;
admin.from = (t: string) => db.from(t);
admin.storage = db.storage;
admin.auth.getUser = async (token: string) => ({
  data: { user: token.startsWith('auth-') ? { id: token, email: `${token}@demo`, email_confirmed_at: '2026-01-01' } : null },
  error: token.startsWith('auth-') ? null : { message: 'bad token' },
});

const routes: Record<string, string> = {
  '/api/state': '../api/state',
  '/api/auth/me': '../api/auth/me',
  '/api/marketing-generate': '../api/marketing-generate',
  '/api/storage/upload-url': '../api/storage/upload-url',
};

const today = new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();
db.reset({
  crm_users: [
    { auth_user_id: 'auth-u1', crm_user_id: 'u1', role: 'admin',          email: 'admin@demo' },
    { auth_user_id: 'auth-u2', crm_user_id: 'u2', role: 'salesperson',    email: 'yossi@demo' },
    { auth_user_id: 'auth-u3', crm_user_id: 'u3', role: 'salesperson',    email: 'dana@demo' },
    { auth_user_id: 'auth-u4', crm_user_id: 'u4', role: 'secretary',      email: 'ruti@demo' },
    { auth_user_id: 'auth-u5', crm_user_id: 'u5', role: 'office_manager', email: 'merav@demo' },
  ],
  crm_config: [{
    id: '00000000-0000-0000-0000-000000000001',
    users: [
      { id: 'u1', name: 'פנחס (מנהל)',   role: 'admin',          commissionRate: 0,    email: 'admin@demo' },
      { id: 'u2', name: 'יוסי (נציג)',   role: 'salesperson',    commissionRate: 0.1,  email: 'yossi@demo', phone: '050-0000001' },
      { id: 'u3', name: 'דנה (נציגה)',   role: 'salesperson',    commissionRate: 0.15, email: 'dana@demo',  phone: '050-0000002' },
      { id: 'u4', name: 'רותי (מזכירות)', role: 'secretary',     commissionRate: 0,    email: 'ruti@demo' },
      { id: 'u5', name: 'מירב (ניהול משרד)', role: 'office_manager', commissionRate: 0, email: 'merav@demo' },
    ],
    statuses: [
      { id: 'new',  label: 'חדש',        color: '#dbeafe', textColor: '#1e40af', order: 0 },
      { id: 'talk', label: 'בשיחה',       color: '#fef3c7', textColor: '#92400e', order: 1 },
      { id: 'won',  label: 'נסגר ✓',      color: '#dcfce7', textColor: '#166534', order: 2, isFinal: true, isWon: true },
    ],
    products: [{ id: 'p1', name: 'ביזנסתרפיה', shortDescription: 'תוכנית הדגל', description: 'תיאור לדוגמה של התוכנית:\nלמי היא מתאימה, מה מקבלים, ואיך היא בנויה.', syllabusText: 'מודול 1 — נושא לדוגמה\nמודול 2 — נושא לדוגמה\nמודול 3 — נושא לדוגמה', price: 5700, category: 'תוכנית', active: true, testimonials: [{ id: 'tm1', name: 'ממליצה לדוגמה', phone: '050-0000009', note: 'ציטוט לדוגמה' }], onboardingSteps: [{ id: 's1', title: 'חתימה על חוזה', order: 0 }, { id: 's2', title: 'תשלום ראשון', order: 1 }] }],
    dropdown_options: { sources: ['אתר', 'פייסבוק'], professions: ['מטפל/ת'], audience_types: ['כללי'], programs: ['ביזנסתרפיה'] },
    custom_fields: [], labels: {},
    nav_config: ['home', 'leads', 'clients', 'products', 'tasks', 'data', 'chat', 'courses', 'marketing', 'settings']
      .map((id, order) => ({ id, visible: true, order })),
    sales_targets: { u2: 5, u3: 4 },
    automation_rules: [], table_column_prefs: {}, daily_summary_email: '',
  }],
  leads: [
    { id: 'l1', name: 'ליד לדוגמה א׳', phone: '050-1111111', assigned_to: 'u2', status: 'talk', score: 80, created_at: now, updated_at: now, interested_in: ['p1'] },
    { id: 'l2', name: 'ליד לדוגמה ב׳', phone: '050-2222222', assigned_to: 'u2', status: 'new',  score: 55, created_at: now, updated_at: now, interested_in: [] },
    { id: 'l3', name: 'ליד לדוגמה ג׳', phone: '050-3333333', assigned_to: 'u3', status: 'new',  score: 70, created_at: now, updated_at: now, interested_in: [] },
    { id: 'l4', name: 'ליד לדוגמה ד׳', phone: '050-4444444', assigned_to: 'u3', status: 'won',  score: 90, created_at: now, updated_at: now, interested_in: ['p1'], deal_value: 5700 },
  ],
  activities: [],
  tasks: [
    { id: 't1', assigned_to: 'u2', note: 'לחזור לליד א׳', due_date: today, done: false, lead_id: 'l1' },
    { id: 't2', assigned_to: 'u3', note: 'לשלוח הצעה לליד ג׳', due_date: today, done: false, lead_id: 'l3' },
  ],
  clients: [{ id: 'c1', lead_id: 'l4', product_id: 'p1', deal_value: 5700, closed_at: now, assigned_to: 'u4', onboarding_progress: {}, custom_steps: [] }],
  chat_messages: [], pinned_notes: [],
  courses: [{ id: 'co1', title: 'קורס לדוגמה', description: '', color: '#6366f1', order: 0 }],
  lessons: [{ id: 'le1', course_id: 'co1', title: 'שיעור 1', order: 0 }],
  content_items: [],
  marketing_knowledge: [], marketing_messages: [],
});

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const path = (req.url ?? '').split('?')[0];
  const mod = routes[path];
  if (!mod) { res.statusCode = 404; res.end('{}'); return; }
  const { default: handler } = await import(mod);
  const vreq = { method: req.method, url: req.url, headers: req.headers, body: await readBody(req) };
  const vres = {
    status(code: number) { res.statusCode = code; return vres; },
    json(body: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return vres; },
  };
  await handler(vreq, vres);
}).listen(3001, () => console.log('demo API on http://localhost:3001'));
