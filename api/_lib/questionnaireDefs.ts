/**
 * שאלונים ללקוחות לפני פגישה — התוכן, סוגי השאלות וחישוב הציונים.
 * קובץ טהור (בלי Node ובלי דפדפן): השרת והמסך מייבאים אותו, כך שהחישוב זהה בשני הצדדים.
 *
 * עריכת שאלה: משנים כאן את הטקסט. אל תשנו את ה-id של שאלה שכבר נענתה — לפיו נשמרות התשובות.
 */

export type QuestionnaireId = 'strategy' | 'mental';

export type QuestionKind =
  | 'text'      // שורה אחת
  | 'long'      // טקסט חופשי ארוך
  | 'email'
  | 'phone'
  | 'number'
  | 'list5'     // חמישה פריטים קצרים (נשמר כטקסט, שורה לכל פריט)
  | 'multi'     // בחירה מרובה + "אחר" (נשמר כטקסט, פריטים מופרדים ב-" · ")
  | 'scale7';   // דירוג 1–7

/** כיוון ההיגד בחישוב הציון: 1 = הסכמה היא חוזקה, -1 = הסכמה היא קושי (הפוך), 0 = לא נכנס לציון */
export type Polarity = 1 | -1 | 0;

export interface Question {
  id: string;
  kind: QuestionKind;
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  polarity?: Polarity;
  /** שדות פרטי קשר — לא מוצגים בקישור אישי (הפרטים כבר בתיק הלקוח) */
  contact?: 'name' | 'phone' | 'email';
}

export interface Section {
  id: string;
  title: string;
  /** שם קצר למה שהציון מודד (רק באבחון המנטלי) */
  scoreLabel?: string;
  intro?: string;
  questions: Question[];
}

export interface QuestionnaireDef {
  id: QuestionnaireId;
  title: string;
  shortTitle: string;
  minutes: string;
  greeting: string;
  intro: string[];
  tips?: string[];
  scaleIntro?: { title: string; text: string; labels: string[] };
  outroTitle: string;
  outro: string;
  sections: Section[];
}

export const SCALE_LABELS = [
  'אף פעם', 'נדיר מאוד', 'נדיר', 'לפעמים', 'לעיתים קרובות', 'לעיתים קרובות מאוד', 'תמיד',
];

// ─── שאלון אסטרטגיה עסקית ────────────────────────────────────────────────────

const STRATEGY: QuestionnaireDef = {
  id: 'strategy',
  title: 'שאלון לפני פגישת אסטרטגיה',
  shortTitle: 'שאלון אסטרטגיה עסקית',
  minutes: '10–15 דקות',
  greeting: 'אני שמח שבחרת לבנות את העסק שלך נכון.',
  intro: [
    'אני מאמין שלכל אחד מאיתנו יש אפשרות להפוך את העולם למקום טוב יותר, ולהרוויח יפה ממילוי השליחות שלו.',
    'כדי שכל דקה בפגישת האסטרטגיה שלנו תהיה לטובת ההצלחה העסקית שלך, אני מבקש ממך לענות על כמה שאלות. כך נכיר טוב יותר, ונתחיל לבנות כבר עכשיו את האסטרטגיה שלך לטווח הארוך.',
    'תקדיש לזה תשומת לב, זה לא ייקח הרבה זמן. ובעזרת ה\' נצא לדרך חדשה.',
  ],
  outroTitle: 'מחכה לפגוש אותך',
  outro: 'קיבלתי את התשובות שלך. אני עובר עליהן לפני הפגישה, כדי שנגיע אליה מוכנים ונשתמש בזמן רק במה שבאמת יקדם אותך.',
  sections: [
    {
      id: 'about', title: 'קצת עליך',
      questions: [
        { id: 'name', kind: 'text', label: 'איך קוראים לך?', placeholder: 'שם פרטי ומשפחה', required: true, contact: 'name' },
        { id: 'phone', kind: 'phone', label: 'מה מספר הנייד שלך?', required: true, contact: 'phone' },
        { id: 'email', kind: 'email', label: 'ומה כתובת המייל?', contact: 'email' },
        { id: 'address', kind: 'text', label: 'איפה אתה גר?', placeholder: 'עיר, ואם תרצה גם כתובת' },
        { id: 'age', kind: 'number', label: 'בן כמה אתה?' },
      ],
    },
    {
      id: 'business', title: 'העסק שלך היום',
      questions: [
        { id: 'business', kind: 'long', label: 'איזה עסק יש לך?', hint: 'במה אתה עוסק, למי אתה עוזר, ואיך זה נראה ביום־יום.' },
        { id: 'training', kind: 'long', label: 'אילו לימודים והכשרות עשית?' },
        { id: 'method', kind: 'long', label: 'באיזו שיטה אתה עובד?' },
        { id: 'seniority', kind: 'text', label: 'כמה זמן אתה בתחום?', placeholder: 'לדוגמה: 4 שנים' },
        { id: 'current_state', kind: 'long', label: 'מה המצב בעסק כרגע?', hint: 'כמה לקוחות, כמה פגישות בשבוע, מה עובד ומה פחות.' },
        { id: 'session_price', kind: 'text', label: 'כמה אתה גובה על פגישה?', placeholder: 'לדוגמה: 350 ₪' },
      ],
    },
    {
      id: 'goals', title: 'לאן הולכים',
      questions: [
        { id: 'desired_result', kind: 'long', label: 'לאיזו תוצאה אתה רוצה שאקח אותך?' },
        { id: 'five_years', kind: 'long', label: 'איפה אתה רואה את עצמך בעוד 5 שנים?' },
        { id: 'failure', kind: 'long', label: 'מה, אם יקרה, ייחשב בעיניך כישלון?' },
        { id: 'target_income', kind: 'text', label: 'לאיזו הכנסה חודשית אתה רוצה להגיע?', placeholder: 'לדוגמה: 40,000 ₪' },
      ],
    },
    {
      id: 'you', title: 'מי אתה',
      questions: [
        { id: 'strengths', kind: 'list5', label: 'כתוב 5 חוזקות אישיות שלך' },
        { id: 'weaknesses', kind: 'list5', label: 'וכתוב 5 חולשות אישיות שלך', hint: 'כנות כאן תעזור לנו לבנות אסטרטגיה שמתאימה בדיוק לך.' },
        { id: 'unique', kind: 'long', label: 'מה מיוחד דווקא בך?' },
        { id: 'differentiation', kind: 'long', label: 'יש לך בידול? אם כן, מהו?' },
      ],
    },
    {
      id: 'marketing', title: 'שיווק',
      questions: [
        { id: 'channels', kind: 'long', label: 'באילו ערוצי שיווק השקעת עד היום?', hint: 'ומה יצא מכל אחד מהם.' },
        {
          id: 'digital_tools', kind: 'multi', label: 'אילו כלים דיגיטליים יש לך כרגע?', hint: 'אפשר לבחור כמה. ואם יש עוד משהו, כתוב אותו למטה.',
          options: ['רשימת תפוצה במייל', 'קבוצת וואטסאפ', 'רשימת שידור בוואטסאפ', 'פייסבוק', 'אינסטגרם', 'יוטיוב', 'טיקטוק', 'לינקדאין', 'אתר', 'דף נחיתה', 'עוד אין לי'],
        },
      ],
    },
    {
      id: 'path', title: 'הדרך להצלחה',
      questions: [
        { id: 'blockers', kind: 'long', label: 'מה לדעתך יכול לעכב את ההצלחה שלך?' },
        { id: 'helpers', kind: 'long', label: 'מה לדעתך יעזור לך להגיע להצלחה הגדולה שלך?' },
      ],
    },
  ],
};

// ─── אבחון מנטלי ─────────────────────────────────────────────────────────────

const s = (id: string, label: string, polarity: Polarity): Question => ({ id, kind: 'scale7', label, polarity, required: true });

const MENTAL: QuestionnaireDef = {
  id: 'mental',
  title: 'אבחון מנטלי',
  shortTitle: 'אבחון מנטלי',
  minutes: '25–35 דקות',
  greeting: 'אני רוצה להכיר אותך קצת יותר, באופן אישי.',
  intro: [
    'כדי שאוכל לעזור לך להשיג את המטרות האישיות שלך, אני צריך להכיר אותך טוב יותר, ובמצבים שונים בחיים שלך.',
    'התשובות שלך יאפשרו לי להכיר אותך לעומק ולהתאים לך כלים אישיים. ככל שתשתף יותר, כך אוכל לעזור לך לזהות את הפוטנציאל הגדול ביותר שיש בך.',
  ],
  tips: [
    'קח כמה דקות טובות של שקט. שים את הנייד בצד, במצב טיסה.',
    'ענה בכנות ובפירוט, ככל שתוכל. אין הגבלת אורך.',
    'אפשר לעצור באמצע ולחזור. התשובות נשמרות במכשיר שלך עד שתשלח.',
  ],
  scaleIntro: {
    title: 'עכשיו, האבחון עצמו',
    text: 'בכל מסך יופיע משפט אחד. דרג מ-1 עד 7 עד כמה הוא מתאר אותך. אין תשובות נכונות או לא נכונות, יש רק תשובות כנות.',
    labels: SCALE_LABELS,
  },
  outroTitle: 'עשית את זה!',
  outro: 'תודה רבה על הזמן ועל הכנות. אני עובר על התשובות שלך בעיון לפני שנתחיל, כדי שהתהליך יהיה מותאם בדיוק אליך. העולם זקוק להשראה שלך.',
  sections: [
    {
      id: 'details', title: 'נתחיל עם פרטים',
      questions: [
        { id: 'name', kind: 'text', label: 'איך קוראים לך?', placeholder: 'שם פרטי ומשפחה', required: true, contact: 'name' },
        { id: 'email', kind: 'email', label: 'מה כתובת המייל שלך?', required: true, contact: 'email' },
        { id: 'phone', kind: 'phone', label: 'ומה מספר הנייד?', required: true, contact: 'phone' },
      ],
    },
    {
      id: 'intro', title: 'שלב ההיכרות',
      questions: [
        { id: 'story', kind: 'long', label: 'איך הגעת למקום ולשלב שבו אתה נמצא היום?', hint: 'מה עבר עליך? שתף אותי בכל מה שחשוב לך שאדע.' },
        { id: 'about_me', kind: 'long', label: 'ספר לי על עצמך', hint: 'אל תחסוך במילים.' },
        { id: 'trigger', kind: 'long', label: 'מה הוביל אותך להגיע אליי דווקא עכשיו?', hint: 'היה אירוע מסוים? משהו קרה? משהו הבשיל?' },
        { id: 'pattern', kind: 'long', label: 'יש משהו שלדעתך מעכב אותך בחיים?', hint: 'התנהגות שלך שחוזרת על עצמה במצבים שונים, בכמה תחומים בחיים.' },
        { id: 'achievement', kind: 'long', label: 'מה ההישג הכי גדול שלך בחיים? ומה ההישג הכי גדול שלך בשנתיים־שלוש האחרונות?' },
        { id: 'achievement_how', kind: 'long', label: 'מה היה שם?', hint: 'מה הביא אותך להישג הזה? מי היית שם, כאדם?' },
        { id: 'big_goal', kind: 'long', label: 'איזו מטרה גדולה אתה רואה מולך כרגע?' },
        { id: 'goal_gap', kind: 'long', label: 'מה עליך לעשות או לשפר כדי להגיע למטרה הזו?', hint: 'מבחינה אישית, מקצועית, מנטלית. כתוב כל מה שעולה, אין הגבלה.' },
        { id: 'dream', kind: 'long', label: 'מה באמת החלום שלך?', hint: 'היעד שאתה אפילו לא מעז לחשוב עליו. עם יד על הלב: מה החלום הגדול ביותר שלך, בקריירה ובחיים האישיים?' },
        { id: 'worries', kind: 'long', label: 'מה הכי מדאיג אותך היום? ומה מדאיג אותך שיקרה אם לא תשיג את המטרות שלך?', hint: 'מה אתה שומר בבטן ולא משתף, שלמעשה מונע ממך לפרוץ?' },
        { id: 'night_thoughts', kind: 'long', label: 'אילו מחשבות מעסיקות אותך בלילה?', hint: 'בקריירה, בחיים האישיים או באושר האישי שלך.' },
        { id: 'tried', kind: 'long', label: 'מה ניסית לעשות עד היום כדי להגשים את המטרות החשובות שלך, ועוד לא עבד?' },
        { id: 'top3', kind: 'long', label: 'מה 3 הדברים שהכי חשוב לך לקבל ממני בתהליך?' },
        { id: 'role_model', kind: 'long', label: 'מי המודל לחיקוי שלך, ולמה?', hint: 'מי האדם שהכי השפיע עליך? תן לפחות סיבה אחת שבגללה בחרת בו.' },
        { id: 'pressure', kind: 'long', label: 'מה זה לחץ בשבילך? איך הוא בא לידי ביטוי אצלך?', hint: 'נסה לפרט.' },
      ],
    },
    {
      id: 'goals', title: 'מטרות', scoreLabel: 'הצבת מטרות',
      questions: [
        s('g1', 'בתחילת כל שנה אני מציב לעצמי מטרות שאני רוצה להשיג: אישיות, עסקיות ואחרות, שמקדמות אותי אל השליחות שלי.', 1),
        s('g2', 'במהלך השנה אני בודק את ההתקדמות שלי אל המטרות שהצבתי.', 1),
        s('g3', 'בתחילת כל יום אני מציב לעצמי מטרות שאני רוצה להשיג באותו יום.', 1),
        s('g4', 'יש לי "טקס" בוקר אישי שמכניס אותי למיקוד ולהשראה.', 1),
      ],
    },
    {
      id: 'focus', title: 'ריכוז ומיקוד', scoreLabel: 'ריכוז ומיקוד',
      questions: [
        s('f1', 'כשיש הסחות דעת מבחוץ, אני יוצא מריכוז.', -1),
        s('f2', 'קשה לי להישאר ממוקד במחשבה אחת או ברעיון אחד.', -1),
        s('f3', 'אני נוטה לחשוב על התוצאה הסופית, ומתקשה להתמקד בתהליך.', -1),
      ],
    },
    {
      id: 'commitment', title: 'מחויבות', scoreLabel: 'מחויבות',
      questions: [
        s('c1', 'אני מסור ומחויב להצלחה שלי יותר מכל אדם אחר שאני מכיר.', 1),
        s('c2', 'אני אוהב לעבוד קשה כדי להשתפר.', 1),
        s('c3', 'אני מקריב מעצמי למען ההצלחה שלי.', 1),
      ],
    },
    {
      id: 'confidence', title: 'ביטחון עצמי', scoreLabel: 'ביטחון עצמי',
      questions: [
        s('b1', 'בתחילת היום אני ב"טירוף" להשיג את המטרות היומיות, וזה גורם לי להרגיש לחוץ ומתוח במשך היום.', -1),
        s('b2', 'יש לי ציפיות גבוהות מעצמי.', 0),
        s('b3', 'אני מתוסכל כשאני לא עומד בציפיות שלי מעצמי.', -1),
        s('b4', 'אחרי יום חלש אני מתחיל לעבוד קשה יותר, ולפעמים מביא את העבודה הביתה.', -1),
        s('b5', 'אני בטוח בעצמי וביכולות שלי יותר מכל אדם אחר שאני מכיר.', 1),
        s('b6', 'מבחינתי, או שיש לי יום טוב או שיש לי יום רע. אין באמצע.', -1),
        s('b7', 'הביטחון שלי עולה כשהמשימה הראשונה של היום מצליחה, ויורד אם התחלתי את היום ברגל שמאל.', -1),
        s('b8', 'דאגות ולחצים בבית משפיעים עליי ועל הביצועים שלי בעבודה.', -1),
        s('b9', 'ברגעים קריטיים אני לוקח אחריות, ולא בורח ממנה מפחד לטעות.', 1),
        s('b10', 'הביטחון העצמי שלי נשאר גבוה גם אחרי יום חלש, משבר או ציפיות שלא התממשו.', 1),
        s('b11', 'אני מאבד ביטחון אחרי ביקורת שמופנית אליי.', -1),
        s('b12', 'אני עדיין לא מצליח לעמוד בציפיות שיש לאחרים ממני.', -1),
      ],
    },
    {
      id: 'approval', title: 'אישור חברתי', scoreLabel: 'עצמאות מאישור חיצוני',
      questions: [
        s('a1', 'אחת המטרות שלי היא להרשים אנשים אחרים ביכולות שלי.', -1),
        s('a2', 'אני חושש לאכזב אנשים שחשובים לי אם אקבל החלטות לא נכונות.', -1),
        s('a3', 'אם אני לא מקבל כבוד והערכה מעמיתים, אני מרגיש חסר ערך.', -1),
        s('a4', 'אני רוצה להצליח כדי לרצות את האדם שעזר לי ותמך בי לאורך הדרך.', -1),
        s('a5', 'אני חושש ממה שאחרים יגידו אם אקבל החלטה שגויה, או אעשה צעד שאני רואה לנכון ואחרים לא.', -1),
        s('a6', 'אני אוהב להיות במרכז העניינים, בגלל תשומת הלב שזה נותן לי.', -1),
        s('a7', 'המעמד שלי לא יציב, ואני עדיין לא מקבל את הכבוד שמגיע לאדם עם הכישרון שלי.', -1),
        s('a8', 'אני מודאג ממה שאחרים חושבים עליי ועל היכולות שלי.', -1),
        s('a9', 'כשמעבירים עליי ביקורת, אני מרגיש משותק.', -1),
        s('a10', 'אני מביע את דעתי, גם כשאני יודע שהצד השני לא יסכים איתי.', 1),
      ],
    },
    {
      id: 'competitive', title: 'תחרותיות', scoreLabel: 'דחף תחרותי',
      questions: [
        s('t1', 'אני אוהב את תחושת הניצחון והגאווה, אחרי שהוכחתי שעמדתי ביעדים שהצבתי לעצמי.', 1),
        s('t2', 'אני אוהב כשיש לחץ, ויודע למנף אותו לטובתי.', 1),
        s('t3', 'כשיש לי הזדמנות להתקדם, אני מוכן לעשות כל מה שצריך.', 1),
        s('t4', 'אני אוהב את התחושה שתחרות מביאה איתה.', 1),
        s('t5', 'אני רואה את עצמי כמי שמתעלה ברגע האמת ופורח במצבי לחץ.', 1),
      ],
    },
    {
      id: 'self_talk', title: 'דיבור פנימי', scoreLabel: 'דיבור פנימי חיובי',
      questions: [
        s('d1', 'במהלך היום אני חושב ומדמיין רק תוצאות חיוביות.', 1),
        s('d2', 'ביום רע, או אחרי החלטה שגויה, אני קורא לעצמי בשמות גנאי כמו "חלש", "גרוע", "אפס".', -1),
        s('d3', 'בשיחות שלי עם עצמי אני מעודד, תומך וחושב חיובי.', 1),
        s('d4', 'יש לי מחשבות שליליות במהלך היום.', -1),
        s('d5', 'כשאני עושה טעות קריטית, אני אומר לעצמי משהו כמו "הנה, שוב אני מקבל החלטות גרועות".', -1),
      ],
    },
    {
      id: 'pressure', title: 'תפקוד תחת לחץ', scoreLabel: 'תפקוד תחת לחץ',
      questions: [
        s('p1', 'אני מתגבר בקלות על הטעויות שלי וממשיך הלאה, בלי להתעסק בהן.', 1),
        s('p2', 'אני פורח במצבי לחץ, ומתפקד טוב יותר כשנדרשות ממני תוצאות.', 1),
        s('p3', 'פעולות שאני מתכנן בראש בפשטות, הופכות בזמן אמת לקשות ומסובכות לביצוע.', -1),
        s('p4', 'כשהיום נגמר, אני מרגיש שהביטחון שלי עולה.', 1),
        s('p5', 'לפני ימים קריטיים וחשובים, קל לי יותר להיכנס לפוקוס.', 1),
        s('p6', 'כשיש לי הזדמנות להתבטא, אני בדרך כלל מוותר, כדי לא להישמע "הזוי" או להיות מובך.', -1),
        s('p7', 'בימים רגילים אני מפגין יכולת גבוהה, אבל בימים חשובים אני מהסס וחושב פעמיים לפני כל החלטה.', -1),
        s('p8', 'יש ימים שאני מגיע לעבודה בהתרגשות יתר, עם כאבי בטן או כבדות ועייפות, שפוגעים ביכולת שלי.', -1),
        s('p9', 'יש לי דאגות מחוץ לעבודה שמשפיעות על התפקוד שלי.', -1),
        s('p10', 'אני טוב יותר בתכנון ובחשיבה מאשר בביצוע ובסיום משימות.', -1),
      ],
    },
    {
      id: 'beliefs', title: 'ציפיות ואמונות', scoreLabel: 'אמונה עצמית מאוזנת',
      questions: [
        s('e1', 'יש לי ציפיות מוגזמות מעצמי.', -1),
        s('e2', 'חשוב לי לעמוד בציפיות של אחרים ממני, ואם לא, אני מרגיש מרוסק ומושפל.', -1),
        s('e3', 'אני מאמין בעצמי וביכולות שלי.', 1),
        s('e4', 'גם כשלא הולך לי, אני ממשיך לתת את כל כולי.', 1),
        s('e5', 'חשוב לי שכל יום יסתיים בצורה מושלמת, בדיוק כמו שתכננתי.', -1),
        s('e6', 'מחשבות על ימים שבהם אצטרך לקבל החלטות חשובות מכניסות אותי למתח, פחד ודאגה.', -1),
      ],
    },
    {
      id: 'fear', title: 'פחד מכישלון', scoreLabel: 'שליטה בפחד מכישלון',
      questions: [
        s('x1', 'הפרפרים שיש לי בבוקר של יום חשוב לא עוזבים אותי כל היום.', -1),
        s('x2', 'הפחד מכישלון מדאיג אותי.', -1),
        s('x3', 'אני שולט ברמת המתח שלי ביום עבודה.', 1),
        s('x4', 'הפחד מכישלון גורם לי "ללכת על בטוח" ולדחות החלטות חשובות, כדי לא לטעות.', -1),
        s('x5', 'אני מהסס ליזום פעולות יצירתיות, מחשש שאטעה ואפגע בשם הטוב שלי.', -1),
        s('x6', 'אני פוחד לסיים את חיי בתחושת החמצה, ולגלות שכל ההשקעה שלי בעצמי הייתה בזבוז זמן.', -1),
        s('x7', 'הציפיות של הסביבה שלי (משפחה, חברים, עמיתים) מלחיצות אותי.', -1),
        s('x8', 'אני אוהב לקחת סיכונים ולעשות דברים יצירתיים בתחום העיסוק שלי.', 1),
        s('x9', 'לטעות זה לא סוף העולם בשבילי.', 1),
      ],
    },
    {
      id: 'life', title: 'כבר מסיימים', scoreLabel: 'שביעות רצון מהחיים',
      questions: [
        s('l1', 'אני חי בזוגיות מאושרת. (אם אינך בזוגיות כרגע: אני מרגיש שאני בן הזוג שהייתי רוצה להיות.)', 1),
        s('l2', 'כשאני מסתכל על חשבון הבנק שלי, אני מרוצה.', 1),
        s('l3', 'אני אוהב את איך שאני נראה.', 1),
        s('l4', 'אני מרגיש שאני חי את הייעוד שלי בקריירה.', 1),
        s('l5', 'אני מרוצה מהמצב הבריאותי שלי.', 1),
        s('l6', 'החברים שלי הם אנשים משמעותיים בחיים שלי.', 1),
        s('l7', 'אני מרוצה מסגנון החיים שלי.', 1),
      ],
    },
    {
      id: 'final', title: 'שאלה אחרונה',
      questions: [
        {
          id: 'change_area', kind: 'long', required: false,
          label: 'באיזה תחום קפיצה קדימה תשפיע הכי הרבה על כל החיים שלך?',
          hint: 'זוגיות, כסף, חברים, משפחה, בריאות, סגנון חיים או תחום אחר. ולמה דווקא בו?',
        },
      ],
    },
  ],
};

export const QUESTIONNAIRES: Record<QuestionnaireId, QuestionnaireDef> = { strategy: STRATEGY, mental: MENTAL };

export function isQuestionnaireId(v: unknown): v is QuestionnaireId {
  return v === 'strategy' || v === 'mental';
}

export function allQuestions(def: QuestionnaireDef): Question[] {
  return def.sections.flatMap(sec => sec.questions);
}

/** השאלות שמוצגות בפועל: בקישור אישי מדלגים על שם, טלפון ומייל (כבר נמצאים בתיק הלקוח) */
export function visibleQuestions(def: QuestionnaireDef, personal: boolean): Question[] {
  return allQuestions(def).filter(q => !(personal && q.contact));
}

// ─── תשובות ───────────────────────────────────────────────────────────────────

export type Answers = Record<string, string | number>;

export const MAX_ANSWER_CHARS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  return d;
}

/** בדיקת תשובה אחת בצד המסך: מחזיר הודעת שגיאה או '' */
export function validateAnswer(q: Question, v: string | number | undefined): string {
  const empty = v === undefined || v === '' || (typeof v === 'string' && !v.trim());
  if (empty) return q.required ? (q.kind === 'scale7' ? 'בחר מספר מ-1 עד 7' : 'זה שדה חובה') : '';
  if (q.kind === 'email' && !EMAIL_RE.test(String(v).trim())) return 'כתובת המייל לא נראית תקינה';
  if (q.kind === 'phone') {
    const d = normalizePhone(String(v));
    if (d.length < 9 || d.length > 10) return 'מספר הטלפון לא נראה תקין';
  }
  if (q.kind === 'number' && !/^\d{1,3}$/.test(String(v).trim())) return 'כתוב מספר';
  if (q.kind === 'scale7' && !(Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 7)) return 'בחר מספר מ-1 עד 7';
  return '';
}

/**
 * ניקוי ואימות תשובות שהגיעו מבחוץ (בשרת).
 * מקבל רק שאלות מוכרות, חותך אורך, ובודק שדות חובה. מחזיר null אם משהו לא תקין.
 */
export function sanitizeAnswers(def: QuestionnaireDef, raw: unknown, personal: boolean): Answers | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Answers = {};
  for (const q of visibleQuestions(def, personal)) {
    const v = r[q.id];
    if (q.kind === 'scale7') {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 7) out[q.id] = n;
      else if (q.required) return null;
      continue;
    }
    if (typeof v !== 'string' && typeof v !== 'number') {
      if (q.required) return null;
      continue;
    }
    const str = String(v).split(String.fromCharCode(0)).join('').trim().slice(0, q.kind === 'long' || q.kind === 'list5' || q.kind === 'multi' ? MAX_ANSWER_CHARS : 200);
    if (!str) { if (q.required) return null; continue; }
    if (validateAnswer(q, str)) return null;
    out[q.id] = q.kind === 'phone' ? normalizePhone(str) : str;
  }
  return out;
}

// ─── ציונים (אבחון מנטלי) ─────────────────────────────────────────────────────

export interface SectionScore {
  id: string;
  title: string;
  label: string;
  /** 0–100, גבוה = חוזקה */
  pct: number;
  /** ממוצע 1–7 אחרי היפוך ההיגדים ההפוכים */
  avg: number;
  answered: number;
  level: 'strong' | 'mid' | 'focus';
}

export const LEVEL_LABELS: Record<SectionScore['level'], string> = {
  strong: 'חוזקה', mid: 'בינוני', focus: 'לחיזוק',
};

export function levelOf(pct: number): SectionScore['level'] {
  return pct >= 70 ? 'strong' : pct >= 45 ? 'mid' : 'focus';
}

export function scoreAnswers(def: QuestionnaireDef, answers: Answers): SectionScore[] {
  const out: SectionScore[] = [];
  for (const sec of def.sections) {
    const items = sec.questions.filter(q => q.kind === 'scale7' && q.polarity);
    if (!items.length) continue;
    const vals = items
      .map(q => ({ q, v: Number(answers[q.id]) }))
      .filter(x => Number.isInteger(x.v) && x.v >= 1 && x.v <= 7)
      .map(x => (x.q.polarity === -1 ? 8 - x.v : x.v));
    if (!vals.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pct = Math.round(((avg - 1) / 6) * 100);
    out.push({
      id: sec.id, title: sec.title, label: sec.scoreLabel ?? sec.title,
      pct, avg: Math.round(avg * 10) / 10, answered: vals.length, level: levelOf(pct),
    });
  }
  return out;
}

export function overallScore(scores: SectionScore[]): number | null {
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b.pct, 0) / scores.length);
}

/** תשובה כטקסט להצגה */
export function answerText(q: Question, v: string | number | undefined): string {
  if (v === undefined || v === '') return '';
  if (q.kind === 'scale7') return `${v} · ${SCALE_LABELS[Number(v) - 1] ?? ''}`;
  return String(v);
}
