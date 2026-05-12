import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin';

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = normalizeEmail(req.body?.email);
  const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : undefined;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const { data: approvedUser, error: approvedError } = await supabaseAdmin
    .from('crm_users')
    .select('auth_user_id')
    .ilike('email', email)
    .single();

  if (approvedError || !approvedUser) {
    console.warn(`[CRM forgot-password] ignored reset for unapproved email=${email}`);
    return res.status(404).json({ error: 'Email is not approved in the CRM' });
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error(`[CRM forgot-password] reset email failed for ${email}:`, error.message);
    return res.status(500).json({ error: 'Could not send reset email' });
  }

  return res.status(200).json({ ok: true });
}
