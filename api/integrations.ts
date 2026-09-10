import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from './_lib/auth';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { wordpressConfigured, readWooCommerce } from './_lib/wordpress';
import { mergeWooProducts } from './_lib/woo-products';

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
  if (!['sync-wordpress','sync-products'].includes(req.body?.action)) return res.status(400).json({error:'Unknown action'});
  if (!wordpressConfigured()) return res.status(409).json({error:'WordPress credentials are not configured'});
  try {
    const products = await readWooCommerce('products');
    const {data:config,error:readError} = await supabaseAdmin.from('crm_config')
      .select('id,products').eq('id','00000000-0000-0000-0000-000000000001').single();
    if (readError || !config || !Array.isArray(config.products)) throw new Error('Catalog unavailable');
    const merged = mergeWooProducts(config.products, products, new Date().toISOString());
    const {error:saveError} = await supabaseAdmin.rpc('crm_apply_changes', {
      actor:user.crm_user_id, changes:[{table:'crm_config',before:config,after:{id:config.id,products:merged.products}}],
    });
    if (saveError?.code === '40001') return res.status(409).json({error:'Catalog changed during sync. Please retry.'});
    if (saveError) throw new Error('Catalog save failed');
    const { error } = await supabaseAdmin.from('integration_snapshots').upsert({
      provider:'woocommerce-products', payload:{created:merged.created,updated:merged.updated,missing:merged.missing}, record_count:products.length,
      synced_at:new Date().toISOString(),
    });
    return res.json({ok:true,products:products.length,created:merged.created,updated:merged.updated,missing:merged.missing,historySaved:!error});
  } catch {
    return res.status(502).json({error:'Import failed. Previous imported data was preserved.'});
  }
}
