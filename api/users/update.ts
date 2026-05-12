import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../_lib/auth';
import { supabaseAdmin } from '../_lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser || crmUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { crm_user_id, email, role } = req.body as {
    crm_user_id: string;
    email?: string;
    role?: 'admin' | 'salesperson';
  };

  if (!crm_user_id) return res.status(400).json({ error: 'Missing crm_user_id' });
  if (role && !['admin', 'salesperson'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const patch: { email?: string; role?: 'admin' | 'salesperson' } = {};
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) patch.email = normalizedEmail;
  if (role) patch.role = role;

  if (Object.keys(patch).length === 0) return res.status(200).json({ ok: true });

  const { data: row, error: findError } = await supabaseAdmin
    .from('crm_users')
    .select('auth_user_id')
    .eq('crm_user_id', crm_user_id)
    .single();

  if (findError || !row) return res.status(404).json({ error: 'User not found' });

  const { error: updateError } = await supabaseAdmin
    .from('crm_users')
    .update(patch)
    .eq('crm_user_id', crm_user_id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  if (normalizedEmail) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(row.auth_user_id, {
      email: normalizedEmail,
      email_confirm: true,
    });
    if (authError) return res.status(500).json({ error: authError.message });
  }

  return res.status(200).json({ ok: true });
}
