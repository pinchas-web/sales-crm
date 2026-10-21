/**
 * מכסה יומית להפעלות AI (מחולל המסרים).
 * המונה נשמר כשורה פנימית בטבלת marketing_knowledge — בלי מיגרציה חדשה.
 * השורה לא נשלחת לדפדפן ולא ניתנת לעריכה ממנו (ראו api/state.ts).
 */
import { supabaseAdmin } from './supabaseAdmin';

export const AI_USAGE_CATEGORY = '_ai_usage';
export const AI_DAILY_LIMIT    = Number(process.env.AI_DAILY_LIMIT ?? 30);

const USAGE_ID = '_ai_usage_counter';

function todayIL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

/** מעלה את המונה באחד. מחזיר false אם המכסה של היום כבר נוצלה. */
export async function consumeAiQuota(): Promise<{ ok: boolean; used: number; limit: number }> {
  const today = todayIL();
  const { data, error } = await supabaseAdmin
    .from('marketing_knowledge').select('content').eq('id', USAGE_ID).maybeSingle();
  if (error) throw new Error(`ai usage select: ${error.message}`);

  let used = 0;
  try {
    const parsed = JSON.parse(data?.content ?? '{}') as { date?: string; count?: number };
    if (parsed.date === today) used = parsed.count ?? 0;
  } catch { /* שורה פגומה — מתחילים מאפס */ }

  if (used >= AI_DAILY_LIMIT) return { ok: false, used, limit: AI_DAILY_LIMIT };

  const { error: writeErr } = await supabaseAdmin.from('marketing_knowledge').upsert({
    id: USAGE_ID,
    category: AI_USAGE_CATEGORY,
    title: 'AI usage counter (internal)',
    content: JSON.stringify({ date: today, count: used + 1 }),
    updated_at: new Date().toISOString(),
  });
  if (writeErr) throw new Error(`ai usage upsert: ${writeErr.message}`);
  return { ok: true, used: used + 1, limit: AI_DAILY_LIMIT };
}
