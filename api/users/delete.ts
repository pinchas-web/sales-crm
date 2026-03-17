/**
 * POST /api/users/delete
 * מחיקת משתמש — מנהל בלבד.
 * מוחק מ-crm_users ומ-Supabase Auth.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../_lib/auth';
import { supabaseAdmin }   from '../_lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser || crmUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { crm_user_id } = req.body as { crm_user_id: string };
  if (!crm_user_id) return res.status(400).json({ error: 'Missing crm_user_id' });

  // מניעת מחיקה עצמית
  if (crm_user_id === crmUser.crm_user_id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  // מציאת ה-auth_user_id לפי crm_user_id
  const { data: row, error: findError } = await supabaseAdmin
    .from('crm_users')
    .select('auth_user_id')
    .eq('crm_user_id', crm_user_id)
    .single();

  if (findError || !row) {
    return res.status(404).json({ error: 'User not found' });
  }

  // מחיקה מ-crm_users
  await supabaseAdmin.from('crm_users').delete().eq('crm_user_id', crm_user_id);

  // מחיקה מ-Supabase Auth
  await supabaseAdmin.auth.admin.deleteUser(row.auth_user_id);

  return res.status(200).json({ ok: true });
}
