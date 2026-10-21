/**
 * טבלת ההרשאות של ה-CRM — מקור אמת אחד לשרת ולמסך.
 *
 * השרת (api/state.ts) מסנן לפיה מה נשלח ומה מותר לשמור;
 * המסך (src/App.tsx וכו') מציג לפיה לשוניות וכפתורים.
 * לשונית שלא מופיעה כאן לתפקיד — לא קיימת בשבילו: אין נתונים, אין שם, אין תצוגה.
 *
 * קובץ טהור — בלי תלות ב-Node או בדפדפן, כדי ששני הצדדים יוכלו לייבא אותו.
 */

export type Role = 'admin' | 'office_manager' | 'salesperson' | 'secretary';

export const ROLES: Role[] = ['admin', 'office_manager', 'salesperson', 'secretary'];

export const ROLE_LABELS: Record<Role, string> = {
  admin:          'מנהל',
  office_manager: 'ניהול משרד',
  salesperson:    'נציג מכירות',
  secretary:      'מזכירות',
};

export type TabId =
  | 'home' | 'leads' | 'clients' | 'products' | 'tasks'
  | 'data' | 'chat' | 'courses' | 'marketing' | 'settings';

/** מפתחות הקונפיגורציה (ראו CONFIG_KEYS ב-src/sync.ts) */
export type ConfigKey =
  | 'users' | 'statuses' | 'products' | 'dropdownOptions' | 'customFields' | 'labels'
  | 'navConfig' | 'salesTargets' | 'automationRules' | 'tableColumnPrefs' | 'dailySummaryEmail';

export interface Permissions {
  /** הלשוניות המקסימליות לתפקיד. "לשוניות מותרות" של משתמש רק מצמצמות בתוכן. */
  tabs: TabId[];
  /** רואה ומעדכן את הלידים, המשימות והלקוחות של כולם (אחרת — רק שלו) */
  allRecords: boolean;
  /** מוחק לידים ולקוחות (אחרת — רק סימון "לא רלוונטי") */
  deleteLeads: boolean;
  viewCourses: boolean;
  editCourses: boolean;
  /** לשונית שיווק + מחולל המסרים */
  marketing: boolean;
  /** עורך את קטלוג המוצרים */
  editProducts: boolean;
  /** רואה עמלות, יעדים ופרטי קשר של כל המשתמשים */
  seeAllMoney: boolean;
  /** יוצר משתמשים, משנה סיסמאות ותפקידים, ועורך את העיצוב */
  manageUsers: boolean;
  /** מפתחות קונפיגורציה שמותר לשמור */
  configKeys: ConfigKey[];
}

const ALL_TABS: TabId[] = [
  'home', 'leads', 'clients', 'products', 'tasks', 'data', 'chat', 'courses', 'marketing', 'settings',
];

const OFFICE_CONFIG: ConfigKey[] = [
  'statuses', 'products', 'dropdownOptions', 'customFields', 'labels',
  'navConfig', 'salesTargets', 'automationRules', 'tableColumnPrefs', 'dailySummaryEmail',
];

export const PERMISSIONS: Record<Role, Permissions> = {
  admin: {
    tabs: ALL_TABS,
    allRecords: true, deleteLeads: true,
    viewCourses: true, editCourses: true, marketing: true, editProducts: true,
    seeAllMoney: true, manageUsers: true,
    configKeys: ['users', ...OFFICE_CONFIG],
  },
  office_manager: {
    tabs: ALL_TABS,
    allRecords: true, deleteLeads: true,
    viewCourses: true, editCourses: false, marketing: true, editProducts: true,
    seeAllMoney: true, manageUsers: false,
    configKeys: OFFICE_CONFIG,
  },
  secretary: {
    tabs: ['home', 'leads', 'tasks', 'chat', 'products', 'clients'],
    allRecords: true, deleteLeads: false,
    viewCourses: false, editCourses: false, marketing: false, editProducts: false,
    seeAllMoney: false, manageUsers: false,
    configKeys: [],
  },
  salesperson: {
    tabs: ['home', 'leads', 'tasks', 'chat'],
    allRecords: false, deleteLeads: false,
    viewCourses: false, editCourses: false, marketing: false, editProducts: false,
    seeAllMoney: false, manageUsers: false,
    configKeys: [],
  },
};

export function isRole(role: unknown): role is Role {
  return typeof role === 'string' && (ROLES as string[]).includes(role);
}

/** תפקיד שהמערכת לא מכירה — null: לא רואה כלום ולא כותב כלום */
export function permsFor(role: unknown): Permissions | null {
  return isRole(role) ? PERMISSIONS[role] : null;
}

/** הלשוניות שמשתמש רואה בפועל: התקרה של התפקיד, מצומצמת לפי "לשוניות מותרות" אם הוגדרו */
export function tabsFor(role: unknown, allowedTabs?: string[]): TabId[] {
  const perms = permsFor(role);
  if (!perms) return [];
  if (!allowedTabs || role === 'admin') return perms.tabs;
  // 'settings' לא מופיע ברשימת הבחירה הישנה — משאירים אותו למי שהתפקיד שלו כולל אותו
  return perms.tabs.filter(t => allowedTabs.includes(t) || t === 'settings');
}
