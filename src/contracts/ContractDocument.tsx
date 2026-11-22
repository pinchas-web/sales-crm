/**
 * הסכם ליווי פרימיום — תבנית אחת שמתמלאת לכל לקוח.
 *
 * mode="pages": עמודי A4 מעוצבים (הבלנק בעמוד הראשון), חלוקה אוטומטית לעמודים
 *               לפי הגובה האמיתי של כל קטע. משמש לתצוגה במחשב ולהפקת ה-PDF.
 * mode="flow":  אותו תוכן ברצף, לקריאה נוחה בטלפון.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BONUSES, TRACKS, type ContractData } from '../../api/_lib/contractTypes';
import './contract.css';

export interface SignedInfo {
  name: string;
  idNumber: string;
  signedAt: string;
  signatureDataUrl: string;
}

interface Block { key: string; node: ReactNode; keepWithNext?: boolean }

const MM = 96 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const FIRST_AVAIL = (277 - 98) * MM;   // מתחת לבלנק ועד התחתית
const OTHER_AVAIL = (277 - 44) * MM;

const nis = (n: number) => n.toLocaleString('he-IL');
export function heDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STEPS: { t: string; d: string; chips?: string[] }[] = [
  { t: 'פגישת ייעוץ ואסטרטגיה שבועית,', d: 'באורך שעה וחצי עם פנחס בעצמו, כדי שתתקדמו באופן משמעותי ועקבי. במהלך הפגישות נשים דגש על:', chips: ['שיווק ומכירות', 'בניית מוצרים נוספים', 'שיפור תהליכי מכירה', 'מסע לקוח משודרג', 'בניית סיסטם ברור ללקוחות'] },
  { t: 'בדיקת ברומטר של המצב הקיים בעסק כיום.', d: 'כדי שנוכל להוביל אתכם להצלחה, אנחנו חייבים לדעת איפה אתם נמצאים היום. כך נוכל להפוך את העסק לרווחי יותר, עם כמה שפחות הוצאות נוספות.' },
  { t: 'ליווי בתהליכי קבלת החלטות עסקיות.', d: 'בניית SWOT עסקי ואישי, כדי שנכיר לעומק את היכולות שלכם ושל העסק שלכם גם לעומת המתחרים בשוק, ונבנה את האסטרטגיה השיווקית בהתאמה לחוזקות ולחולשות האישיות שלכם ושל העסק שלכם.' },
  { t: 'בניית חזון לטווח הרחוק,', d: 'כדי שנוכל לעבוד כבר מהיום בהתאמה לחלום הגדול.' },
  { t: 'בניית אסטרטגיה', d: 'מתוך המוצרים הקיימים, או נתינת רעיונות נוספים להגדלת רווחיות המוצרים.' },
  { t: 'בניית פרופיל לקוח מדויק,', d: 'כדי שהשיווק יביא באמת תוצאות, ונוכל למכור במחירים גבוהים יותר.' },
  { t: 'סקירת שוק וניתוח מתחרים.', d: 'חקר שוק – כולל חקר רשת ושיחות עם קהל היעד הפוטנציאלי, כדי שנדע לבנות עבורכם את המוצרים הרווחיים ביותר, ואת הנישה המדויקת שבה אתם האוטוריטה.' },
  { t: 'בניית משפך שיווקי,', d: 'כדי שהלקוחות המדויקים שלכם ימצאו אתכם, ויגיעו בשלים לשלב המכירה.' },
  { t: 'איתור הזדמנויות עסקיות חדשות', d: 'ופיתוח מוצרים נוספים לפי הצורך, כי תמיד אפשר להגדיל את הרווחיות.' },
  { t: 'אריזת המוצרים,', d: 'כדי שהמוצרים שלכם יימכרו ברווח שיצדיק את ההשקעה שלכם.' },
  { t: 'כתיבה שיווקית של 2 מוצרים', d: 'לבחירת הלקוח (כגון מדריך חינמי, פלייר פרסומי וכדומה), כדי שכל מוצר שלכם ייראה וואו!' },
  { t: 'שקיפות מלאה.', d: 'התהליך כולו נעשה בשקיפות מלאה מולכם, כדי שתוכלו לעשות תהליכים נוספים כאלו בהמשך בעצמכם.' },
  { t: 'סיוע בבניית תוכניות עבודה ותקציב,', d: 'כדי שחשבון הבנק שלכם גם ירגיש את השדרוג.' },
];

function H2({ n, children, big }: { n: number; children: ReactNode; big?: boolean }) {
  return <div className={`hc-h2${big ? ' big' : ''}`}><span className="n">{n}</span>{children}</div>;
}
function Cl({ n, children }: { n: string; children: ReactNode }) {
  return <div className="hc-cl"><span className="cn">{n}</span><div>{children}</div></div>;
}

function buildBlocks(data: ContractData, signed?: SignedInfo, preparedAt?: string): Block[] {
  const track = TRACKS[data.track];
  const bonuses = [
    ...BONUSES.filter(b => data.bonuses.includes(b.id)),
    ...(data.extraBonus ? [{ id: 'extra', title: data.extraBonus, text: '', extra: undefined }] : []),
  ];
  const firstName = data.clientName.trim().split(/\s+/)[0];
  const B: Block[] = [];
  const add = (key: string, node: ReactNode, keepWithNext = false) => B.push({ key, node, keepWithNext });

  add('title', <>
    <div className="hc-title">הסכם ליווי <span>פרימיום</span> 2026</div>
    <div className="hc-sub">שלום וברכה, ומזל טוב על הצטרפותכם לתהליך הפרימיום!</div>
    <div className="hc-for">הוכן עבור: <b>{data.clientName}</b>{preparedAt ? <> · {heDate(preparedAt)}</> : null}</div>
  </>);
  if (data.personalNote) {
    add('personal', <div className="hc-personal"><div className="k">{firstName}, כמה מילים אישיות לפני שמתחילים</div><div className="v">{data.personalNote}</div></div>);
  }
  add('i1', <p className="hc-p">במסמך זה תבינו בדיוק מה המסלול שאנחנו הולכים לעבור יחד.</p>);
  add('i2', <p className="hc-p"><b>קצת רקע:</b> עולמות השיווק והמכירות הם עולמות נפלאים, שמשלבים התפתחות אישית, בירור פנימי מעמיק של בעל העסק, יחד עם הבנת הבשורה הייחודית שאתה יכול והולך לבשר לעולם.</p>);
  add('i3', <p className="hc-p">כיוון שכך, המסע הוא צעידה משותפת לנו ולכם.</p>);
  add('i4', <p className="hc-p">אנחנו ב'בית למטפלים ומאמנים' מתחייבים להביא את המקצועיות, המיקוד והאסטרטגיה (כפי שנפרט בהמשך החוזה).</p>);
  add('i5', <p className="hc-p">ואתם, בעלי העסק, מתחייבים לרתום את כל כולכם לתהליך! לבצע את כלל המטלות ושיעורי הבית, לנהל את שיחות המכירה בהתאם למודל המכירות, ולספק לי ולצוות את החומרים הדרושים לנו, כדי שנוכל להוביל אתכם לתוצאה הטובה ביותר במהירות הגבוהה ביותר.</p>);
  add('goal', <div className="hc-goal"><div className="k">מטרת התהליך</div><div className="v">להגדיל את הרווחיות בעסק בצורה משמעותית ולאורך זמן, בהשקעה חד פעמית, באמצעות בניית תהליכי שיווק ומכירה.</div></div>);
  add('time', <div className="hc-note">לרוב מדובר בתהליך שלוקח בין 3 ל־6 חודשים, אך נדגיש כי <b>אין התחייבות להצלחת התהליך בפרק הזמן הנ"ל.</b></div>);

  add('h1', <H2 n={1} big>מה אתם הולכים לקבל כאן</H2>, true);
  add('h1p', <p className="hc-p">התהליך כולו מורכב משישה שלבים בנויים, ובמרכזו – אסטרטגיה.</p>, true);
  STEPS.forEach((s, i) => add(`s${i}`, (
    <div className="hc-step"><span className="num">{i + 1}</span><b>{s.t}</b> {s.d}
      {s.chips && <div className="hc-chips">{s.chips.map(c => <span key={c}>{c}</span>)}</div>}
    </div>
  ), i === STEPS.length - 1));
  add('stress', <div className="hc-note"><b>נדגיש:</b> חלק מהדברים יתבצעו במהלך ותוך כדי הפגישות, וחלקם בין הפגישות.</div>);

  if (bonuses.length > 0) {
    add('h2', <H2 n={2}>בונוסים</H2>, true);
    bonuses.forEach((b, i) => add(`b-${b.id}`, (
      <div className="hc-bonus"><div className="bn">{i + 1}</div><div>
        <span className="t">{b.title}</span>{b.text}
        {b.extra && <div className="x">{b.extra}</div>}
      </div></div>
    )));
  }
  add('closing', <div className="hc-closing">ואנחנו נעשה הכל במיומנות, במקצועיות, וניתן את מירב הידע והניסיון שברשותנו לטובתכם.</div>);

  add('h3', <H2 n={3}>מה לא כלול במחיר</H2>, true);
  add('h3p', <p className="hc-p">מובהר כי השירותים אינם כוללים עיצוב, גרפיקה, תכנות או שירותי צדדים שלישיים, ואלו יירכשו בנפרד על ידי המזמין. המזמין מודע לכך שייתכנו עלויות נוספות לפי הצורך, כגון גרפיקה, מיתוג, פרסום וכדומה, והיועץ מספק אך ורק שירותי ייעוץ.</p>);

  add('h4', <H2 n={4}>אחריות</H2>, true);
  add('c41', <Cl n="4.1">היועץ יבצע את השירותים בצורה מקצועית, תוך הקפדה על רמה מקצועית נאותה. עם זאת, היועץ אינו מתחייב לתוצאה כלשהי ואינו אחראי ליישום ההמלצות על ידי המזמין.</Cl>);

  add('h5', <H2 n={5}>סודיות וקניין רוחני</H2>, true);
  add('c51', <Cl n="5.1">היועץ מתחייב לשמור בסודיות מלאה כל מידע שיימסר לו על ידי המזמין בקשר למתן השירותים.</Cl>);
  add('c52', <Cl n="5.2">זכויות היוצרים וקניין רוחני אחר הקשור לשירותים יהיו שייכים ליועץ. עם זאת, המזמין יהיה רשאי לעשות שימוש בתוצרי השירותים לצרכיו העסקיים בלבד.</Cl>);
  add('c53', <Cl n="5.3">הלוגו ו/או שמו של המזמין יופיע באתר האינטרנט של היועץ כלקוח.</Cl>);
  add('c54', <Cl n="5.4">על חומרים שנערכו או נכתבו על ידי היועץ, יופיע הלוגו של היועץ.</Cl>);

  add('h6', <H2 n={6}>תקופת ההסכם והסדר התשלום</H2>, true);
  add('c61', <Cl n="6.1">במסגרת ההסכם, המזמין יהיה זכאי לקבל שירותי ליווי אישי במסלול הבא:</Cl>, true);
  add('price', (
    <div className="hc-price"><div className="blob" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="lbl">{track.label}</div>
        <div className="name">{track.title}</div>
        <div className="desc">{track.desc}{data.startDate ? ` תחילת הליווי: ${heDate(data.startDate)}.` : ''}</div>
      </div>
      <div className="amt">{nis(data.price)} ₪<small>+ מע"מ</small></div>
    </div>
  ));
  add('c62', <Cl n="6.2">תקופת הליווי תיחשב כיחידה אחת שלמה, בהתאם למסלול שנבחר, ותחושב לפי חודשים קלנדריים ממועד הפגישה הראשונה.</Cl>);

  add('h7', <H2 n={7}>מדיניות ביטולים</H2>, true);
  add('c71', <Cl n="7.1">לצורך הבטחת מקום בתהליך, יבוצע תשלום דמי רישום בסך 800 ש"ח, אשר לא יוחזרו בשום מקרה – גם אם המזמין יבחר שלא להמשיך לשלב החתימה, או לא יתחיל בפועל את התהליך.</Cl>);
  add('c72', <Cl n="7.2">לאחר החתימה על ההסכם, תהיינה למזמין שתי נקודות יציאה מההתקשרות, בהתאם לתנאים הבאים:</Cl>, true);
  add('exits', (
    <div className="hc-exits">
      <div className="hc-exit">
        <div className="eh">נקודת יציאה ראשונה <span>30 יום</span></div>
        <dl>
          <dt>מועד</dt><dd>בתום שלושים (30) ימים ממועד הפגישה הראשונה.</dd>
          <dt>תנאי</dt><dd>המזמין יהיה רשאי להודיע על רצונו לסיים את ההתקשרות.</dd>
          <dt>החזר</dt><dd>יינתן החזר כספי על יתרת הסכום ששולם, בניכוי 4,000 ש"ח + מע"מ, המהווים תשלום עבור שירותים שניתנו ופתיחת תיק ליווי אישי, וקיזוז הוצאות נוספות במידה והיו.</dd>
        </dl>
      </div>
      <div className="hc-exit">
        <div className="eh">נקודת יציאה שנייה <span>60 יום</span></div>
        <dl>
          <dt>מועד</dt><dd>בתום שישים (60) ימים ממועד הפגישה הראשונה.</dd>
          <dt>תנאי</dt><dd>המזמין יהיה רשאי להודיע על רצונו לסיים את ההתקשרות.</dd>
          <dt>החזר</dt><dd>יינתן החזר כספי על יתרת הסכום ששולם, בניכוי 7,800 ש"ח + מע"מ, וקיזוז הוצאות נוספות במידה והיו.</dd>
        </dl>
      </div>
    </div>
  ));
  add('exitnote', <div className="hc-note">בשתי נקודות היציאה: במידה והיו הוצאות נוספות, חובה על היועץ להוכיח את אותן הוצאות.</div>);
  add('c73', <Cl n="7.3">לאחר שתי נקודות היציאה הנ"ל, לא תינתן אפשרות לביטול ההתקשרות, והמזמין יחויב במלוא עלות תקופת הליווי שהוסכמה מראש.</Cl>);
  add('c74', <Cl n="7.4">היה ותהליך הליווי יימשך מעבר לתקופה שנקבעה, כל אחד מהצדדים יהיה רשאי לסיים את ההתקשרות בהודעה מוקדמת בכתב של שלושים (30) ימים, שתישלח לצד השני (לרבות באמצעות דוא"ל).</Cl>);

  add('h8', <H2 n={8}>סודיות לאחר סיום</H2>, true);
  add('h8p', <p className="hc-p">עם סיום ההסכם, מכל סיבה שהיא, ימשיך לחול סעיף הסודיות.</p>, true);

  add('sign', <>
    <div className="hc-sign-intro">ולראיה באו הצדדים על החתום:</div>
    <div className="hc-signs">
      <div className="hc-sign">
        <h3>היועץ</h3>
        <div className="hc-line"><span>שם:</span><i>פנחס הורביץ</i></div>
        <div className="hc-line"><span>ת.ז.:</span><i>311606727</i></div>
        <div className="hc-line"><span>תאריך:</span><i>{heDate(preparedAt)}</i></div>
      </div>
      <div className="hc-sign">
        <h3>המזמין</h3>
        <div className="hc-line"><span>שם:</span><i>{signed?.name ?? ''}</i></div>
        <div className="hc-line"><span>ת.ז.:</span><i>{signed?.idNumber ?? ''}</i></div>
        <div className="hc-line"><span>חתימה:</span><i>{signed && <img src={signed.signatureDataUrl} alt="חתימה" />}</i></div>
        <div className="hc-line"><span>תאריך:</span><i>{signed ? heDate(signed.signedAt) : ''}</i></div>
      </div>
    </div>
    <div className="hc-slogan">להרוויח מעולם <span>שכולו שליחות</span></div>
    {signed && (
      <div className="hc-meta">
        נחתם דיגיטלית ב־{new Date(signed.signedAt).toLocaleString('he-IL')}
      </div>
    )}
  </>);

  return B;
}

const WAVE = (
  <svg viewBox="0 0 210 34" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0 H102 C98 13 90 24 74 28.5 C60 32 42 31 26 32 C15 32.6 7 33.5 0 34 Z" fill="#F1ECD3" />
  </svg>
);

function Page({ index, total, children }: { index: number; total: number; children: ReactNode }) {
  const first = index === 0;
  return (
    <div className={`hc-page${first ? ' first' : ''}`} data-page={index}>
      {!first && <div className="hc-head">{WAVE}<img src="/contract/logo-crop.jpg" alt="פנחס הורביץ" /><div className="hc-tag">הסכם ליווי פרימיום 2026</div></div>}
      <div className="hc-bh">ב"ה</div>
      <div className="hc-content">{children}</div>
      <div className="hc-foot">
        <span>{first ? 'פנחס הורביץ · הבית למטפלים ומאמנים' : '052-7117224 · pinchashorvitz.co.il · pinchas@pinchashorvitz.co.il'}</span>
        <span className="pg">עמוד {index + 1} מתוך {total}</span>
      </div>
    </div>
  );
}

function paginate(heights: number[], blocks: Block[]): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  let avail = FIRST_AVAIL;
  const breakPage = () => { pages.push(cur); cur = []; used = 0; avail = OTHER_AVAIL; };
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (cur.length && used + h > avail) breakPage();
    // כותרת (וכל מה שצמוד אליה) לא נשארת לבד בתחתית עמוד
    if (cur.length && blocks[i].keepWithNext) {
      let chain = 0;
      let j = i;
      while (j < heights.length) { chain += heights[j]; if (!blocks[j].keepWithNext) break; j++; }
      if (used + chain > avail && chain <= OTHER_AVAIL) breakPage();
    }
    cur.push(i);
    used += h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export default function ContractDocument({ data, signed, preparedAt, mode = 'pages', scale = 1, onReady }: {
  data: ContractData;
  signed?: SignedInfo;
  preparedAt?: string;
  mode?: 'pages' | 'flow';
  scale?: number;
  /** נקרא כשהעמודים מוכנים (אחרי טעינת הפונטים והחלוקה) — עם רכיבי העמודים, להפקת PDF */
  onReady?: (pages: HTMLElement[]) => void;
}) {
  const blocks = useMemo(() => buildBlocks(data, signed, preparedAt), [data, signed, preparedAt]);
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [layout, setLayout] = useState<number[][] | null>(null);

  useEffect(() => {
    let alive = true;
    const fonts = ['700 12px HCTzar', '700 12px HCNeue', '500 12px HCNeue', '400 12px HCAlmoni'];
    Promise.all(fonts.map(f => document.fonts.load(f).catch(() => null)))
      .then(() => document.fonts.ready)
      .then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    if (mode !== 'pages' || !fontsReady || !measureRef.current) return;
    const kids = Array.from(measureRef.current.children) as HTMLElement[];
    setLayout(paginate(kids.map(k => k.getBoundingClientRect().height), blocks));
  }, [blocks, fontsReady, mode]);

  useEffect(() => {
    if (!onReady || !layout || !pagesRef.current) return;
    const els = Array.from(pagesRef.current.querySelectorAll<HTMLElement>('.hc-page'));
    // לחכות לטעינת התמונות (בלנק, לוגו, חתימה) לפני שמצלמים
    const imgs = Array.from(pagesRef.current.querySelectorAll('img'));
    Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })))
      .then(() => new Promise(r => requestAnimationFrame(() => r(null))))
      .then(() => onReady(els));
  }, [layout, onReady]);

  if (mode === 'flow') {
    return (
      <div className="hc-doc hc-flow">
        <div className="hc-flow-head"><img src="/contract/logo-crop.jpg" alt="פנחס הורביץ" /><span>ב"ה</span></div>
        {blocks.map(b => <div key={b.key} className="hc-blk">{b.node}</div>)}
      </div>
    );
  }

  return (
    <div className="hc-doc">
      {/* מדידה נסתרת של כל קטע ברוחב העמוד */}
      <div ref={measureRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: '170mm', visibility: 'hidden' }}>
        {blocks.map(b => <div key={b.key} className="hc-blk">{b.node}</div>)}
      </div>
      <div ref={pagesRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * scale }}>
        {!layout && <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#888' }}>מכין את ההסכם…</div>}
        {layout?.map((idxs, pi) => (
          <div key={pi} style={{ width: PAGE_W * scale, height: PAGE_H * scale, position: 'relative', flex: 'none', boxShadow: scale < 1 ? '0 2px 14px rgba(0,0,0,.12)' : undefined }}>
            <div style={{ position: 'absolute', top: 0, left: 0, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: 'top left' }}>
              <Page index={pi} total={layout.length}>
                {idxs.map(i => <div key={blocks[i].key} className="hc-blk">{blocks[i].node}</div>)}
              </Page>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PAGE_WIDTH_PX = PAGE_W;
