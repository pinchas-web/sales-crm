/**
 * אחסון הסכמים — דלי פרטי "contracts" ב-Supabase Storage.
 *   records/<token>.json  — רשומת ההסכם (נתונים, סטטוס, פרטי החותם)
 *   signed/<token>.pdf    — הקובץ החתום
 * הדלי פרטי: אין גישה ציבורית. הורדה רק דרך קישור חתום וזמני מהשרת.
 */
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { TOKEN_RE, type ContractRecord } from './contractTypes';

const BUCKET = 'contracts';
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

export function newToken(): string {
  return randomBytes(16).toString('hex');
}

export async function getContract(token: string): Promise<ContractRecord | null> {
  if (!TOKEN_RE.test(token)) return null;
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(`records/${token}.json`);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as ContractRecord;
  } catch {
    return null;
  }
}

export async function saveContract(rec: ContractRecord): Promise<void> {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(rec), 'utf8');
  const { error } = await supabaseAdmin.storage.from(BUCKET)
    .upload(`records/${rec.token}.json`, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`saveContract: ${error.message}`);
}

export async function listContracts(): Promise<ContractRecord[]> {
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list('records', { limit: 1000 });
  if (error) throw new Error(`listContracts: ${error.message}`);
  const tokens = (data ?? [])
    .map(f => f.name.replace(/\.json$/, ''))
    .filter(t => TOKEN_RE.test(t));
  const recs = await Promise.all(tokens.map(getContract));
  return recs.filter((r): r is ContractRecord => !!r);
}

export async function saveSignedPdf(token: string, pdf: Buffer): Promise<string> {
  await ensureBucket();
  const path = `signed/${token}.pdf`;
  const { error } = await supabaseAdmin.storage.from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`saveSignedPdf: ${error.message}`);
  return path;
}

/** קישור הורדה זמני (10 דקות) לקובץ החתום */
export async function signedPdfUrl(path: string, fileName: string): Promise<string | null> {
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage.from(BUCKET)
    .createSignedUrl(path, 600, { download: fileName });
  if (error || !data) return null;
  return data.signedUrl;
}

/** שדות שהלקוח שחותם רשאי לראות */
export function publicView(rec: ContractRecord) {
  return {
    status: rec.status,
    data: rec.data,
    createdAt: rec.createdAt,
    signer: rec.signer ? { name: rec.signer.name, signedAt: rec.signer.signedAt } : undefined,
  };
}

export function pdfFileName(rec: ContractRecord): string {
  const safe = rec.data.clientName.replace(/[\\/:*?"<>|]/g, '').trim() || 'לקוח';
  return `הסכם ליווי פרימיום - ${safe}.pdf`;
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
