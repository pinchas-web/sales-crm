/**
 * שליחת מיילים דרך SMTP (למשל Gmail עם "סיסמת אפליקציה").
 * מוגדר במשתני הסביבה של Vercel:
 *   SMTP_USER   — כתובת המייל השולחת (חובה)
 *   SMTP_PASS   — סיסמת האפליקציה (חובה)
 *   SMTP_HOST   — ברירת מחדל smtp.gmail.com
 *   SMTP_PORT   — ברירת מחדל 465
 *   MAIL_FROM_NAME        — שם השולח, ברירת מחדל "פנחס הורביץ"
 *   CONTRACT_NOTIFY_EMAIL — לאן לשלוח עותק של כל הסכם חתום (ברירת מחדל: SMTP_USER)
 * אם אין הגדרות — לא שולחים, ומחזירים not_configured (שאר התהליך ממשיך כרגיל).
 */
import { createTransport } from 'nodemailer';

export interface MailInput {
  to: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function notifyEmail(): string | undefined {
  return process.env.CONTRACT_NOTIFY_EMAIL || process.env.SMTP_USER || undefined;
}

export async function sendMail(input: MailInput): Promise<'sent' | 'not_configured'> {
  if (!mailConfigured()) return 'not_configured';
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const fromName = process.env.MAIL_FROM_NAME || 'פנחס הורביץ';
  await transporter.sendMail({
    from: { name: fromName, address: process.env.SMTP_USER as string },
    to: [...new Set(input.to.filter(Boolean))].join(', '),
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
  return 'sent';
}
