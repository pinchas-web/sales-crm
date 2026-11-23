/**
 * רשומת שאלון — טיפוסים משותפים לשרת ולמסך. קובץ טהור.
 */
import type { Answers, QuestionnaireId, SectionScore } from './questionnaireDefs';

export type QStatus = 'sent' | 'submitted' | 'cancelled';
export type DeliveryStatus = 'sent' | 'not_configured' | 'failed' | 'pending' | 'skipped';

export interface AiSummary {
  text: string;
  model: string;
  createdAt: string;
}

export interface QRecord {
  token: string;
  qid: QuestionnaireId;
  /** personal = נוצר מתיק הלקוח. general = מולא דרך הקישור הכללי */
  source: 'personal' | 'general';
  leadId?: string;
  clientId?: string;
  /** שם להצגה (מהתיק, או ממה שהממלא כתב) */
  name: string;
  /** פרטי קשר מהתיק או מהתשובות — לשימוש השרת בלבד (מייל תודה, שם תיקייה בדרייב). לא נשלחים לדף הציבורי. */
  contactEmail?: string;
  contactPhone?: string;
  status: QStatus;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  /** תוקף הקישור האישי */
  expiresAt?: string;
  viewedAt?: string;
  submittedAt?: string;
  answers?: Answers;
  scores?: SectionScore[];
  overall?: number | null;
  /** איך הממלא קושר לליד בקישור הכללי */
  match?: 'new_lead' | 'phone' | 'email';
  pdfPath?: string;
  summary?: AiSummary;
  summaryStatus?: DeliveryStatus;
  emailStatus?: DeliveryStatus;
  driveStatus?: DeliveryStatus;
  driveUrl?: string;
  lastError?: string;
}

/** מה שה-CRM מקבל ברשימה של לקוח (בלי תשובות) */
export type QSummary = Omit<QRecord, 'answers' | 'summary'> & { hasSummary: boolean };

export const TOKEN_RE = /^[a-f0-9]{32}$/;
export const PERSONAL_LINK_DAYS = 45;
