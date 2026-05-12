import { supabaseAdmin } from './supabaseAdmin';

export interface CrmUser {
  crm_user_id: string;
  role: 'admin' | 'salesperson';
  email: string;
}

export async function validateRequest(authHeader: string | undefined): Promise<CrmUser | null> {
  const token = (authHeader ?? '').replace('Bearer ', '').trim();
  if (!token) {
    console.error('[CRM auth] FAILED: no Bearer token in Authorization header');
    return null;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    console.error('[CRM auth] FAILED: invalid JWT -', error?.message);
    return null;
  }

  const { data: crmUser, error: dbError } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id, role, email')
    .eq('auth_user_id', user.id)
    .single();

  if (!dbError && crmUser) {
    console.log(`[CRM auth] ok uid=${crmUser.crm_user_id} role=${crmUser.role}`);
    return crmUser as CrmUser;
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    console.error(`[CRM auth] FAILED: auth_user_id=${user.id} has no email`);
    return null;
  }

  // Approved access is based on crm_users. This lets admins approve an email,
  // while users can later sign in through Google or a pending signup identity.
  const { data: approvedUser, error: emailError } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id, role, email')
    .ilike('email', email)
    .single();

  if (emailError || !approvedUser) {
    console.error(`[CRM auth] FAILED: auth_user_id=${user.id} email=${email} not approved in crm_users -`, emailError?.message);
    return null;
  }

  const { error: linkError } = await supabaseAdmin
    .from('crm_users')
    .update({ auth_user_id: user.id, email })
    .eq('crm_user_id', approvedUser.crm_user_id);

  if (linkError) {
    console.error(`[CRM auth] FAILED: could not link email=${email} to auth_user_id=${user.id} -`, linkError.message);
    return null;
  }

  console.log(`[CRM auth] linked email=${email} uid=${approvedUser.crm_user_id} role=${approvedUser.role}`);
  return { ...approvedUser, email } as CrmUser;
}
