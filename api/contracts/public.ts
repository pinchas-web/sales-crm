/**
 * דף החתימה הציבורי — בלי התחברות. הגישה רק עם הקישור הסודי (token).
 *
 * GET  /api/contracts/public?token=...         → נתוני ההסכם להצגה
 * GET  /api/contracts/public?token=...&pdf=1   → קישור הורדה לקובץ החתום (אחרי חתימה)
 * POST /api/contracts/public  { token, name, idNumber, email, agree, signatureDataUrl, pdfBase64 }
 *      → שומר את החתימה ואת ה-PDF, מעדכן את ה-CRM ושולח מייל ללקוח ולפנחס
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin';
import {
  getContract, saveContract, saveSignedPdf, signedPdfUrl, publicView, pdfFileName, queryParam,
} from '../_lib/contractStore';
import { TOKEN_RE, type ContractRecord } from '../_lib/contractTypes';
import { sendMail, notifyEmail } from '../_lib/mailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const token = queryParam(req, 'token');
      const rec = TOKEN_RE.test(token) ? await getContract(token) : null;
      if (!rec) return res.status(404).json({ error: 'not_found' });
      if (rec.status === 'cancelled') return res.status(410).json({ error: 'cancelled' });

      if (queryParam(req, 'pdf')) {
        if (rec.status !== 'signed' || !rec.pdfPath) return res.status(404).json({ error: 'not_signed' });
        const url = await signedPdfUrl(rec.pdfPath, pdfFileName(rec));
        return url ? res.status(200).json({ url }) : res.status(500).json({ error: 'link_failed' });
      }

      if (!rec.viewedAt && rec.status === 'sent') {
        await saveContract({ ...rec, viewedAt: new Date().toISOString() }).catch(() => {});
      }
      return res.status(200).json(publicView(rec));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const b = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof b.token === 'string' ? b.token : '';
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '';
    const idNumber = typeof b.idNumber === 'string' ? b.idNumber.replace(/\D/g, '') : '';
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : '';
    const sig = typeof b.signatureDataUrl === 'string' ? b.signatureDataUrl : '';
    const pdfB64 = typeof b.pdfBase64 === 'string' ? b.pdfBase64 : '';

    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'invalid_token' });
    if (name.length < 2) return res.status(400).json({ error: 'missing_name' });
    if (idNumber.length < 5 || idNumber.length > 9) return res.status(400).json({ error: 'invalid_id' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
    if (b.agree !== true) return res.status(400).json({ error: 'not_agreed' });
    if (!sig.startsWith('data:image/png;base64,') || sig.length > 400_000) return res.status(400).json({ error: 'invalid_signature' });
    if (!pdfB64 || pdfB64.length > 4_200_000) return res.status(400).json({ error: 'invalid_pdf' });

    const pdf = Buffer.from(pdfB64, 'base64');
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'invalid_pdf' });

    const rec = await getContract(token);
    if (!rec) return res.status(404).json({ error: 'not_found' });
    if (rec.status === 'cancelled') return res.status(410).json({ error: 'cancelled' });
    if (rec.status === 'signed') return res.status(409).json({ error: 'already_signed' });

    const now = new Date().toISOString();
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim() || undefined;
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : undefined;

    const pdfPath = await saveSignedPdf(token, pdf);
    const signed: ContractRecord = {
      ...rec,
      status: 'signed',
      updatedAt: now,
      signer: { name, idNumber, email: email || undefined, signedAt: now, ip, userAgent: ua },
      signatureDataUrl: sig,
      pdfPath,
    };
    await saveContract(signed);

    // תיעוד בכרטיס הליד ב-CRM
    if (rec.leadId) {
      await supabaseAdmin.from('activities').insert({
        id: `sig-${token.slice(0, 12)}`,
        lead_id: rec.leadId,
        date: now,
        note: `✍️ הסכם הליווי נחתם דיגיטלית על ידי ${name}`,
        created_by: rec.createdBy,
        type: 'note',
      }).then(({ error }) => { if (error) console.error('[CRM contracts] activity insert:', error.message); });
    }

    // מייל ללקוח ולפנחס, עם הקובץ החתום
    let emailStatus: ContractRecord['emailStatus'] = 'not_configured';
    let emailError: string | undefined;
    try {
      const first = esc(name.split(' ')[0]);
      emailStatus = await sendMail({
        to: [email, notifyEmail() ?? ''],
        subject: `הסכם הליווי החתום – ${name}`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#231F20">
          <p>שלום ${first},</p>
          <p>תודה שחתמת על הסכם הליווי. מצורף עותק חתום של ההסכם לשמירה.</p>
          <p>מחכה להתחיל לעבוד יחד!</p>
          <p style="margin-top:24px">פנחס הורביץ<br>הבית למטפלים ומאמנים<br>052-7117224 · pinchashorvitz.co.il</p>
        </div>`,
        attachments: [{ filename: pdfFileName(signed), content: pdf, contentType: 'application/pdf' }],
      });
    } catch (err) {
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message.slice(0, 300) : 'unknown';
      console.error('[CRM contracts] email failed:', emailError);
    }
    await saveContract({ ...signed, emailStatus, emailError });

    return res.status(200).json({ ok: true, emailStatus: emailStatus === 'sent' && email ? 'sent' : 'not_sent' });
  } catch (err) {
    console.error('[CRM contracts/public] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
