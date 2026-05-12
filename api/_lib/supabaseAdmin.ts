/**
 * Supabase Admin Client — עם Service Role Key.
 * משמש אך ורק בתוך Serverless Functions (צד שרת).
 * ⚠️ לא לייבא קובץ זה בקוד הדפדפן — SERVICE_ROLE_KEY לא יחשף לעולם לצד הלקוח.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readLocalEnv(name: string) {
  for (const file of ['.env.development.local', '.env.local', '.env']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;

    const match = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(new RegExp(`^${name}=\\\"?([^\\\"]+)\\\"?$`))?.[1]?.trim())
      .find(Boolean);

    if (match) return match;
  }

  return '';
}

const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  readLocalEnv('SUPABASE_URL') ??
  readLocalEnv('VITE_SUPABASE_URL')
).trim();

const supabaseServiceRole = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  readLocalEnv('SUPABASE_SERVICE_ROLE_KEY')
).trim();

console.log('[supabaseAdmin] init — SUPABASE_URL present:', !!supabaseUrl, '| SERVICE_ROLE_KEY present:', !!supabaseServiceRole);

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('[supabaseAdmin] FATAL: Missing env vars. URL:', supabaseUrl ? 'set' : 'MISSING', 'KEY:', supabaseServiceRole ? 'set' : 'MISSING');
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});
console.log('[supabaseAdmin] createClient() done — client initialized successfully');
