/**
 * POST /api/marketing-generate
 * מקבל חומר גולמי + הקשר מאגר ידע, מחזיר 5 מסרים שיווקיים (פלטפורמה אחת כל אחד).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from './_lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnowledgeItem = { category: string; title: string; content: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser) return res.status(401).json({ error: 'Unauthorized' });

  const { rawContent, ctaType, weekDate, knowledgeBase } = req.body ?? {};
  if (!rawContent || !ctaType) {
    return res.status(400).json({ error: 'rawContent and ctaType are required' });
  }

  const knowledge: KnowledgeItem[] = knowledgeBase ?? [];

  // ── בניית קונטקסט ממאגר הידע ──────────────────────────────────────────────
  const knowledgeSections = ['products', 'audience', 'style', 'ctas'].map(cat => {
    const items = knowledge.filter(k => k.category === cat);
    if (!items.length) return '';
    const label = { products: 'מוצרים ומשפכים', audience: 'קהל יעד', style: 'סגנון כתיבה', ctas: 'CTA-ים קבועים' }[cat] ?? cat;
    return `### ${label}\n${items.map(i => `**${i.title}**\n${i.content}`).join('\n\n')}`;
  }).filter(Boolean).join('\n\n');

  const ctaLabels: Record<string, string> = {
    webinar:       'הרשמה לוובינר',
    strategy_call: 'קביעת שיחת מיפוי אסטרטגי חינמית',
    course:        'הרשמה לקורס',
    nurture:       'ערך בלבד — ללא CTA מכירתי',
  };

  const systemPrompt = `אתה סוכן שיווק מומחה לעסקים של מטפלים ומאמנים.
אתה כותב מסרים שיווקיים בעברית, בסגנון אישי ואותנטי.

## מאגר הידע של העסק
${knowledgeSections || 'לא הוגדר מאגר ידע — כתוב בסגנון כללי.'}

## הנחיות כתיבה לכל פלטפורמה
- **whatsapp_status**: 2-3 שורות קצרות, אמוציונלי, אמוג'י אחד-שניים, ישיר. ללא כותרת.
- **whatsapp_group**: אישי ושיחתי, כאילו אתה כותב לחבר, 4-6 שורות, CTA ברור בסוף.
- **email**: כותרת מושכת (שדה subject) + גוף של 3-4 פסקאות, מבנה: פתיחה → ערך → הוכחה → CTA.
- **blog**: כותרת SEO (עד 60 תווים) + פוסט שלם של 300-500 מילים עם כותרות ביניים.
- **youtube**: תיאור סרטון (150-200 מילים) + 5-7 hashtags רלוונטיים בסוף.

חשוב: שמור על קול אחיד ואותנטי. אל תישמע כמו פרסומת.`;

  const userPrompt = `## חומר גולמי לשבוע ${weekDate ?? ''}
${rawContent}

## סוג CTA לשבוע זה
${ctaLabels[ctaType] ?? ctaType}

צור מסר מותאם לכל אחת מ-5 הפלטפורמות הבאות: whatsapp_status, whatsapp_group, email, blog, youtube.
החזר תוצאה כ-JSON בלבד (ללא markdown), מבנה:
[
  { "platform": "whatsapp_status", "content": "..." },
  { "platform": "whatsapp_group",  "content": "..." },
  { "platform": "email",           "content": "..." },
  { "platform": "blog",            "content": "..." },
  { "platform": "youtube",         "content": "..." }
]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    // נסה לחלץ JSON גם אם יש תוכן נוסף
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[marketing-generate] no JSON array in response:', text.slice(0, 300));
      return res.status(500).json({ error: 'Model did not return valid JSON' });
    }

    const messages = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ messages });
  } catch (err) {
    console.error('[marketing-generate] Claude API error:', err);
    return res.status(500).json({ error: 'Failed to generate messages', details: String(err) });
  }
}
