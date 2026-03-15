/**
 * Supabase Admin Client — עם Service Role Key.
 * משמש אך ורק בתוך Serverless Functions (צד שרת).
 * ⚠️ לא לייבא קובץ זה בקוד הדפדפן — SERVICE_ROLE_KEY לא יחשף לעולם לצד הלקוח.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl         = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});
