const origin = 'https://pinchashorvitz.co.il';

export function wordpressConfigured() {
  return Boolean(process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APPLICATION_PASSWORD);
}

export async function readWooCommerce(resource: 'products' | 'orders') {
  if (!wordpressConfigured()) throw new Error('WordPress credentials are not configured');
  const authorization = `Basic ${Buffer.from(`${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APPLICATION_PASSWORD}`).toString('base64')}`;
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 50; page++) {
    const url = new URL(`/wp-json/wc/v3/${resource}`, origin);
    url.searchParams.set('per_page','100');
    url.searchParams.set('page',String(page));
    url.searchParams.set('orderby','id');
    url.searchParams.set('order','asc');
    // Only request fields needed for the dashboard; payment metadata is excluded.
    url.searchParams.set('_fields',resource === 'products' ? 'id,name,status,price,permalink' : 'id,status,date_created,total,currency,customer_id,line_items');
    const response = await fetch(url, {headers:{Authorization:authorization}, redirect:'error', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`WordPress request failed (${response.status})`);
    const batch: unknown = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected WordPress response');
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error('Import exceeds 5000 records; incremental import is required');
}
