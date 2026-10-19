/**
 * לוח גאנט שיווקי — לוח שנה עברי/לועזי, מועדים, ושמירת התוכנית.
 *
 * התוכנית נשמרת כשורה אחת ב-marketing_knowledge (category='plan', content=JSON),
 * כך שהיא עוברת דרך /api/state הקיים בלי מיגרציה.
 * category='plan' מסונן ממאגר הידע ומהקשר ה-AI (marketing-generate).
 */
import type { AppState, MarketingKnowledge, MarketingPlan, MarketingPlanItem, MarketingPlanStatus, MarketingPlanTrack } from '../../types';

export const PLAN_ROW_ID = 'marketing-plan';

// ── טווח הלוח: א׳ חשוון – ל׳ ניסן תשפ״ז ────────────────────────────────────────
const DAY = 864e5;
export const PLAN_START = Date.UTC(2026, 9, 12);   // 12.10.2026 = א׳ בחשוון תשפ״ז
export const PLAN_DAYS  = 208;                     // עד 7.5.2027 = ל׳ בניסן תשפ״ז
export const PLAN_MIN_ISO = '2026-10-12';
export const PLAN_MAX_ISO = '2027-05-07';

export const STATUS_LABELS: Record<MarketingPlanStatus, string> = {
  idea: 'רעיון', planned: 'מתוכנן', doing: 'בביצוע', done: 'בוצע',
};

export const TRACK_COLORS = ['#C7263A', '#B08D44', '#3D6B73', '#6B4E7A', '#5E7034', '#A8234A', '#4A5A86', '#7A5A3A'];

const DEFAULT_TRACKS: MarketingPlanTrack[] = [
  { id: 'launch',  name: 'השקות ומבצעים',     color: 0 },
  { id: 'webinar', name: 'וובינרים וסדנאות',  color: 1 },
  { id: 'content', name: 'תוכן ורשתות',       color: 2 },
  { id: 'email',   name: 'מיילים ווואטסאפ',   color: 3 },
  { id: 'ads',     name: 'פרסום ממומן',       color: 6 },
  { id: 'collab',  name: 'שיתופי פעולה',      color: 4 },
];

// ── תאריכים ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const clampDay = (i: number) => Math.max(0, Math.min(PLAN_DAYS - 1, i));

export function isoOf(i: number): string {
  const d = new Date(PLAN_START + i * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function dayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - PLAN_START) / DAY);
}

const utcDate = (i: number) => new Date(PLAN_START + i * DAY + 12 * 36e5);
export const weekday = (i: number) => new Date(PLAN_START + i * DAY).getUTCDay();

/** מספר עברי (1–30) באותיות: ח׳, ט״ו, כ״ב */
export function gematria(n: number): string {
  if (n === 15) return 'ט״ו';
  if (n === 16) return 'ט״ז';
  const tens = ['', 'י', 'כ', 'ל'][Math.floor(n / 10)];
  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'][n % 10];
  const s = tens + units;
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

const fHeb = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const fGregMonth = new Intl.DateTimeFormat('he', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** יום וחודש עבריים לכל יום בלוח — מחושב פעם אחת */
export const HEB_DAY: number[] = [];
export const HEB_MONTH: string[] = [];
for (let i = 0; i < PLAN_DAYS; i++) {
  const parts = fHeb.formatToParts(utcDate(i));
  HEB_DAY.push(Number(parts.find(p => p.type === 'day')?.value ?? 0));
  HEB_MONTH.push(parts.find(p => p.type === 'month')?.value ?? '');
}

export const hebDate = (i: number) => `${gematria(HEB_DAY[i])} ב${HEB_MONTH[i]}`;
export const gregMonthLabel = (i: number) => fGregMonth.format(utcDate(i));
export const gregMonthKey = (i: number) => { const d = new Date(PLAN_START + i * DAY); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
export function gregShort(i: number, withYear = false): string {
  const d = new Date(PLAN_START + i * DAY);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}` + (withYear ? `.${String(d.getUTCFullYear()).slice(2)}` : '');
}
export const WEEKDAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function todayIndex(): number {
  const n = new Date();
  return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - PLAN_START) / DAY);
}

// ── מועדים (נבדקו מול הלוח העברי לשנת תשפ״ז — שנה מעוברת) ────────────────────
// k: j=מועד יהודי · r=ראש חודש · c=חב״ד · g=אזרחי/מסחרי

export type EventKind = 'j' | 'r' | 'c' | 'g';
export interface PlanEvent { d: string; e?: string; k: EventKind; t: string; x: string; fest?: boolean }

export const PLAN_EVENTS: PlanEvent[] = [
  { d: '2026-10-31', k: 'c', t: 'כ׳ חשוון', x: 'הולדת הרבי הרש״ב · שבת' },
  { d: '2026-11-11', k: 'r', t: 'ר״ח כסלו', x: 'ראש חודש כסלו (10–11.11)' },
  { d: '2026-11-29', k: 'c', t: 'י״ט כסלו', x: 'ראש השנה לחסידות · יום א׳' },
  { d: '2026-12-04', e: '2026-12-12', k: 'j', t: 'חנוכה', x: 'נר ראשון: יום ו׳ 4.12 בערב · זאת חנוכה: שבת 12.12', fest: true },
  { d: '2026-12-15', k: 'c', t: 'ה׳ טבת', x: 'דידן נצח · יום ג׳' },
  { d: '2026-12-20', k: 'j', t: 'צום י׳ בטבת', x: 'יום א׳' },
  { d: '2027-01-09', k: 'r', t: 'ר״ח שבט', x: 'שבת' },
  { d: '2027-01-18', k: 'c', t: 'י׳ שבט', x: 'יום ההילולא של הריי״צ ויום קבלת הנשיאות · יום ב׳' },
  { d: '2027-01-23', k: 'j', t: 'ט״ו בשבט', x: 'שבת' },
  { d: '2027-01-30', k: 'c', t: 'כ״ב שבט', x: 'יום ההילולא של הרבנית חיה מושקא · שבת' },
  { d: '2027-02-07', e: '2027-02-08', k: 'r', t: 'ר״ח אדר א׳', x: 'ל׳ שבט – א׳ אדר א׳' },
  { d: '2027-02-21', k: 'j', t: 'פורים קטן', x: 'י״ד אדר א׳ · יום א׳' },
  { d: '2027-03-09', e: '2027-03-10', k: 'r', t: 'ר״ח אדר ב׳', x: 'ל׳ אדר א׳ – א׳ אדר ב׳' },
  { d: '2027-03-22', e: '2027-03-24', k: 'j', t: 'פורים', x: 'תענית אסתר: ב׳ 22.3 · פורים: ג׳ 23.3 · שושן פורים: ד׳ 24.3', fest: true },
  { d: '2027-04-08', k: 'r', t: 'ר״ח ניסן', x: 'יום ה׳' },
  { d: '2027-04-18', k: 'c', t: 'י״א ניסן', x: 'יום הולדת הרבי · יום א׳' },
  { d: '2027-04-21', e: '2027-04-28', k: 'j', t: 'פסח', x: 'ערב פסח: ד׳ 21.4 · שביעי של פסח: ד׳ 28.4', fest: true },
  { d: '2027-05-04', k: 'j', t: 'יום השואה', x: 'כ״ז בניסן · יום ג׳' },
  { d: '2026-10-25', k: 'g', t: 'שעון חורף', x: 'מעבר לשעון חורף · יום א׳' },
  { d: '2026-11-27', e: '2026-11-30', k: 'g', t: 'בלאק פריידיי ← סייבר מאנדיי', x: 'בלאק פריידיי: ו׳ 27.11 · סייבר מאנדיי: ב׳ 30.11' },
  { d: '2027-01-01', k: 'g', t: '1 בינואר', x: 'השנה האזרחית החדשה · יום ו׳' },
  { d: '2027-03-08', k: 'g', t: 'יום האישה', x: 'יום האישה הבינלאומי · יום ב׳' },
  { d: '2027-03-26', k: 'g', t: 'שעון קיץ', x: 'מעבר לשעון קיץ · יום ו׳' },
];

// ── קריאה וכתיבה של התוכנית ב-AppState ───────────────────────────────────────

const STATUSES = Object.keys(STATUS_LABELS) as MarketingPlanStatus[];

function normalize(raw: unknown): MarketingPlan {
  const r = (raw ?? {}) as { tracks?: unknown[]; items?: unknown[] };
  const tracks: MarketingPlanTrack[] = (Array.isArray(r.tracks) ? r.tracks : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !!(t as Record<string, unknown>).id)
    .map(t => ({ id: String(t.id), name: String(t.name ?? 'ערוץ'), color: Math.abs(Number(t.color) || 0) % TRACK_COLORS.length }));
  const items: MarketingPlanItem[] = (Array.isArray(r.items) ? r.items : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !!(x as Record<string, unknown>).id && /^\d{4}-\d\d-\d\d$/.test(String((x as Record<string, unknown>).start)) && /^\d{4}-\d\d-\d\d$/.test(String((x as Record<string, unknown>).end)))
    .map(x => ({
      id: String(x.id),
      track: String(x.track ?? ''),
      title: String(x.title ?? ''),
      start: String(x.start),
      end: String(x.end),
      status: STATUSES.includes(x.status as MarketingPlanStatus) ? x.status as MarketingPlanStatus : 'planned',
      notes: String(x.notes ?? ''),
    }));
  return { tracks, items };
}

/** התוכנית השמורה, או ערוצי ברירת מחדל כשעדיין לא נשמרה */
export function readPlan(state: AppState): MarketingPlan {
  const row = state.marketingKnowledge.find(k => k.id === PLAN_ROW_ID);
  if (!row) return { tracks: DEFAULT_TRACKS, items: [] };
  try {
    return normalize(JSON.parse(row.content));
  } catch {
    return { tracks: DEFAULT_TRACKS, items: [] };
  }
}

export function writePlan(state: AppState, plan: MarketingPlan): AppState {
  const row: MarketingKnowledge = {
    id: PLAN_ROW_ID,
    category: 'plan',
    title: 'תוכנית שיווק — גאנט',
    content: JSON.stringify(plan),
    updatedAt: new Date().toISOString(),
  };
  const exists = state.marketingKnowledge.some(k => k.id === PLAN_ROW_ID);
  return {
    ...state,
    marketingKnowledge: exists
      ? state.marketingKnowledge.map(k => (k.id === PLAN_ROW_ID ? row : k))
      : [...state.marketingKnowledge, row],
  };
}

/** סידור פעילויות חופפות בשורה אחת לנתיבים */
export function assignLanes(items: MarketingPlanItem[]): { lane: Record<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const ends: number[] = [];
  const lane: Record<string, number> = {};
  for (const it of sorted) {
    const s = dayOf(it.start);
    let l = ends.findIndex(e => e < s);
    if (l < 0) { l = ends.length; ends.push(0); }
    ends[l] = dayOf(it.end);
    lane[it.id] = l;
  }
  return { lane, count: Math.max(1, ends.length) };
}
