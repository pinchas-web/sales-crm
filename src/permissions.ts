/**
 * הרשאות בצד המסך — אותה טבלה שהשרת משתמש בה (api/_lib/permissions.ts).
 * המסך רק מציג לפיה; ההגנה האמיתית היא בשרת.
 */
import type { AppState } from './types';
import { permsFor } from '../api/_lib/permissions';

export { ROLES, ROLE_LABELS, permsFor, tabsFor, isRole } from '../api/_lib/permissions';
export type { Role, TabId, Permissions } from '../api/_lib/permissions';

/** התפקיד של המשתמש הנוכחי (או המשתמש הנצפה ב"צפה כ...") */
export function roleOf(state: AppState): string | undefined {
  return state.currentUserRole ?? state.users.find(u => u.id === state.currentUserId)?.role;
}

export function permsOf(state: AppState) {
  return permsFor(roleOf(state));
}
