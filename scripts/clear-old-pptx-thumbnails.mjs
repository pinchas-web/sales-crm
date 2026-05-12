/**
 * clear-old-pptx-thumbnails.mjs
 *
 * גורף את ה-thumbnails המרובים שנוצרו ע"י ה-renderer הישן (הכל חוץ
 * מ-thumbnails[0]) עבור pptx/docx. הסיבה: עכשיו שומרים כיסוי יחיד,
 * וה-UI החדש מציג רק את thumbnails[0]. שאר ה-URLs רק תופסים מקום.
 *
 * בטוח להרצה חוזרת.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: items, error } = await supabase
  .from('content_items')
  .select('id, title, type, thumbnails')
  .in('type', ['pptx', 'docx']);

if (error) { console.error('Fetch failed:', error); process.exit(1); }

console.log(`PPTX/DOCX rows: ${items.length}`);
let cleaned = 0;
for (const r of items) {
  const t = Array.isArray(r.thumbnails) ? r.thumbnails : [];
  if (t.length <= 1) continue; // already single-cover
  const first = t[0];
  const { error: upErr } = await supabase
    .from('content_items')
    .update({ thumbnails: first ? [first] : [] })
    .eq('id', r.id);
  if (upErr) console.error(`  ✗ ${r.id}: ${upErr.message}`);
  else { console.log(`  ✓ ${r.title} — ${t.length} → 1`); cleaned++; }
}
console.log(`\nDone. Cleaned ${cleaned} rows.`);
