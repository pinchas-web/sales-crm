/**
 * מה שקורה אחרי שהלקוח שולח שאלון:
 *   1. סיכום כתוב לפנחס (Claude) — אם יש מפתח API ולא נגמרה המכסה היומית
 *   2. מייל לפנחס עם ה-PDF, הציונים והסיכום. ללקוח — רק מייל תודה, בלי התשובות.
 *   3. עותק PDF לדרייב, בתיקייה של הלקוח
 * כל שלב עצמאי: אם אחד נכשל, האחרים ממשיכים, והסטטוס נשמר ברשומה (אפשר לנסות שוב מה-CRM).
 * בפרטיות: לבינה המלאכותית נשלחות רק התשובות והשם הפרטי — בלי טלפון, מייל או כתובת.
 */
import Anthropic from '@anthropic-ai/sdk';
import { QUESTIONNAIRES, allQuestions, answerText, LEVEL_LABELS } from './questionnaireDefs';
import type { QRecord, DeliveryStatus } from './questionnaireTypes';
import { getQ, saveQ, loadPdf, pdfFileName } from './questionnaireStore';
import { sendMail, notifyEmail, mailConfigured } from './mailer';
import { uploadToDrive, driveConfigured } from './drive';
import { consumeAiQuota } from './aiUsage';

export const AI_MODEL = process.env.QUESTIONNAIRE_AI_MODEL || 'claude-opus-5-5';

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const PRIVATE_FIELDS = new Set(['phone', 'email', 'address']);

function answersForAi(rec: QRecord): string {
  const def = QUESTIONNAIRES[rec.qid];
  const a = rec.answers ?? {};
  const lines: string[] = [];
  for (const sec of def.sections) {
    const qs = sec.questions.filter(q => !PRIVATE_FIELDS.has(q.id) && a[q.id] !== undefined && a[q.id] !== '');
    if (!qs.length) continue;
    lines.push(`\n### ${sec.title}`);
    for (const q of qs) {
      if (q.id === 'name') { lines.push(`שם פרטי: ${String(a[q.id]).split(' ')[0]}`); continue; }
      lines.push(`- ${q.label}${q.kind === 'scale7' ? (q.polarity === -1 ? ' (היגד הפוך)' : q.polarity === 0 ? ' (לא נכלל בציון)' : '') : ''}\n  ${answerText(q, a[q.id])}`);
    }
  }
  if (rec.scores?.length) {
    lines.push('\n### ציונים לפי תחום (0–100, גבוה = חוזקה)');
    for (const s of rec.scores) lines.push(`- ${s.label}: ${s.pct} (${LEVEL_LABELS[s.level]})`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `אתה עוזר אישי של פנחס הורביץ, מנטור עסקי ומאמן מנטלי למטפלים ומאמנים.
לפני פגישה ראשונה, לקוח מילא שאלון. תפקידך לכתוב לפנחס סיכום הכנה לפגישה, בעברית, בגוף שלישי על הלקוח.

כללים:
- כתוב רק על סמך מה שהלקוח כתב והציונים. אל תמציא עובדות, ואל תאבחן אבחנה רפואית או נפשית.
- היה ענייני, חם וחד. משפטים קצרים. בלי קלישאות ובלי מליצות.
- צטט ביטויים קצרים של הלקוח במירכאות כשהם חושפים משהו חשוב.
- אם יש סתירה בין התשובות הפתוחות לבין הדירוגים, ציין אותה.
- אורך: עד כ-350 מילים.

מבנה קבוע (כותרות שמתחילות ב-"## ", ותבליטים שמתחילים ב-"- "):
## בשורה אחת
## מה בולט
## חוזקות שאפשר להישען עליהן
## חסמים ונקודות לחיזוק
## מה הוא רוצה לקבל
## הצעה למיקוד הפגישה הראשונה
## 3 שאלות לשאול בפגישה`;

export async function generateSummary(rec: QRecord): Promise<{ text: string; model: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const kind = rec.qid === 'mental' ? 'אבחון מנטלי (לפני תחילת תהליך)' : 'שאלון אסטרטגיה עסקית (לפני פגישת אסטרטגיה)';
  const params = {
    model: AI_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `סוג השאלון: ${kind}\n\nהתשובות:\n${answersForAi(rec)}` }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let res: any;
  try {
    // מעבר אוטומטי למודל חלופי אם הבקשה נדחית בטעות (fallbacks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res = await (client.beta.messages.create as any)({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await (client.messages.create as any)(params);
    } else throw err;
  }
  if (res.stop_reason === 'refusal') throw new Error('הבקשה נדחתה על ידי מנגנון הבטיחות');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new Error('הסיכום חזר ריק');
  return { text: text.slice(0, 12000), model: String(res.model ?? AI_MODEL) };
}

/** הופך את הסיכום (כותרות ## ותבליטים) ל-HTML בטוח למייל */
export function summaryToHtml(text: string): string {
  const out: string[] = [];
  let inList = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul style="margin:4px 0 12px;padding-right:20px">'); inList = true; }
      out.push(`<li style="margin:3px 0">${esc(line.slice(2).replace(/\*\*/g, ''))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    if (line.startsWith('#')) out.push(`<h3 style="margin:18px 0 6px;font-size:16px;color:#C7263A">${esc(line.replace(/^#+\s*/, ''))}</h3>`);
    else out.push(`<p style="margin:4px 0 10px">${esc(line.replace(/\*\*/g, ''))}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function scoresHtml(rec: QRecord): string {
  if (!rec.scores?.length) return '';
  const color = { strong: '#217A4E', mid: '#B08D44', focus: '#C7263A' } as const;
  const rows = rec.scores.map(s => `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:#231F20;white-space:nowrap">${esc(s.label)}</td>
      <td style="padding:6px 10px;width:100%">
        <div style="background:#F0E4CF;border-radius:6px;height:10px;overflow:hidden">
          <div style="background:${color[s.level]};width:${s.pct}%;height:10px;border-radius:6px"></div>
        </div>
      </td>
      <td style="padding:6px 0;font-size:14px;font-weight:bold;color:${color[s.level]};white-space:nowrap">${s.pct}</td>
    </tr>`).join('');
  return `<h3 style="margin:22px 0 8px;font-size:16px">ציונים לפי תחום${rec.overall != null ? ` · ממוצע ${rec.overall}` : ''}</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="font-size:12px;color:#6B6057;margin-top:6px">0–100, גבוה = חוזקה. היגדים "הפוכים" (שבהם הסכמה מעידה על קושי) מחושבים הפוך.</p>`;
}

function highlightsHtml(rec: QRecord): string {
  const def = QUESTIONNAIRES[rec.qid];
  const a = rec.answers ?? {};
  const ids = rec.qid === 'strategy'
    ? ['business', 'current_state', 'desired_result', 'target_income', 'blockers']
    : ['trigger', 'big_goal', 'top3', 'change_area'];
  const items = allQuestions(def).filter(q => ids.includes(q.id) && a[q.id]);
  if (!items.length) return '';
  return `<h3 style="margin:22px 0 8px;font-size:16px">בקצרה, במילים שלו</h3>` + items.map(q => `
    <p style="margin:0 0 2px;font-size:13px;color:#6B6057">${esc(q.label)}</p>
    <p style="margin:0 0 12px;white-space:pre-wrap">${esc(String(a[q.id]).slice(0, 600))}${String(a[q.id]).length > 600 ? '…' : ''}</p>`).join('');
}

export function crmLink(baseUrl: string | undefined): string {
  const base = process.env.APP_URL || baseUrl || '';
  return base ? base.replace(/\/$/, '') : '';
}

async function sendEmails(rec: QRecord, pdf: Buffer | null, baseUrl?: string): Promise<DeliveryStatus> {
  if (!mailConfigured()) return 'not_configured';
  const def = QUESTIONNAIRES[rec.qid];
  const to = notifyEmail();
  const link = crmLink(baseUrl);
  const matchNote = rec.match === 'new_lead' ? 'נפתח ליד חדש ב-CRM.'
    : rec.match ? `שויך לליד קיים לפי ${rec.match === 'phone' ? 'מספר הטלפון' : 'כתובת המייל'}.` : '';
  if (to) {
    await sendMail({
      to: [to],
      subject: `${def.shortTitle} מולא – ${rec.name}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#231F20;max-width:640px">
        <p style="font-size:20px;font-weight:bold;margin:0 0 4px">${esc(rec.name)} מילא/ה את ה${esc(def.shortTitle)}</p>
        <p style="margin:0 0 16px;color:#6B6057">${new Date(rec.submittedAt ?? Date.now()).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} ${matchNote ? `· ${esc(matchNote)}` : ''}</p>
        ${link ? `<p><a href="${esc(link)}" style="background:#C7263A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;display:inline-block">לתיק הלקוח ב-CRM</a></p>` : ''}
        ${rec.summary?.text ? `<div style="background:#FDF8EE;border:1px solid #E5CB9B;border-radius:14px;padding:6px 18px 10px;margin-top:16px"><h2 style="font-size:17px;margin:12px 0 0">סיכום הכנה לפגישה</h2>${summaryToHtml(rec.summary.text)}</div>` : ''}
        ${scoresHtml(rec)}
        ${highlightsHtml(rec)}
        <p style="margin-top:22px;color:#6B6057;font-size:13px">כל התשובות המלאות בקובץ ה-PDF המצורף ובתיק הלקוח ב-CRM. המייל הזה מכיל מידע אישי רגיש: לא להעביר הלאה.</p>
      </div>`,
      attachments: pdf ? [{ filename: pdfFileName(rec), content: pdf, contentType: 'application/pdf' }] : undefined,
    });
  }
  const clientEmail = rec.contactEmail ?? '';
  if (clientEmail) {
    const first = esc(rec.name.split(' ')[0]);
    await sendMail({
      to: [clientEmail],
      subject: 'קיבלתי את התשובות שלך – פנחס הורביץ',
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#231F20;max-width:560px">
        <p>שלום ${first},</p>
        <p>תודה שהקדשת מזמנך למלא את ה${esc(def.shortTitle)}. התשובות הגיעו אליי, ואני עובר עליהן לפני שניפגש.</p>
        <p>מחכה לפגוש אותך!</p>
        <p style="margin-top:24px">פנחס הורביץ<br>הבית למטפלים ומאמנים<br>052-7117224 · pinchashorvitz.co.il</p>
      </div>`,
    }).catch(err => console.error('[questionnaires] client thank-you mail failed:', err instanceof Error ? err.message : err));
  }
  return 'sent';
}

/**
 * משלים את מה שחסר לשאלון שנשלח: סיכום, מייל, דרייב.
 * force — מריץ שוב גם שלבים שכבר הצליחו (כפתור "שליחה מחדש" ב-CRM).
 */
export async function finalizeQ(token: string, opts: { baseUrl?: string; force?: Array<'summary' | 'email' | 'drive'> } = {}): Promise<QRecord | null> {
  let rec = await getQ(token);
  if (!rec || rec.status !== 'submitted') return rec;
  const force = new Set(opts.force ?? []);
  const errors: string[] = [];

  // 1. סיכום
  if (force.has('summary') || !rec.summary?.text) {
    if (!process.env.ANTHROPIC_API_KEY) rec.summaryStatus = 'not_configured';
    else {
      try {
        const quota = await consumeAiQuota();
        if (!quota.ok) { rec.summaryStatus = 'failed'; errors.push('מכסת הבינה המלאכותית היומית נוצלה'); }
        else {
          const s = await generateSummary(rec);
          rec.summary = { text: s.text, model: s.model, createdAt: new Date().toISOString() };
          rec.summaryStatus = 'sent';
        }
      } catch (err) {
        rec.summaryStatus = 'failed';
        errors.push(`סיכום: ${err instanceof Error ? err.message.slice(0, 200) : 'שגיאה'}`);
        console.error('[questionnaires] summary failed:', err instanceof Error ? err.message : err);
      }
    }
    await saveQ({ ...rec, updatedAt: new Date().toISOString() });
  }

  const pdf = rec.pdfPath ? await loadPdf(rec.pdfPath) : null;

  // 2. מייל
  if (force.has('email') || !rec.emailStatus || rec.emailStatus === 'pending') {
    try { rec.emailStatus = await sendEmails(rec, pdf, opts.baseUrl); }
    catch (err) {
      rec.emailStatus = 'failed';
      errors.push(`מייל: ${err instanceof Error ? err.message.slice(0, 200) : 'שגיאה'}`);
      console.error('[questionnaires] email failed:', err instanceof Error ? err.message : err);
    }
  }

  // 3. דרייב
  if (force.has('drive') || !rec.driveStatus || rec.driveStatus === 'pending') {
    if (!pdf) rec.driveStatus = 'skipped';
    else if (!driveConfigured()) rec.driveStatus = 'not_configured';
    else {
      try {
        const digits = (rec.contactPhone ?? '').replace(/\D/g, '');
        const phoneTail = digits.length >= 4 ? ` - ${digits.slice(-4)}` : '';
        const r = await uploadToDrive({ folderName: `${rec.name}${phoneTail}`, fileName: pdfFileName(rec), pdf });
        rec.driveStatus = r.status;
        if (r.status === 'sent' && r.url) rec.driveUrl = r.url;
      } catch (err) {
        rec.driveStatus = 'failed';
        errors.push(`דרייב: ${err instanceof Error ? err.message.slice(0, 200) : 'שגיאה'}`);
        console.error('[questionnaires] drive failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  // שומרים מעל הגרסה העדכנית (ייתכן שמשהו התעדכן בינתיים)
  const latest = await getQ(token);
  rec = {
    ...(latest ?? rec),
    summary: rec.summary, summaryStatus: rec.summaryStatus,
    emailStatus: rec.emailStatus, driveStatus: rec.driveStatus, driveUrl: rec.driveUrl,
    lastError: errors.length ? errors.join(' · ') : undefined,
    updatedAt: new Date().toISOString(),
  };
  await saveQ(rec);
  return rec;
}
