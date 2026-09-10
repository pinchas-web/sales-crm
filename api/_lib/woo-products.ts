import type { Product } from '../../src/types';

// Render imported descriptions as text. Never insert upstream HTML into the DOM.
function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/\s+/g, ' ').trim();
}
function httpsUrl(value: unknown): string | undefined {
  try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : undefined; }
  catch { return undefined; }
}

export function mergeWooProducts(existing: Product[], rows: Record<string, unknown>[], now: string) {
  const seen = new Set<number>();
  const linked = new Map<number, Product>();
  const ids = new Set<string>();
  for (const product of existing) {
    if (ids.has(product.id)) throw new Error('Duplicate CRM product ID');
    ids.add(product.id);
    if (product.wooCommerceId !== undefined) {
      if (linked.has(product.wooCommerceId)) throw new Error('Duplicate WooCommerce link');
      linked.set(product.wooCommerceId, product);
    }
  }
  let created = 0, updated = 0;
  const imported = rows.map(row => {
    const id = row.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw new Error('Invalid WooCommerce product ID');
    seen.add(id);
    if (typeof row.name !== 'string' || !row.name.trim() || typeof row.status !== 'string') throw new Error('Invalid product');
    const rawPrice = row.price;
    if (typeof rawPrice !== 'string' || (rawPrice !== '' && !/^\d+(\.\d+)?$/.test(rawPrice))) throw new Error('Invalid price');
    const price = rawPrice === '' ? 0 : Number(rawPrice);
    if (!Number.isFinite(price)) throw new Error('Invalid price');
    const previous = linked.get(id);
    const crmId = previous?.id ?? `woocommerce:${id}`;
    if (!previous && ids.has(crmId)) throw new Error('Product ID collision');
    const categories = Array.isArray(row.categories) ? row.categories : [];
    const images = Array.isArray(row.images) ? row.images : [];
    const product: Product = {
      ...(previous ?? {id: crmId, testimonials: [], onboardingSteps: [], createdAt: now}),
      wooCommerceId: id, name: plainText(row.name), price,
      description: plainText(row.description), shortDescription: plainText(row.short_description),
      category: categories.map(c => plainText(c?.name)).filter(Boolean).join(', '),
      imageDataUrl: httpsUrl(images[0]?.src), sourceUrl: httpsUrl(row.permalink),
      sku: typeof row.sku === 'string' ? row.sku : '', sourceStatus: row.status,
      sourceType: typeof row.type === 'string' ? row.type : '', sourceMissing: false,
      active: row.status === 'publish',
    };
    if (!previous) created++;
    else if (JSON.stringify(previous) !== JSON.stringify(product)) updated++;
    return product;
  });
  let missing = 0;
  // Missing source products are retained so existing sales still reference them.
  const retained = existing.filter(p => p.wooCommerceId === undefined || !seen.has(p.wooCommerceId)).map(p => {
    if (p.wooCommerceId === undefined) return p;
    missing++;
    return {...p, active: false, sourceMissing: true};
  });
  return {products: [...retained, ...imported], created, updated, missing, imported: imported.length};
}
