/**
 * אחסון שאלונים — דלי פרטי "questionnaires" ב-Supabase Storage.
 *   records/<token>.json         — רשומת השאלון (סטטוס, תשובות, ציונים, סיכום)
 *   by-lead/<leadId>/<token>     — אינדקס: אילו שאלונים שייכים לליד
 *   pdf/<token>.pdf              — קובץ התשובות
 *   ratelimit/<date>/<hash>.json — מונה שליחות מהקישור הכללי, לפי כתובת IP מגובבת (בלי לשמור את ה-IP עצמו)
 * הדלי פרטי: אין גישה ציבורית. הורדה רק דרך קישור חתום וזמני מהשרת, למשתמש מורשה.
 */
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { TOKEN_RE, type QRecord, type QSummary } from './questionnaireTypes';

const BUCKET = 'questionnaires';
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) throw new Error(`createBucket: ${error.message}`);
  }
  bucketReady = true;
}

const bucket = () => supabaseAdmin.storage.from(BUCKET);
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);

export function newToken(): string {
  return randomBytes(16).toString('hex');
}

export async function getQ(token: string): Promise<QRecord | null> {
  if (!TOKEN_RE.test(token)) return null;
  await ensureBucket();
  const { data, error } = await bucket().download(`records/${token}.json`);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as QRecord;
  } catch {
    return null;
  }
}

export async function saveQ(rec: QRecord): Promise<void> {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(rec), 'utf8');
  const { error } = await bucket().upload(`records/${rec.token}.json`, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`saveQ: ${error.message}`);
  if (rec.leadId) {
    const { error: ie } = await bucket().upload(`by-lead/${safeId(rec.leadId)}/${rec.token}`, Buffer.from(''), { contentType: 'text/plain', upsert: true });
    if (ie) throw new Error(`saveQ index: ${ie.message}`);
  }
}

export async function listForLead(leadId: string): Promise<QRecord[]> {
  await ensureBucket();
  const { data, error } = await bucket().list(`by-lead/${safeId(leadId)}`, { limit: 200 });
  if (error) throw new Error(`listForLead: ${error.message}`);
  const tokens = (data ?? []).map(f => f.name).filter(t => TOKEN_RE.test(t));
  const recs = await Promise.all(tokens.map(getQ));
  return recs
    .filter((r): r is QRecord => !!r && r.leadId === leadId)
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt));
}

export async function deleteQ(rec: QRecord): Promise<void> {
  await ensureBucket();
  const paths = [`records/${rec.token}.json`];
  if (rec.pdfPath) paths.push(rec.pdfPath);
  if (rec.leadId) paths.push(`by-lead/${safeId(rec.leadId)}/${rec.token}`);
  const { error } = await bucket().remove(paths);
  if (error) throw new Error(`deleteQ: ${error.message}`);
}

export async function savePdf(token: string, pdf: Buffer): Promise<string> {
  await ensureBucket();
  const path = `pdf/${token}.pdf`;
  const { error } = await bucket().upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`savePdf: ${error.message}`);
  return path;
}

export async function loadPdf(path: string): Promise<Buffer | null> {
  await ensureBucket();
  const { data, error } = await bucket().download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** קישור הורדה זמני (10 דקות) */
export async function pdfUrl(path: string, fileName: string): Promise<string | null> {
  await ensureBucket();
  const { data, error } = await bucket().createSignedUrl(path, 600, { download: fileName });
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * מגביל שליחות מהקישור הכללי: עד LIMIT ביום מאותה כתובת.
 * שומרים רק גיבוב של ה-IP (עם מלח), לא את ה-IP עצמו.
 */
export async function allowGeneralSubmit(ip: string | undefined, limit = 6): Promise<boolean> {
  if (!ip) return true;
  await ensureBucket();
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? 'q';
  const hash = createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
  const path = `ratelimit/${day}/${hash}.json`;
  let count = 0;
  const { data } = await bucket().download(path);
  if (data) {
    try { count = Number(JSON.parse(await data.text()).count) || 0; } catch { /* מתחילים מאפס */ }
  }
  if (count >= limit) return false;
  await bucket().upload(path, Buffer.from(JSON.stringify({ count: count + 1 })), { contentType: 'application/json', upsert: true });
  return true;
}

export function toSummary(rec: QRecord): QSummary {
  const { answers: _a, summary, ...rest } = rec;
  void _a;
  return { ...rest, hasSummary: !!summary?.text };
}

export function pdfFileName(rec: QRecord): string {
  const safe = rec.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'לקוח';
  const kind = rec.qid === 'mental' ? 'אבחון מנטלי' : 'שאלון אסטרטגיה';
  const date = (rec.submittedAt ?? rec.createdAt).slice(0, 10);
  return `${kind} - ${safe} - ${date}.pdf`;
}

/** קורא פרמטר מה-URL — עובד גם ב-Vercel וגם בשרת ההדגמה */
export function queryParam(req: { url?: string; query?: Record<string, unknown> }, key: string): string {
  const q = req.query?.[key];
  if (typeof q === 'string') return q;
  try {
    return new URL(req.url ?? '', 'http://x').searchParams.get(key) ?? '';
  } catch {
    return '';
  }
}
