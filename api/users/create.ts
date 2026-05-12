import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { User } from '@supabase/supabase-js';
import { validateRequest } from '../_lib/auth';
import { supabaseAdmin } from '../_lib/supabaseAdmin';

async function findAuthUserByEmail(email: string): Promise<User | null> {
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser || crmUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { email, crm_user_id, role, password } = req.body as {
    email: string;
    crm_user_id: string;
    role: 'admin' | 'salesperson';
    password: string;
  };

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !crm_user_id || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const { data: existingCrmId } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id')
    .eq('crm_user_id', crm_user_id)
    .maybeSingle();

  const { data: existingCrmEmail } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (existingCrmId || existingCrmEmail) {
    return res.status(400).json({ error: 'CRM user already exists' });
  }

  let authUser = await findAuthUserByEmail(normalizedEmail);

  if (authUser) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      email_confirm: true,
      password,
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }
  } else {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message ?? 'Could not create auth user' });
    }

    authUser = authData.user;
  }

  const { error: dbError } = await supabaseAdmin
    .from('crm_users')
    .insert({ auth_user_id: authUser.id, crm_user_id, role, email: normalizedEmail });

  if (dbError) {
    return res.status(500).json({ error: dbError.message });
  }

  return res.status(200).json({ auth_user_id: authUser.id });
}
