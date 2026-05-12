/**
 * POST /api/users/change-password
 * שינוי סיסמא של משתמש ע"י מנהל — ללא צורך במייל.
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

  const { crm_user_id, new_password } = req.body as {
    crm_user_id: string;
    new_password: string;
  };

  if (!crm_user_id || !new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'נדרש crm_user_id וסיסמא של לפחות 6 תווים' });
  }

  // מציאת auth_user_id מה-crm_users
  const { data: row, error: findErr } = await supabaseAdmin
    .from('crm_users')
    .select('auth_user_id')
    .eq('crm_user_id', crm_user_id)
    .single();

  if (findErr || !row) {
    return res.status(404).json({ error: 'המשתמש לא נמצא' });
  }

  // עדכון הסיסמא ב-Supabase Auth
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    row.auth_user_id,
    { password: new_password },
  );

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  return res.status(200).json({ ok: true });
}
