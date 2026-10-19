/**
 * סנכרון בטוח לכמה משתמשים במקביל.
 *
 * במקום לשלוח את כל ה-AppState בכל שינוי (מה שמחק נתונים של משתמשים אחרים),
 * הלקוח שומר "תמונת מצב" של מה שהשרת יודע (synced), ושולח רק את ההפרש:
 * שורות חדשות (upsert), רק השדות שהשתנו בשורות קיימות (update),
 * ids שנמחקו (delete), ומפתחות קונפיגורציה שהשתנו.
 *
 * כשמגיע עדכון מהשרת (רענון תקופתי), השינויים המקומיים שעוד לא נשמרו
 * מוחלים מעליו ברמת השדה (rebase) — כך עריכות של שני אנשים לא דורסות זו את זו.
 */
import type { AppState } from './types';

export const COLLECTIONS = [
  'leads', 'activities', 'tasks', 'clients', 'chatMessages', 'pinnedNotes',
  'courses', 'lessons', 'contentItems', 'marketingKnowledge', 'marketingMessages',
] as const;

export const CONFIG_KEYS = [
  'users', 'statuses', 'products', 'dropdownOptions', 'customFields', 'labels',
  'navConfig', 'salesTargets', 'automationRules', 'tableColumnPrefs', 'dailySummaryEmail',
] as const;

export type CollectionKey = (typeof COLLECTIONS)[number];
export type ConfigKey = (typeof CONFIG_KEYS)[number];

type Row = { id: string } & Record<string, unknown>;

export interface StatePatch {
  changes: Partial<Record<CollectionKey, { upsert: Row[]; update: Row[]; delete: string[] }>>;
  config: Partial<Record<ConfigKey, unknown>>;
  marketingDeletedWeeks?: string[];
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const rowsOf = (s: AppState, k: CollectionKey) => ((s[k] ?? []) as unknown as Row[]);

function changedFields(b: Row, r: Row): string[] {
  return [...new Set([...Object.keys(b), ...Object.keys(r)])].filter(f => !same(b[f], r[f]));
}

export function snapshot(s: AppState): AppState {
  return structuredClone(s);
}

/** בסיס ריק — משמש בהפעלה ראשונה, כשאין עדיין כלום בשרת */
export function emptyBase(s: AppState): AppState {
  const base = { ...s } as Record<string, unknown>;
  for (const k of COLLECTIONS) base[k] = [];
  for (const k of CONFIG_KEYS) base[k] = undefined;
  return base as unknown as AppState;
}

/** ההפרש בין מה שהשרת יודע (base) למצב הנוכחי (cur) */
export function diffState(base: AppState, cur: AppState): StatePatch {
  const patch: StatePatch = { changes: {}, config: {} };
  for (const k of COLLECTIONS) {
    const baseMap = new Map(rowsOf(base, k).map(r => [r.id, r]));
    const curRows = rowsOf(cur, k);
    const curIds = new Set(curRows.map(r => r.id));
    const upsert: Row[] = [];
    const update: Row[] = [];
    for (const r of curRows) {
      const b = baseMap.get(r.id);
      if (!b) { upsert.push(r); continue; }
      const fields = changedFields(b, r);
      if (fields.length) update.push(Object.fromEntries([['id', r.id], ...fields.map(f => [f, r[f]])]) as Row);
    }
    const del = [...baseMap.keys()].filter(id => !curIds.has(id));
    if (upsert.length || update.length || del.length) patch.changes[k] = { upsert, update, delete: del };
  }
  for (const k of CONFIG_KEYS) {
    if (!same(base[k], cur[k])) patch.config[k] = cur[k];
  }
  if (cur.marketingDeletedWeeks?.length) patch.marketingDeletedWeeks = cur.marketingDeletedWeeks;
  return patch;
}

export function isEmptyPatch(p: StatePatch): boolean {
  return !Object.keys(p.changes).length && !Object.keys(p.config).length && !p.marketingDeletedWeeks?.length;
}

/**
 * מצב השרת העדכני + השינויים המקומיים שעוד לא נשמרו (ההפרש בין base ל-cur).
 * שורה שנערכה מקומית: רק השדות שהמשתמש שינה גוברים על גרסת השרת.
 * שורה שנמחקה בשרת בזמן שנערכה מקומית — נשארת מחוקה.
 */
export function rebase(server: AppState, base: AppState, cur: AppState): AppState {
  const out = { ...server } as Record<string, unknown>;
  for (const k of COLLECTIONS) {
    const baseMap = new Map(rowsOf(base, k).map(r => [r.id, r]));
    const curRows = rowsOf(cur, k);
    const curIds = new Set(curRows.map(r => r.id));
    const deletedLocally = new Set([...baseMap.keys()].filter(id => !curIds.has(id)));
    const localChanged = new Map<string, Row>();
    const localAdded: Row[] = [];
    for (const r of curRows) {
      const b = baseMap.get(r.id);
      if (!b) localAdded.push(r);
      else if (!same(b, r)) localChanged.set(r.id, r);
    }
    const serverRows = rowsOf(server, k);
    const serverIds = new Set(serverRows.map(r => r.id));
    const merged = serverRows
      .filter(r => !deletedLocally.has(r.id))
      .map(r => {
        const mine = localChanged.get(r.id);
        if (!mine) return r;
        const next: Row = { ...r };
        for (const f of changedFields(baseMap.get(r.id)!, mine)) next[f] = mine[f];
        return next;
      });
    for (const r of localAdded) {
      if (serverIds.has(r.id)) {
        const i = merged.findIndex(m => m.id === r.id);
        if (i >= 0) merged[i] = r;
      } else merged.push(r);
    }
    out[k] = merged;
  }
  for (const k of CONFIG_KEYS) {
    out[k] = same(base[k], cur[k]) ? server[k] : cur[k];
  }
  out.marketingDeletedWeeks = cur.marketingDeletedWeeks ?? [];
  return out as unknown as AppState;
}
