/**
 * שאלונים — בדיקות חישוב, אבטחה ופרטיות. מריצות את קוד השרת האמיתי מול מסד ואחסון מדומים.
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
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));
vi.mock('../api/_lib/questionnaireDelivery', () => ({ finalizeQ: async () => null }));

import handler from '../api/questionnaires';
import {
  QUESTIONNAIRES, scoreAnswers, sanitizeAnswers, overallScore, allQuestions,
} from '../api/_lib/questionnaireDefs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN = { crm_user_id: 'u1', role: 'admin', email: 'p@x.com' };

function seed() {
  h.db.reset({
    crm_config: [{
      id: CONFIG_ID,
      users: [{ id: 'u1', name: 'פנחס', role: 'admin' }, { id: 'u2', name: 'יוסי', role: 'salesperson' }],
      statuses: [{ id: 'new', label: 'חדש', order: 0 }, { id: 'won', label: 'נסגר', order: 1, isFinal: true }],
    }],
    leads: [{ id: 'l1', name: 'דנה כהן', phone: '050-1234567', email: 'dana@x.com', assigned_to: 'u2', status: 'new', score: 0 }],
    activities: [],
  });
  h.db.files.clear();
}

async function call(method: string, opts: { query?: string; body?: Any } = {}) {
  const res = fakeRes();
  await handler({ method, url: `/api/questionnaires${opts.query ?? ''}`, headers: {}, body: opts.body } as Any, res as Any);
  return res as Any;
}

function fullMental(): Record<string, string | number> {
  const a: Record<string, string | number> = { name: 'אבי לוי', email: 'avi@x.com', phone: '052-1112222' };
  for (const q of allQuestions(QUESTIONNAIRES.mental)) if (q.kind === 'scale7') a[q.id] = 4;
  return a;
}

beforeEach(() => { seed(); h.user = null; });

describe('חישוב ציונים', () => {
  it('היגד הפוך מחושב הפוך: 7 בהיגד שלילי = ציון 0 בתחום', () => {
    const def = QUESTIONNAIRES.mental;
    const a: Record<string, number> = { f1: 7, f2: 7, f3: 7 };
    const focus = scoreAnswers(def, a).find(s => s.id === 'focus')!;
    expect(focus.pct).toBe(0);
    expect(focus.level).toBe('focus');
  });
  it('היגד חיובי: 7 = ציון 100', () => {
    const goals = scoreAnswers(QUESTIONNAIRES.mental, { g1: 7, g2: 7, g3: 7, g4: 7 }).find(s => s.id === 'goals')!;
    expect(goals.pct).toBe(100);
  });
  it('היגד עם כיוון 0 לא נכנס לציון', () => {
    const c = scoreAnswers(QUESTIONNAIRES.mental, { b2: 7, b5: 4 }).find(s => s.id === 'confidence')!;
    expect(c.answered).toBe(1);
  });
  it('11 תחומים מקבלים ציון כשהכל מולא, וממוצע 4 = 50', () => {
    const scores = scoreAnswers(QUESTIONNAIRES.mental, fullMental());
    expect(scores).toHaveLength(11);
    expect(overallScore(scores)).toBe(50);
  });
});

describe('ניקוי תשובות', () => {
  it('שאלה לא מוכרת נזרקת, וטקסט ארוך נחתך', () => {
    const a = sanitizeAnswers(QUESTIONNAIRES.strategy, { name: 'משה', phone: '0501234567', evil: 'x', business: 'א'.repeat(20000) }, false)!;
    expect(a.evil).toBeUndefined();
    expect(String(a.business).length).toBe(8000);
  });
  it('בלי שדה חובה — נדחה', () => {
    expect(sanitizeAnswers(QUESTIONNAIRES.strategy, { name: 'משה' }, false)).toBeNull();
  });
  it('דירוג מחוץ לטווח — נדחה', () => {
    const a = fullMental(); a.g1 = 9;
    expect(sanitizeAnswers(QUESTIONNAIRES.mental, a, false)).toBeNull();
  });
  it('בקישור אישי לא מבקשים שם, טלפון ומייל', () => {
    const a = fullMental(); delete a.name; delete a.email; delete a.phone;
    expect(sanitizeAnswers(QUESTIONNAIRES.mental, a, true)).not.toBeNull();
  });
});

describe('הרשאות', () => {
  it('בלי התחברות — אין גישה לתשובות', async () => {
    expect((await call('GET', { query: '?leadId=l1' })).statusCode).toBe(401);
  });
  it('נציג מכירות ומזכירות לא רואים שאלונים (מידע רגיש)', async () => {
    for (const role of ['salesperson', 'secretary']) {
      h.user = { crm_user_id: 'u2', role, email: 'y@x.com' };
      expect((await call('GET', { query: '?leadId=l1' })).statusCode).toBe(403);
      expect((await call('POST', { body: { action: 'create', leadId: 'l1', qid: 'mental' } })).statusCode).toBe(403);
    }
  });
  it('רק מנהל מוחק', async () => {
    h.user = ADMIN;
    const created = (await call('POST', { body: { action: 'create', leadId: 'l1', qid: 'strategy' } })).body.item;
    h.user = { crm_user_id: 'u5', role: 'office_manager', email: 'm@x.com' };
    expect((await call('POST', { body: { action: 'delete', token: created.token } })).statusCode).toBe(403);
    h.user = ADMIN;
    expect((await call('POST', { body: { action: 'delete', token: created.token } })).statusCode).toBe(200);
  });
});

describe('קישור אישי', () => {
  it('הדף הציבורי מקבל רק סוג שאלון ושם — בלי טלפון, מייל או תשובות', async () => {
    h.user = ADMIN;
    const item = (await call('POST', { body: { action: 'create', leadId: 'l1', qid: 'mental' } })).body.item;
    h.user = null;
    const pub = (await call('GET', { query: `?public=${item.token}` })).body;
    expect(Object.keys(pub).sort()).toEqual(['firstName', 'name', 'qid', 'status']);
    expect(JSON.stringify(pub)).not.toContain('050');
    expect(JSON.stringify(pub)).not.toContain('@');
  });
  it('מילוי → נשמר בתיק הליד עם ציונים ופעילות, ואי אפשר לשלוח פעמיים', async () => {
    h.user = ADMIN;
    const item = (await call('POST', { body: { action: 'create', leadId: 'l1', qid: 'mental' } })).body.item;
    h.user = null;
    const a = fullMental(); delete a.name; delete a.email; delete a.phone;
    const ok = await call('POST', { body: { action: 'submit', token: item.token, answers: a, elapsedMs: 60_000 } });
    expect(ok.statusCode).toBe(200);
    const again = await call('POST', { body: { action: 'submit', token: item.token, answers: a, elapsedMs: 60_000 } });
    expect(again.statusCode).toBe(409);
    expect(h.db.tables.get('activities')!.some((x: Any) => x.lead_id === 'l1')).toBe(true);
    h.user = ADMIN;
    const list = (await call('GET', { query: '?leadId=l1' })).body.items;
    expect(list[0].status).toBe('submitted');
    expect(list[0].scores).toHaveLength(11);
    h.user = null;
    expect((await call('GET', { query: `?public=${item.token}` })).body.status).toBe('done');
  });
  it('קישור שבוטל או פג תוקפו לא מקבל תשובות', async () => {
    h.user = ADMIN;
    const item = (await call('POST', { body: { action: 'create', leadId: 'l1', qid: 'strategy' } })).body.item;
    await call('POST', { body: { action: 'cancel', token: item.token } });
    h.user = null;
    const r = await call('POST', { body: { action: 'submit', token: item.token, answers: {}, elapsedMs: 60_000 } });
    expect(r.statusCode).toBe(410);
  });
  it('קישור מזויף לא נמצא', async () => {
    expect((await call('GET', { query: `?public=${'a'.repeat(32)}` })).statusCode).toBe(404);
    expect((await call('GET', { query: '?public=../../etc' })).statusCode).toBe(404);
  });
});

describe('קישור כללי', () => {
  const strategy = (phone: string) => ({ action: 'submit', qid: 'strategy', answers: { name: 'רון', phone }, elapsedMs: 60_000 });

  it('טלפון קיים (בכל פורמט) → משויך לליד הקיים, בלי ליד כפול', async () => {
    const r = await call('POST', { body: strategy('+972 50 123 4567') });
    expect(r.statusCode).toBe(200);
    expect(h.db.tables.get('leads')!).toHaveLength(1);
    h.user = ADMIN;
    const list = (await call('GET', { query: '?leadId=l1' })).body.items;
    expect(list[0].match).toBe('phone');
  });
  it('טלפון חדש → נפתח ליד חדש, משויך למנהל, בסטטוס הראשון', async () => {
    await call('POST', { body: strategy('0549998888') });
    const lead = h.db.tables.get('leads')!.find((l: Any) => l.phone === '0549998888') as Any;
    expect(lead).toBeTruthy();
    expect(lead.assigned_to).toBe('u1');
    expect(lead.status).toBe('new');
  });
  it('מלכודת רובוטים: שדה נסתר מלא → "הצלחה" מזויפת בלי לשמור כלום', async () => {
    const r = await call('POST', { body: { ...strategy('0547776666'), hp: 'http://spam' } });
    expect(r.statusCode).toBe(200);
    expect(h.db.tables.get('leads')!).toHaveLength(1);
  });
  it('מילוי מהיר מדי — נדחה', async () => {
    expect((await call('POST', { body: { ...strategy('0547776666'), elapsedMs: 3000 } })).statusCode).toBe(400);
  });
});
