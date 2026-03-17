/**
 * POST /api/users/create
 * יצירת משתמש חדש — מנהל בלבד.
 * יוצר Supabase Auth user + רשומה ב-crm_users.
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

  const { email, password, crm_user_id, role } = req.body as {
    email: string;
    password: string;
    crm_user_id: string;
    role: 'admin' | 'salesperson';
  };

  if (!email || !password || !crm_user_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // יצירת משתמש ב-Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // הוספה ל-crm_users
  const { error: dbError } = await supabaseAdmin
    .from('crm_users')
    .insert({
      auth_user_id: authData.user.id,
      crm_user_id,
      role,
      email,
    });

  if (dbError) {
    // rollback — מחיקת ה-auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: dbError.message });
  }

  return res.status(200).json({ auth_user_id: authData.user.id });
}
