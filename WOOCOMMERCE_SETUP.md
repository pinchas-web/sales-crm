# WooCommerce catalog sync

Implemented locally; not deployed or tested against the live store.

Create a WooCommerce REST API key with Read permission. Configure `WOOCOMMERCE_CONSUMER_KEY` and `WOOCOMMERCE_CONSUMER_SECRET` only as server secrets, never with a VITE_ prefix. Store origin is fixed to https://pinchashorvitz.co.il. Existing WordPress application-password credentials remain a compatibility fallback.

Deployment requires an isolated Supabase database, migrations 002 and 003, the singleton crm_config row with a products array, and an approved administrator in crm_users. Staging migration execution is still unverified because browser control is unavailable.

Administrators select Sync products in Integrations. This is on-demand, not yet scheduled or triggered by webhooks. The sync writes to crm_config.products, the catalog used by the Products screen and sales records. WooCommerce IDs prevent duplicate imports; manually created CRM products are retained without guessing matches by name.

Names, descriptions, prices, categories, images, SKU and source status follow WooCommerce. Onboarding, testimonials, contracts and other internal fields are preserved. Non-published and missing products become inactive, preserving references from sales. Variable products are represented by their parent product and returned price; individual variations are not separate entries. Blank source prices currently map to zero. The existing CRM assumes ILS.

Pending browser saves are flushed before sync, followed by a server-state reload. Concurrent catalog edits return 409. Fetch failure aborts before writing. Maximum import is 5,000 products; exceeding the bound fails. Orders are not fetched. History writes are best effort, and their failure is reported separately from a successful catalog commit.

Validation: eight automated tests passed, including catalog idempotency, internal field preservation, malformed input, admin-only access and conflict handling. Production build and targeted API type/lint checks passed. Browser end-to-end and live-store validation remain outstanding.

Official API reference: https://developer.woocommerce.com/docs/apis/rest-api/v3/products
