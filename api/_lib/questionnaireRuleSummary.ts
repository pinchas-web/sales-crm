/**
 * סיכום הכנה לפגישה — בלי בינה מלאכותית ובלי עלות.
 * נבנה רק מהציונים ומהמילים של הלקוח: לא מנחש, לא מאבחן, לא ממציא.
 * אותו מבנה כמו הסיכום של Claude (כותרות "## " ותבליטים "- "), כך שהמייל, ה-CRM וה-PDF מציגים אותו אותו דבר.
 */
import { QUESTIONNAIRES, allQuestions, type Answers, type Question, type SectionScore } from './questionnaireDefs';
import type { QRecord } from './questionnaireTypes';

export const RULES_MODEL = 'rules';

function str(a: Answers, id: string): string {
  const v = a[id];
  return v === undefined || v === null ? '' : String(v).trim();
}

/** קטע קצר מתשובה פתוחה, בשורה אחת */
function quote(text: string, max = 180): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trim()}…`;
}

function listItems(text: string): string[] {
  return text.split('\n').map(s => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 5);
}

/** מספר מתוך טקסט חופשי: "350 ₪", "40,000", "40 אלף" */
export function parseAmount(text: string): number | null {
  const m = text.replace(/[,'’]/g, '').match(/\d+(\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (/אלף|א'|k\b/i.test(text) && n < 1000) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const withShekel = (t: string) => (/^[\d,.\s]+$/.test(t) ? `${t.trim()} ₪` : t);
const fmt = (n: number) => Math.round(n).toLocaleString('he-IL');

// ─── אבחון מנטלי ───────────────────────────────────────────────────────────

/** שאלה מוצעת לפגישה לפי תחום שדורש חיזוק */
const AREA_QUESTIONS: Record<string, string> = {
  goals: 'איך נראה אצלך יום רגיל? מתי ואיך אתה מחליט מה המטרה של היום?',
  focus: 'מה בדרך כלל מסיח אותך, ובאיזה רגע ביום זה קורה?',
  commitment: 'ספר על פעם אחרונה שהתחלת משהו ועזבת באמצע. מה קרה שם?',
  confidence: 'באיזה מצב אתה מרגיש הכי בטוח בעצמך, ובאיזה הכי פחות?',
  approval: 'של מי הדעה הכי משפיעה עליך היום, ואיך זה מתבטא בהחלטות שלך?',
  competitive: 'מה מניע אותך יותר: לנצח, להשתפר, או משהו אחר?',
  self_talk: 'מה הקול הפנימי אומר לך ברגע שמשהו לא מצליח?',
  pressure: 'מה קורה לך בגוף ובראש ברגע של לחץ גדול? מה עוזר לך לחזור לעצמך?',
  beliefs: 'מה אתה מאמין שמגיע לך להשיג? ומאיפה האמונה הזאת הגיעה?',
  fear: 'מה הדבר הכי גרוע שיכול לקרות אם תנסה ולא תצליח?',
  life: 'אם היינו נפגשים בעוד שנה והכל היה מצליח, מה היה שונה בחיים שלך?',
};

interface Item { q: Question; v: number; adj: number; area: string }

function mentalItems(a: Answers): Item[] {
  const def = QUESTIONNAIRES.mental;
  const out: Item[] = [];
  for (const sec of def.sections) {
    for (const q of sec.questions) {
      if (q.kind !== 'scale7' || !q.polarity) continue;
      const v = Number(a[q.id]);
      if (!Number.isInteger(v) || v < 1 || v > 7) continue;
      out.push({ q, v, adj: q.polarity === -1 ? 8 - v : v, area: sec.scoreLabel ?? sec.title });
    }
  }
  return out;
}

function itemLine(it: Item): string {
  const rev = it.q.polarity === -1 ? ', היגד הפוך' : '';
  return `"${quote(it.q.label, 140)}" — דירג ${it.v} מתוך 7 (${it.area}${rev})`;
}

function mentalSummary(rec: QRecord): string {
  const a = rec.answers ?? {};
  const scores = [...(rec.scores ?? [])].sort((x, y) => y.pct - x.pct);
  const out: string[] = [];
  if (!scores.length) return '';

  const top = scores[0];
  const low = scores[scores.length - 1];
  const strong = scores.filter(s => s.level === 'strong');
  const focus = [...scores].reverse().filter(s => s.level === 'focus');
  const weakest: SectionScore[] = (focus.length ? focus : [...scores].reverse()).slice(0, 3);

  out.push('## בשורה אחת');
  out.push(`ממוצע כללי ${rec.overall ?? '—'} מתוך 100. התחום החזק ביותר: ${top.label} (${top.pct}). התחום שהכי דורש חיזוק: ${low.label} (${low.pct}).`);

  const items = mentalItems(a);
  const strongItems = items.filter(i => i.adj >= 7).slice(0, 3);
  const weakItems = [...items].sort((x, y) => x.adj - y.adj).filter(i => i.adj <= 2).slice(0, 4);

  out.push('## חוזקות שאפשר להישען עליהן');
  if (strong.length) out.push(`- תחומים חזקים: ${strong.map(s => `${s.label} (${s.pct})`).join(', ')}`);
  else out.push(`- אין תחום שעבר 70. היחסית חזקים: ${scores.slice(0, 2).map(s => `${s.label} (${s.pct})`).join(', ')}`);
  for (const it of strongItems) out.push(`- ${itemLine(it)}`);
  const how = str(a, 'achievement_how');
  if (how) out.push(`- מה הביא אותו להישג הגדול, במילים שלו: "${quote(how)}"`);

  out.push('## חסמים ונקודות לחיזוק');
  for (const s of weakest) out.push(`- ${s.label}: ${s.pct} מתוך 100`);
  for (const it of weakItems) out.push(`- ${itemLine(it)}`);
  const pattern = str(a, 'pattern');
  if (pattern) out.push(`- מה מעכב אותו, במילים שלו: "${quote(pattern)}"`);

  const said: Array<[string, string]> = [
    ['trigger', 'למה דווקא עכשיו'],
    ['big_goal', 'המטרה הגדולה'],
    ['worries', 'מה מדאיג'],
    ['dream', 'החלום'],
  ];
  const saidLines = said.filter(([id]) => str(a, id)).map(([id, l]) => `- ${l}: "${quote(str(a, id))}"`);
  if (saidLines.length) { out.push('## במילים שלו'); out.push(...saidLines); }

  const top3 = str(a, 'top3');
  if (top3) {
    out.push('## מה הוא רוצה לקבל');
    const lines = listItems(top3);
    if (lines.length > 1) out.push(...lines.map(l => `- ${quote(l, 160)}`));
    else out.push(`- "${quote(top3, 300)}"`);
  }

  out.push('## הצעה למיקוד הפגישה הראשונה');
  const goal = str(a, 'big_goal');
  out.push(`- לחבר בין ${weakest.slice(0, 2).map(s => s.label).join(' ו')} לבין ${goal ? `המטרה שכתב: "${quote(goal, 90)}"` : 'המטרה הגדולה שלו'}.`);
  out.push(`- להישען על ${top.label} כנקודת כוח שכבר קיימת.`);
  const change = str(a, 'change_area');
  if (change) out.push(`- התחום שהוא עצמו ביקש לשנות: "${quote(change, 140)}"`);

  out.push('## 3 שאלות לשאול בפגישה');
  // מהתחום החלש ביותר כלפי מעלה, ושאלת סיום כגיבוי
  const qs = [...scores].reverse().map(s => AREA_QUESTIONS[s.id]).filter(Boolean);
  qs.push('מה יגרום לך להרגיש, בסוף התהליך, שזה היה שווה את זה?');
  out.push(...qs.slice(0, 3).map(q => `- ${q}`));

  return out.join('\n');
}

// ─── אסטרטגיה עסקית ────────────────────────────────────────────────────────

function strategySummary(rec: QRecord): string {
  const a = rec.answers ?? {};
  const out: string[] = [];
  const business = str(a, 'business');
  const seniority = str(a, 'seniority');
  const priceText = str(a, 'session_price');
  const targetText = str(a, 'target_income');

  out.push('## בשורה אחת');
  const one = [
    business ? `עוסק ב: ${quote(business, 110)}` : '',
    seniority ? `בתחום ${seniority}` : '',
    priceText ? `גובה ${withShekel(priceText)} לפגישה` : '',
    targetText ? `רוצה להגיע ל-${withShekel(targetText)} בחודש` : '',
  ].filter(Boolean);
  out.push(one.length ? `${one.join('. ')}.` : 'הלקוח מילא את השאלון בלי פרטים על העסק.');

  const price = priceText ? parseAmount(priceText) : null;
  const target = targetText ? parseAmount(targetText) : null;
  if (price && target && price >= 30 && price <= 20000 && target >= 1000 && target <= 2_000_000) {
    const perMonth = target / price;
    out.push('## המספרים');
    out.push(`- כדי להגיע ל-${fmt(target)} ₪ במחיר של ${fmt(price)} ₪ לפגישה, צריך כ-${fmt(perMonth)} פגישות בחודש (כ-${fmt(perMonth / 4.3)} בשבוע).`);
    if (perMonth / 4.3 > 25) out.push('- זה יותר מ-25 פגישות בשבוע. כנראה שצריך לדבר על מחיר, חבילות או מוצר נוסף, ולא רק על עוד לקוחות.');
  }
  const current = str(a, 'current_state');
  if (current) { out.push('## איפה העסק היום, במילים שלו'); out.push(`- "${quote(current, 300)}"`); }

  out.push('## חוזקות שאפשר להישען עליהן');
  const strengths = listItems(str(a, 'strengths'));
  if (strengths.length) out.push(...strengths.map(s => `- ${quote(s, 100)}`));
  const unique = str(a, 'unique');
  if (unique) out.push(`- מה מיוחד בו: "${quote(unique)}"`);
  if (!strengths.length && !unique) out.push('- לא כתב חוזקות. שווה לשאול עליהן בפגישה.');

  out.push('## חסמים ונקודות לחיזוק');
  const weaknesses = listItems(str(a, 'weaknesses'));
  if (weaknesses.length) out.push(...weaknesses.map(s => `- ${quote(s, 100)}`));
  const blockers = str(a, 'blockers');
  if (blockers) out.push(`- מה יכול לעכב, לדעתו: "${quote(blockers)}"`);
  const diff = str(a, 'differentiation');
  if (!diff || /^(לא|אין|עדיין לא|לא יודע)/.test(diff)) out.push('- אין בידול מוגדר. זו נקודה מרכזית לעבודה.');

  const tools = str(a, 'digital_tools');
  const toolsQ = allQuestions(QUESTIONNAIRES.strategy).find(q => q.id === 'digital_tools');
  if (tools || str(a, 'channels')) {
    out.push('## שיווק');
    if (tools) out.push(`- כלים קיימים: ${tools}`);
    const has = (o: string) => tools.includes(o);
    const missing = (toolsQ?.options ?? []).filter(o => o !== 'עוד אין לי' && !has(o));
    const key = ['רשימת תפוצה במייל', 'דף נחיתה', 'אתר', 'קבוצת וואטסאפ'].filter(o => missing.includes(o));
    if (tools && key.length) out.push(`- עוד אין לו: ${key.join(', ')}`);
    const channels = str(a, 'channels');
    if (channels) out.push(`- מה ניסה עד היום: "${quote(channels)}"`);
  }

  const desired = str(a, 'desired_result');
  const failure = str(a, 'failure');
  if (desired || failure) {
    out.push('## מה הוא רוצה לקבל');
    if (desired) out.push(`- התוצאה שהוא רוצה: "${quote(desired, 240)}"`);
    if (failure) out.push(`- מה ייחשב בעיניו כישלון: "${quote(failure)}"`);
  }

  out.push('## הצעה למיקוד הפגישה הראשונה');
  if (price && target) out.push('- לפרק את יעד ההכנסה למספר לקוחות, מחיר ומבנה הצעה.');
  if (!diff) out.push('- לנסח יחד בידול ראשוני: למי הוא עוזר, ובמה הוא שונה מאחרים.');
  if (blockers) out.push('- לגעת בחסם שהוא עצמו כתב, ולבנות צעד ראשון שעוקף אותו.');
  if (!(price && target) && diff && !blockers) out.push('- להתחיל מהתוצאה שהוא רוצה, ולבנות ממנה תוכנית ל-90 יום.');

  out.push('## 3 שאלות לשאול בפגישה');
  const qs = [
    price && target ? 'כמה לקוחות פעילים יש לך היום, וכמה מהם הגיעו מהפניות?' : 'כמה לקוחות יש לך היום, וכמה אתה רוצה?',
    diff ? 'אם לקוח היה צריך להסביר לחבר למה ללכת דווקא אליך, מה הוא היה אומר?' : 'למה לקוח יבחר דווקא בך ולא במטפל אחר?',
    'מה עצר אותך עד היום מלהעלות מחיר או להוסיף מסלול פרימיום?',
  ];
  out.push(...qs.map(q => `- ${q}`));

  return out.join('\n');
}

export function buildRuleSummary(rec: QRecord): string {
  const text = rec.qid === 'mental' ? mentalSummary(rec) : strategySummary(rec);
  return text.slice(0, 12000);
}
