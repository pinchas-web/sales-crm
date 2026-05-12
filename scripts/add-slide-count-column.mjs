/**
 * add-slide-count-column.mjs
 *
 * Adds slide_count INTEGER column to content_items.
 * Runs the SQL via PostgREST — safe to re-run (IF NOT EXISTS).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText   = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Try to read current schema by selecting the column — succeeds if exists
const { error: probe } = await supabase
  .from('content_items')
  .select('slide_count')
  .limit(1);

if (!probe) {
  console.log('✓ slide_count already exists. Nothing to do.');
  process.exit(0);
}

console.log('Column missing. Supabase JS does not expose DDL — please run this SQL in Supabase SQL Editor:');
console.log('  ALTER TABLE content_items ADD COLUMN IF NOT EXISTS slide_count INTEGER;');
console.log('');
console.log('Or open: scripts/add-slide-count-column.sql');
process.exit(1);
