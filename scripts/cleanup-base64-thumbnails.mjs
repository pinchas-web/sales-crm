/**
 * cleanup-base64-thumbnails.mjs
 *
 * Scans content_items and clears any `thumbnails` arrays that contain
 * base64 data URLs (the old format that broke persistence by exceeding
 * Vercel's 4.5MB POST body limit).
 *
 * Strategy: safest option — set `thumbnails = []` on rows whose array
 * contains any "data:" URL. The files themselves (fileUrl/fileKey) are
 * untouched, so users keep their uploads; they just lose the broken
 * preview strip and can re-upload to regenerate thumbnails as Storage URLs.
 *
 * Run: node scripts/cleanup-base64-thumbnails.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── Load .env.local manually (no dotenv dep needed) ──────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = join(__dirname, '..', '.env.local');
const envText   = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url         = env.SUPABASE_URL;
const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Fetch all content_items ──────────────────────────────────────────────────
console.log('Fetching content_items…');
const { data: items, error } = await supabase
  .from('content_items')
  .select('id, title, thumbnails');

if (error) {
  console.error('Fetch failed:', error);
  process.exit(1);
}

console.log(`Total rows: ${items.length}`);

// ── Find rows with any base64 thumbnail ──────────────────────────────────────
const polluted = items.filter(r => {
  const t = r.thumbnails;
  if (!Array.isArray(t)) return false;
  return t.some(s => typeof s === 'string' && s.startsWith('data:'));
});

console.log(`Rows with base64 thumbnails: ${polluted.length}`);
if (polluted.length === 0) {
  console.log('Nothing to clean. Done.');
  process.exit(0);
}

for (const r of polluted) {
  const n = r.thumbnails.length;
  const kb = Math.round(JSON.stringify(r.thumbnails).length / 1024);
  console.log(`  • ${r.id}  "${r.title}"  (${n} thumbs, ~${kb} KB)`);
}

// ── Clear thumbnails arrays ──────────────────────────────────────────────────
console.log('\nClearing thumbnails on those rows…');
let ok = 0, fail = 0;
for (const r of polluted) {
  const { error: upErr } = await supabase
    .from('content_items')
    .update({ thumbnails: [] })
    .eq('id', r.id);
  if (upErr) {
    console.error(`  ✗ ${r.id}: ${upErr.message}`);
    fail++;
  } else {
    ok++;
  }
}

console.log(`\nDone. Cleared: ${ok}. Failed: ${fail}.`);
console.log('Users can re-upload files to regenerate thumbnails as Storage URLs.');
