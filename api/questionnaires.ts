/**
 * שאלונים ללקוחות — נקודת קצה אחת (כדי לא להוסיף פונקציות שרת מעבר למגבלה של Vercel).
 *
 * ── ציבורי (בלי התחברות) ──
 * GET  /api/questionnaires?public=<token>   → { qid, status, firstName } בלבד. אין תשובות ואין פרטי קשר.
 * POST /api/questionnaires { action:'submit', token? | qid?, answers, pdfBase64?, hp, elapsedMs }
 *      token = קישור אישי (מתיק הלקוח). qid בלי token = קישור כללי (/q/strategy, /q/mental).
 *
 * ── CRM (משתמש מחובר עם הרשאת "שאלונים": מנהל / ניהול משרד) ──
 * GET  ?leadId=...      → כל השאלונים של הליד, כולל תשובות
 * GET  ?pdf=<token>     → קישור הורדה זמני
 * GET  ?config=1        → מה מחובר (מייל / דרייב / בינה מלאכותית)
 * POST { action:'create', leadId, clientId?, qid }
 * POST { action:'cancel', token }
 * POST { action:'retry',  token, what?: ('summary'|'email'|'drive')[] }
 * POST { action:'attachPdf', token, pdfBase64 }   — כשהקובץ לא נוצר אצל הלקוח
 * POST { action:'delete', token }                  — מנהל בלבד. מוחק תשובות וקובץ (מחיקה לפי בקשת לקוח)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { validateRequest } from './_lib/auth';
import { permsFor } from './_lib/permissions';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import {
  QUESTIONNAIRES, isQuestionnaireId, sanitizeAnswers, scoreAnswers, overallScore, normalizePhone,
} from './_lib/questionnaireDefs';
import { TOKEN_RE, PERSONAL_LINK_DAYS, type QRecord } from './_lib/questionnaireTypes';
import {
  getQ, saveQ, listForLead, deleteQ, savePdf, pdfUrl, pdfFileName, newToken, queryParam, allowGeneralSubmit,
} from './_lib/questionnaireStore';
import { finalizeQ } from './_lib/questionnaireDelivery';
import { mailConfigured } from './_lib/mailer';
import { driveConfigured } from './_lib/drive';

const MIN_FILL_MS = 20_000;
const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

function baseUrlOf(req: VercelRequest): string | undefined {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const h = Array.isArray(host) ? host[0] : host;
  if (!h || !/^[\w.-]+(:\d+)?$/.test(h)) return undefined;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || (h.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${h}`;
}

function clientIp(req: VercelRequest): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim() || undefined;
}

function decodePdf(b64: unknown): Buffer | null {
  if (typeof b64 !== 'string' || !b64 || b64.length > 4_200_000) return null;
  const pdf = Buffer.from(b64, 'base64');
  return pdf.subarray(0, 5).toString('latin1') === '%PDF-' ? pdf : null;
}

function later(p: Promise<unknown>) {
  const safe = p.catch(err => console.error('[questionnaires] background error:', err instanceof Error ? err.message : err));
  try { waitUntil(safe); } catch { /* מחוץ ל-Vercel: התהליך ממשיך לרוץ ממילא */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function crmConfig(): Promise<{ adminId: string; firstStatus: string }> {
  const { data } = await supabaseAdmin.from('crm_config').select('users, statuses').eq('id', CONFIG_ID).maybeSingle();
  const users = (data?.users ?? []) as Row[];
  const statuses = ((data?.statuses ?? []) as Row[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    adminId: String(users.find(u => u.role === 'admin')?.id ?? ''),
    firstStatus: String(statuses.find(s => !s.isFinal)?.id ?? statuses[0]?.id ?? 'new'),
  };
}

/** קישור כללי: מוצא ליד קיים לפי טלפון או מייל, ואם אין — פותח ליד חדש */
async function matchOrCreateLead(name: string, phone: string, email: string, qid: 'strategy' | 'mental', now: string) {
  const { data, error } = await supabaseAdmin.from('leads').select('id, name, phone, email');
  if (error) throw new Error(`leads select: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const byPhone = phone ? rows.find(r => normalizePhone(String(r.phone ?? '')) === phone) : undefined;
  if (byPhone) return { leadId: String(byPhone.id), match: 'phone' as const };
  const em = email.toLowerCase();
  const byEmail = em ? rows.find(r => String(r.email ?? '').trim().toLowerCase() === em) : undefined;
  if (byEmail) return { leadId: String(byEmail.id), match: 'email' as const };

  const cfg = await crmConfig();
  const id = `q${newToken().slice(0, 14)}`;
  const { error: insErr } = await supabaseAdmin.from('leads').insert({
    id, name: name.slice(0, 120), phone, email: email || null,
    source: QUESTIONNAIRES[qid].shortTitle, source_campaign: null,
    profession: '', audience_type: '', program: '', interested_in: [],
    status: cfg.firstStatus, assigned_to: cfg.adminId,
    created_at: now, updated_at: now, custom_fields: {}, score: 0, last_activity_at: now,
  });
  if (insErr) throw new Error(`lead insert: ${insErr.message}`);
  return { leadId: id, match: 'new_lead' as const };
}

async function logActivity(rec: QRecord, now: string) {
  if (!rec.leadId) return;
  const def = QUESTIONNAIRES[rec.qid];
  const how = rec.source === 'general' ? ' (דרך הקישור הכללי)' : '';
  const { adminId } = await crmConfig();
  await supabaseAdmin.from('activities').insert({
    id: `qa-${rec.token.slice(0, 12)}`,
    lead_id: rec.leadId,
    date: now,
    note: `מילא/ה את ה${def.shortTitle}${how}. התשובות המלאות בלשונית "שאלונים".`,
    created_by: rec.createdBy ?? adminId,
    type: 'note',
  }).then(({ error }) => { if (error) console.error('[questionnaires] activity insert:', error.message); });
  await supabaseAdmin.from('leads').update({ last_activity_at: now, updated_at: now }).eq('id', rec.leadId)
    .then(({ error }) => { if (error) console.error('[questionnaires] lead touch:', error.message); });
}

// ─── ציבורי ───────────────────────────────────────────────────────────────────

async function publicGet(res: VercelResponse, token: string) {
  const rec = TOKEN_RE.test(token) ? await getQ(token) : null;
  if (!rec) return res.status(404).json({ error: 'not_found' });
  const base = { qid: rec.qid, firstName: rec.name.split(' ')[0] ?? '', name: rec.name };
  if (rec.status === 'cancelled') return res.status(200).json({ ...base, status: 'cancelled' });
  if (rec.status === 'submitted') return res.status(200).json({ ...base, status: 'done' });
  if (rec.expiresAt && rec.expiresAt < new Date().toISOString()) return res.status(200).json({ ...base, status: 'expired' });
  if (!rec.viewedAt) await saveQ({ ...rec, viewedAt: new Date().toISOString() }).catch(() => {});
  return res.status(200).json({ ...base, status: 'ready' });
}

async function publicSubmit(req: VercelRequest, res: VercelResponse, b: Row) {
  // מלכודת לרובוטים: שדה נסתר שאדם לא ממלא, וזמן מילוי מינימלי
  if (typeof b.hp === 'string' && b.hp.trim()) return res.status(200).json({ ok: true });
  if (!(Number(b.elapsedMs) >= MIN_FILL_MS)) return res.status(400).json({ error: 'too_fast' });

  const now = new Date().toISOString();
  const token = typeof b.token === 'string' ? b.token : '';
  let rec: QRecord;

  if (token) {
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'invalid_token' });
    const existing = await getQ(token);
    if (!existing || existing.source !== 'personal') return res.status(404).json({ error: 'not_found' });
    if (existing.status === 'cancelled') return res.status(410).json({ error: 'cancelled' });
    if (existing.status === 'submitted') return res.status(409).json({ error: 'already_submitted' });
    if (existing.expiresAt && existing.expiresAt < now) return res.status(410).json({ error: 'expired' });
    const answers = sanitizeAnswers(QUESTIONNAIRES[existing.qid], b.answers, true);
    if (!answers) return res.status(400).json({ error: 'invalid_answers' });
    rec = { ...existing, answers, name: String(answers.name ?? existing.name).slice(0, 120) };
  } else {
    if (!isQuestionnaireId(b.qid)) return res.status(400).json({ error: 'invalid_questionnaire' });
    const answers = sanitizeAnswers(QUESTIONNAIRES[b.qid], b.answers, false);
    if (!answers) return res.status(400).json({ error: 'invalid_answers' });
    if (!(await allowGeneralSubmit(clientIp(req)))) return res.status(429).json({ error: 'rate_limited' });
    const name = String(answers.name ?? '').slice(0, 120);
    const phone = String(answers.phone ?? '');
    const email = String(answers.email ?? '');
    const { leadId, match } = await matchOrCreateLead(name, phone, email, b.qid, now);
    rec = {
      token: newToken(), qid: b.qid, source: 'general', leadId, name, status: 'sent',
      createdAt: now, updatedAt: now, answers, match,
      contactEmail: email || undefined, contactPhone: phone || undefined,
    };
  }

  const def = QUESTIONNAIRES[rec.qid];
  const scores = rec.qid === 'mental' ? scoreAnswers(def, rec.answers ?? {}) : undefined;
  const pdf = decodePdf(b.pdfBase64);
  const pdfPath = pdf ? await savePdf(rec.token, pdf) : undefined;

  const submitted: QRecord = {
    ...rec,
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
    scores,
    overall: scores ? overallScore(scores) : undefined,
    pdfPath,
    summaryStatus: 'pending',
    emailStatus: 'pending',
    driveStatus: 'pending',
  };
  await saveQ(submitted);
  await logActivity(submitted, now);

  // סיכום, מייל ודרייב — ברקע, כדי שהלקוח לא יחכה
  later(finalizeQ(submitted.token, { baseUrl: baseUrlOf(req) }));
  return res.status(200).json({ ok: true });
}

// ─── CRM ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader?.('Cache-Control', 'no-store');
    const publicToken = req.method === 'GET' ? queryParam(req, 'public') : '';
    if (publicToken) return await publicGet(res, publicToken);
    const body = (req.method === 'POST' ? req.body ?? {} : {}) as Row;
    if (req.method === 'POST' && body.action === 'submit') return await publicSubmit(req, res, body);

    const crmUser = await validateRequest(req.headers.authorization);
    if (!crmUser) return res.status(401).json({ error: 'Unauthorized' });
    const perms = permsFor(crmUser.role);
    if (!perms?.questionnaires) return res.status(403).json({ error: 'Not allowed' });

    if (req.method === 'GET') {
      if (queryParam(req, 'config')) {
        return res.status(200).json({ mail: mailConfigured(), drive: driveConfigured(), ai: !!process.env.ANTHROPIC_API_KEY });
      }
      const pdfToken = queryParam(req, 'pdf');
      if (pdfToken) {
        const rec = await getQ(pdfToken);
        if (!rec?.pdfPath) return res.status(404).json({ error: 'אין קובץ לשאלון הזה' });
        const url = await pdfUrl(rec.pdfPath, pdfFileName(rec));
        return url ? res.status(200).json({ url }) : res.status(500).json({ error: 'לא הצלחתי ליצור קישור' });
      }
      const leadId = queryParam(req, 'leadId').slice(0, 100);
      if (!leadId) return res.status(400).json({ error: 'leadId required' });
      return res.status(200).json({ items: await listForLead(leadId) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const now = new Date().toISOString();

    if (body.action === 'create') {
      const leadId = typeof body.leadId === 'string' ? body.leadId.slice(0, 100) : '';
      if (!leadId || !isQuestionnaireId(body.qid)) return res.status(400).json({ error: 'נתונים חסרים' });
      const { data: lead } = await supabaseAdmin.from('leads').select('id, name, phone, email').eq('id', leadId).maybeSingle();
      if (!lead) return res.status(404).json({ error: 'הליד לא נמצא' });
      const expires = new Date(Date.now() + PERSONAL_LINK_DAYS * 86_400_000).toISOString();
      const rec: QRecord = {
        token: newToken(), qid: body.qid, source: 'personal',
        leadId, clientId: typeof body.clientId === 'string' ? body.clientId.slice(0, 100) : undefined,
        name: String(lead.name ?? '').slice(0, 120) || 'לקוח',
        contactEmail: lead.email ? String(lead.email) : undefined,
        contactPhone: lead.phone ? String(lead.phone) : undefined,
        status: 'sent', createdAt: now, createdBy: crmUser.crm_user_id, updatedAt: now, expiresAt: expires,
      };
      await saveQ(rec);
      return res.status(200).json({ item: rec });
    }

    const token = typeof body.token === 'string' ? body.token : '';
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'Invalid token' });
    const rec = await getQ(token);
    if (!rec) return res.status(404).json({ error: 'לא נמצא' });

    if (body.action === 'cancel') {
      if (rec.status !== 'sent') return res.status(409).json({ error: 'השאלון כבר מולא או בוטל' });
      const updated: QRecord = { ...rec, status: 'cancelled', updatedAt: now };
      await saveQ(updated);
      return res.status(200).json({ item: updated });
    }

    if (body.action === 'retry') {
      if (rec.status !== 'submitted') return res.status(409).json({ error: 'השאלון עוד לא מולא' });
      const valid = ['summary', 'email', 'drive'] as const;
      const what = Array.isArray(body.what) ? valid.filter(w => body.what.includes(w)) : [...valid];
      const updated = await finalizeQ(token, { baseUrl: baseUrlOf(req), force: what });
      return res.status(200).json({ item: updated });
    }

    if (body.action === 'attachPdf') {
      if (rec.status !== 'submitted') return res.status(409).json({ error: 'השאלון עוד לא מולא' });
      const pdf = decodePdf(body.pdfBase64);
      if (!pdf) return res.status(400).json({ error: 'קובץ לא תקין' });
      const pdfPath = await savePdf(token, pdf);
      const updated: QRecord = { ...rec, pdfPath, updatedAt: now };
      await saveQ(updated);
      return res.status(200).json({ item: updated });
    }

    if (body.action === 'delete') {
      if (crmUser.role !== 'admin') return res.status(403).json({ error: 'רק מנהל יכול למחוק שאלון' });
      await deleteQ(rec);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[questionnaires] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'server_error' });
  }
}
