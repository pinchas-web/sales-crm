import { supabaseAdmin } from './supabaseAdmin';

export interface CrmUser {
  crm_user_id: string;
  /** אחד מ-ROLES ב-./permissions — או ערך לא מוכר, שמקבל אפס הרשאות */
  role: string;
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
    return crmUser as CrmUser;
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    console.error(`[CRM auth] FAILED: auth_user_id=${user.id} has no email`);
    return null;
  }

  // קישור לפי מייל רק אם בעל החשבון הוכיח שהמייל שלו (אימות מייל / Google).
  // בלי זה, מי שנרשם עם מייל של נציג מאושר היה מקבל את החשבון שלו.
  if (!user.email_confirmed_at) {
    console.error(`[CRM auth] FAILED: auth_user_id=${user.id} email not confirmed — not linking`);
    return null;
  }

  // Approved access is based on crm_users. This lets admins approve an email,
  // while users can later sign in through Google.
  const { data: approvedUser, error: emailError } = await supabaseAdmin
    .from('crm_users')
    .select('crm_user_id, role, email')
    .ilike('email', email)
    .single();

  if (emailError || !approvedUser) {
    console.error(`[CRM auth] FAILED: auth_user_id=${user.id} not approved in crm_users -`, emailError?.message);
    return null;
  }

  const { error: linkError } = await supabaseAdmin
    .from('crm_users')
    .update({ auth_user_id: user.id, email })
    .eq('crm_user_id', approvedUser.crm_user_id);

  if (linkError) {
    console.error(`[CRM auth] FAILED: could not link auth_user_id=${user.id} -`, linkError.message);
    return null;
  }

  console.log(`[CRM auth] linked auth_user_id=${user.id} uid=${approvedUser.crm_user_id} role=${approvedUser.role}`);
  return { ...approvedUser, email } as CrmUser;
}
