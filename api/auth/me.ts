/**
 * GET /api/auth/me
 * מחזיר את פרטי המשתמש המחובר: crm_user_id, name, role.
 * משמש את App.tsx לזיהוי מי נכנס.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../_lib/auth';
import { supabaseAdmin }   from '../_lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // מביא את השם מה-crm_config (מרשימת users בתוך ה-config)
  const { data: config } = await supabaseAdmin
    .from('crm_config')
    .select('users')
    .single();

  const users: Array<{ id: string; name: string }> = config?.users ?? [];
  const match = users.find((u) => u.id === crmUser.crm_user_id);

  return res.status(200).json({
    crm_user_id: crmUser.crm_user_id,
    role:        crmUser.role,
    name:        match?.name ?? crmUser.email,
  });
}
