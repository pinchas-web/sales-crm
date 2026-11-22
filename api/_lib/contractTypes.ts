/**
 * הסכמי עבודה דיגיטליים — טיפוסים וקבועים משותפים לשרת ולמסך.
 * קובץ טהור (בלי Node ובלי דפדפן), כמו permissions.ts.
 */

export type ContractTemplateId = 'premium-2026';
export type ContractTrack = 'basic' | 'half_year';
export type ContractStatus = 'sent' | 'signed' | 'cancelled';

/** מה שמותאם אישית לכל לקוח */
export interface ContractData {
  templateId: ContractTemplateId;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  track: ContractTrack;
  /** מחיר לפני מע"מ, בש"ח */
  price: number;
  /** YYYY-MM-DD */
  startDate?: string;
  /** פסקה אישית שמופיעה בעמוד הראשון */
  personalNote?: string;
  /** מזהי הבונוסים שנכללים (מתוך BONUSES) */
  bonuses: string[];
  /** בונוס נוסף שנכתב ידנית ללקוח הזה */
  extraBonus?: string;
}

export interface ContractSigner {
  name: string;
  idNumber: string;
  email?: string;
  signedAt: string;
  ip?: string;
  userAgent?: string;
}

export interface ContractRecord {
  token: string;
  clientId: string;
  leadId?: string;
  productId?: string;
  status: ContractStatus;
  data: ContractData;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  viewedAt?: string;
  signer?: ContractSigner;
  signatureDataUrl?: string;
  pdfPath?: string;
  emailStatus?: 'sent' | 'not_configured' | 'failed';
  emailError?: string;
}

export const CONTRACT_TEMPLATES: { id: ContractTemplateId; label: string }[] = [
  { id: 'premium-2026', label: 'הסכם ליווי פרימיום 2026 (חתימה דיגיטלית)' },
];

export const TRACKS: Record<ContractTrack, { label: string; title: string; desc: string; price: number }> = {
  basic:     { label: 'מסלול בסיסי',            title: '4 פגישות אישיות', desc: 'ארבע (4) פגישות אישיות עם פנחס.',          price: 5200 },
  half_year: { label: 'מסלול ליווי חצי־שנתי', title: '6 חודשי ליווי',   desc: 'תהליך ליווי מתמשך בן שישה (6) חודשים.', price: 22000 },
};

export const BONUSES: { id: string; title: string; text: string; extra?: string }[] = [
  {
    id: 'funnel',
    title: "משפך שיווקי ייחודי במודל 'לולאת השכנוע'",
    text: 'המשלב שיווק סמוי וגלוי, מגדיל את רשימת התפוצה, מפחית את עלויות הפרסום, וגורם ללידים להגיע חמים הרבה יותר לתהליך המכירה.',
  },
  {
    id: 'chat',
    title: 'התכתבות חופשית עם פנחס',
    text: 'במהלך הליווי, הלקוח מקבל אפשרות להתכתבות חופשית עם פנחס במייל ובוואטסאפ להתייעצות.',
  },
  {
    id: 'zoom',
    title: 'זום חודשי עם פנחס ואנשי מקצוע נוספים',
    text: 'פתוח ללקוחות בלבד. בזום מקבלים הדרכות שונות בהתאם לתקופה והשתלמויות נוספות. זום שייתן לכם דחיפה חודשית להמשיך להצליח סביב מעגל השנה, גם בתקופות מאתגרות.',
  },
  {
    id: 'course',
    title: "גישה לקורס הדיגיטלי המלא 'ביזנסתרפיה'",
    text: 'במהלך חודשי הליווי, קורס שיגרום לכם להפוך למנטורים של עצמכם.',
    extra: 'במידה ותסגרו על ריטיינר של 3 חודשים רצופים, הקורס יישאר שלכם לכל החיים.',
  },
  {
    id: 'excel',
    title: 'טבלת אקסל חכמה',
    text: 'שמחשבת עבורכם באופן אוטומטי את המשכורת החודשית המגיעה לכם.',
  },
];

export const TOKEN_RE = /^[a-f0-9]{32}$/;

export function defaultContractData(clientName = '', clientEmail = '', clientPhone = ''): ContractData {
  return {
    templateId: 'premium-2026',
    clientName, clientEmail, clientPhone,
    track: 'half_year',
    price: TRACKS.half_year.price,
    bonuses: BONUSES.map(b => b.id),
  };
}

/** מנקה ומאמת נתוני הסכם שהגיעו מבחוץ. מחזיר null אם משהו לא תקין. */
export function sanitizeContractData(raw: unknown): ContractData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const track = r.track === 'basic' || r.track === 'half_year' ? r.track : null;
  const price = Number(r.price);
  const clientName = str(r.clientName, 120);
  if (!track || !clientName || !Number.isFinite(price) || price < 0 || price > 10_000_000) return null;
  const validIds = new Set(BONUSES.map(b => b.id));
  const bonuses = Array.isArray(r.bonuses) ? r.bonuses.filter((b): b is string => typeof b === 'string' && validIds.has(b)) : [];
  const startDate = str(r.startDate, 10);
  return {
    templateId: 'premium-2026',
    clientName,
    clientEmail: str(r.clientEmail, 200) || undefined,
    clientPhone: str(r.clientPhone, 40) || undefined,
    track,
    price: Math.round(price),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined,
    personalNote: str(r.personalNote, 600) || undefined,
    bonuses,
    extraBonus: str(r.extraBonus, 300) || undefined,
  };
}
