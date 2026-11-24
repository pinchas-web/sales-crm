/**
 * מייל הזמנה ללקוח עם קישור אישי לשאלון — אחד או כמה שאלונים באותו מייל.
 * נשלח מהשרת (SMTP של העסק), כך שזה עובד בכל מחשב, בלי תוכנת מייל מותקנת.
 */
import { QUESTIONNAIRES, type QuestionnaireId } from './questionnaireDefs';

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const ABOUT: Record<QuestionnaireId, string> = {
  strategy: 'כדי שנוכל לנצל את פגישת האסטרטגיה עד הסוף. שאלות על העסק, היעדים והשיווק.',
  mental: 'אבחון אישי לפני שאנחנו מתחילים. כדאי למלא בשקט, בלי הפרעות, ולענות בכנות ובפירוט.',
};

export interface InviteItem { qid: QuestionnaireId; url: string; expiresAt?: string }

export const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export function inviteSubject(items: InviteItem[]): string {
  if (items.length === 1) return `${QUESTIONNAIRES[items[0].qid].shortTitle} – לפני שניפגש`;
  return `${items.length === 2 ? 'שני שאלונים' : `${items.length} שאלונים`} קצרים לפני שניפגש – פנחס הורביץ`;
}

export function inviteHtml(name: string, items: InviteItem[]): string {
  const first = esc((name || '').trim().split(/\s+/)[0] || '');
  const many = items.length > 1;
  const cards = items.map((it, i) => {
    const def = QUESTIONNAIRES[it.qid];
    const until = it.expiresAt ? new Date(it.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' }) : '';
    return `
      <div style="background:#FFFFFF;border:1px solid #E5CB9B;border-radius:16px;padding:18px 20px;margin:0 0 14px">
        <p style="margin:0 0 2px;font-size:13px;color:#B08D44;font-weight:bold">${many ? `שאלון ${i + 1} מתוך ${items.length} · ` : ''}${esc(def.minutes)}</p>
        <p style="margin:0 0 6px;font-size:19px;font-weight:bold;color:#231F20">${esc(def.shortTitle)}</p>
        <p style="margin:0 0 14px;font-size:15px;color:#4A423C">${esc(ABOUT[it.qid])}</p>
        <a href="${esc(it.url)}" style="background:#C7263A;color:#FFFFFF;padding:12px 22px;border-radius:12px;text-decoration:none;display:inline-block;font-weight:bold;font-size:16px">למילוי ה${esc(def.shortTitle)}</a>
        ${until ? `<p style="margin:10px 0 0;font-size:12px;color:#8A7E73">הקישור אישי ובתוקף עד ${esc(until)}.</p>` : ''}
      </div>`;
  }).join('');
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#231F20;background:#FBF5EA;padding:24px 16px">
    <div style="max-width:560px;margin:0 auto">
      <p style="font-size:18px;margin:0 0 10px">שלום ${first},</p>
      <p style="margin:0 0 18px">${many
        ? `לקראת המפגש שלנו הכנתי לך ${items.length === 2 ? 'שני שאלונים' : `${items.length} שאלונים`}. אפשר למלא כל אחד בזמן אחר, והתשובות נשמרות גם אם עוצרים באמצע.`
        : 'לקראת המפגש שלנו הכנתי לך שאלון. התשובות נשמרות גם אם עוצרים באמצע וחוזרים אחר כך.'}</p>
      ${cards}
      <p style="margin:18px 0 0;font-size:14px;color:#6B6057">התשובות מגיעות רק אליי, ונשמרות בצורה מאובטחת.</p>
      <p style="margin:22px 0 0">מחכה לפגוש אותך,<br><b>פנחס הורביץ</b><br><span style="color:#6B6057;font-size:14px">הבית למטפלים ומאמנים · 052-7117224</span></p>
    </div>
  </div>`;
}
