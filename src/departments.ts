/**
 * מבנה המערכת: שכבה משותפת + חמש מחלקות (תרשים: docs/planning/02-החלטות.md, החלטות 76–79).
 * המחלקה קובעת רק איך התפריט מסודר. מה כל אחד רואה נקבע בנפרד, לפי התפקיד (api/_lib/permissions.ts).
 */
import type { TabId } from './permissions';

/** לשוניות שכל המחלקות עובדות עליהן */
export const SHARED_TABS: TabId[] = ['home', 'tasks', 'chat', 'data'];

export interface Department {
  id: string;
  label: string;
  icon: string;
  /** תתי המחלקות, לפי הסדר שבו הן מוצגות */
  tabs: TabId[];
}

export const DEPARTMENTS: Department[] = [
  { id: 'marketing',  label: 'שיווק',         icon: '📣', tabs: ['marketing'] },
  { id: 'sales',      label: 'מכירות',        icon: '🤝', tabs: ['leads'] },
  { id: 'operations', label: 'תפעול',         icon: '🎓', tabs: ['clients'] },
  { id: 'products',   label: 'מוצרים ופיתוח', icon: '📦', tabs: ['products', 'courses'] },
  { id: 'finance',    label: 'פיננסים',       icon: '💰', tabs: ['finance'] },
];
