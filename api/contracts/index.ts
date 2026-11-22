/**
 * ניהול הסכמים מתוך ה-CRM (משתמש מחובר עם גישה ללשונית "לקוחות").
 *
 * GET  /api/contracts                → רשימה מקוצרת של כל ההסכמים (לטבלת הלקוחות)
 * GET  /api/contracts?clientId=...   → ההסכמים המלאים של לקוח אחד
 * GET  /api/contracts?pdf=<token>    → קישור הורדה זמני לקובץ החתום
 * POST /api/contracts  { action: 'create', clientId, leadId?, productId?, data }
 * POST /api/contracts  { action: 'update', token, data }   — רק לפני חתימה
 * POST /api/contracts  { action: 'cancel', token }          — רק לפני חתימה
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../_lib/auth';
import { permsFor } from '../_lib/permissions';
import {
  getContract, saveContract, listContracts, newToken, signedPdfUrl, pdfFileName, queryParam,
} from '../_lib/contractStore';
import { sanitizeContractData, TOKEN_RE, type ContractRecord } from '../_lib/contractTypes';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const crmUser = await validateRequest(req.headers.authorization);
    if (!crmUser) return res.status(401).json({ error: 'Unauthorized' });
    const perms = permsFor(crmUser.role);
    if (!perms?.tabs.includes('clients')) return res.status(403).json({ error: 'Not allowed' });

    if (req.method === 'GET') {
      const pdfToken = queryParam(req, 'pdf');
      if (pdfToken) {
        const rec = await getContract(pdfToken);
        if (!rec?.pdfPath) return res.status(404).json({ error: 'Not found' });
        const url = await signedPdfUrl(rec.pdfPath, pdfFileName(rec));
        return url ? res.status(200).json({ url }) : res.status(500).json({ error: 'Could not create link' });
      }

      const all = await listContracts();
      const clientId = queryParam(req, 'clientId');
      if (clientId) {
        const mine = all
          .filter(r => r.clientId === clientId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return res.status(200).json({ contracts: mine });
      }
      const summary = all.map(r => ({
        token: r.token, clientId: r.clientId, status: r.status,
        createdAt: r.createdAt, viewedAt: r.viewedAt, signedAt: r.signer?.signedAt,
      }));
      return res.status(200).json({ contracts: summary });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const now = new Date().toISOString();

      if (body.action === 'create') {
        const clientId = typeof body.clientId === 'string' ? body.clientId.slice(0, 100) : '';
        const data = sanitizeContractData(body.data);
        if (!clientId || !data) return res.status(400).json({ error: 'Invalid contract data' });
        const rec: ContractRecord = {
          token: newToken(),
          clientId,
          leadId: typeof body.leadId === 'string' ? body.leadId.slice(0, 100) : undefined,
          productId: typeof body.productId === 'string' ? body.productId.slice(0, 100) : undefined,
          status: 'sent',
          data,
          createdAt: now,
          createdBy: crmUser.crm_user_id,
          updatedAt: now,
        };
        await saveContract(rec);
        return res.status(200).json({ contract: rec });
      }

      const token = typeof body.token === 'string' ? body.token : '';
      if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'Invalid token' });
      const rec = await getContract(token);
      if (!rec) return res.status(404).json({ error: 'Not found' });
      if (rec.status !== 'sent') return res.status(409).json({ error: 'ההסכם כבר נחתם או בוטל' });

      if (body.action === 'update') {
        const data = sanitizeContractData(body.data);
        if (!data) return res.status(400).json({ error: 'Invalid contract data' });
        const updated = { ...rec, data, updatedAt: now };
        await saveContract(updated);
        return res.status(200).json({ contract: updated });
      }

      if (body.action === 'cancel') {
        const updated: ContractRecord = { ...rec, status: 'cancelled', updatedAt: now };
        await saveContract(updated);
        return res.status(200).json({ contract: updated });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[CRM contracts] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
