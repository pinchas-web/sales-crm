/**
 * ולידציית JWT ומציאת משתמש CRM מה-Authorization header.
 * כל serverless function קורא לפונקציה זו בתחילתו.
 */
import { supabaseAdmin } from './supabaseAdmin';

export interface CrmUser {
  crm_user_id: string;   // 'u1' | 'u2' | 'u3' ...
  role:        'admin' | 'salesperson';
  email:       string;
}

/**
 * מאמת את ה-Bearer token ומחזיר את פרטי משתמש ה-CRM.
 * מחזיר null אם ה-token לא תקין או המשתמש לא קיים ב-crm_users.
 */
export async function validateRequest(authHeader: string | undefined): Promise<CrmUser | null> {
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) return null;

  // ולידציה קריפטוגרפית של ה-JWT מול Supabase Auth
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  // מציאת המשתמש ב-crm_users לפי auth UUID
  const { data: crmUser, error: dbError } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id, role, email')
    .eq('auth_user_id', user.id)
    .single();

  if (dbError || !crmUser) return null;

  return crmUser as CrmUser;
}
