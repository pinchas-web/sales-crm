import type { VercelRequest, VercelResponse } from '@vercel/node';

console.log('[ping] module loaded');

export default function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[ping] handler called');
  return res.status(200).json({ ok: true, method: req.method });
}
