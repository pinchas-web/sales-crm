import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from './_lib/auth';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { wordpressConfigured, readWooCommerce } from './_lib/wordpress';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  const user = await validateRequest(req.headers.authorization);
  if (!user || user.role !== 'admin') return res.status(403).json({error:'Admin only'});
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('integration_snapshots').select('provider,synced_at,record_count');
    if (error) return res.status(503).json({error:'Integration database setup is required'});
    return res.json({ wordpressConfigured:wordpressConfigured(), snapshots:data });
  }
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (req.body?.action !== 'sync-wordpress') return res.status(400).json({error:'Unknown action'});
  if (!wordpressConfigured()) return res.status(409).json({error:'WordPress credentials are not configured'});
  try {
    const [products,orders] = await Promise.all([readWooCommerce('products'),readWooCommerce('orders')]);
    const { error } = await supabaseAdmin.from('integration_snapshots').upsert({
      provider:'woocommerce', payload:{products,orders}, record_count:products.length+orders.length,
      synced_at:new Date().toISOString(),
    });
    if (error) throw error;
    return res.json({ok:true,products:products.length,orders:orders.length});
  } catch {
    return res.status(502).json({error:'Import failed. Previous imported data was preserved.'});
  }
}
