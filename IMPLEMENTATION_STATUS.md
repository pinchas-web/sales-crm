# CRM hardening and integration work

This branch is work in progress, not a production release. Do not merge or use a preview against the production database yet.

## Implemented and locally checked

- Failed initial reads block editing and saving. Initial load no longer saves a default snapshot.
- Debounced, serialized saves send changes relative to the last successful save.
- The server generates row changes; a PostgreSQL transaction checks persisted ownership and rejects stale records with HTTP 409.
- Missing records in an old browser snapshot do not delete records created by another source.
- Lead/course/lesson removals archive the parent rather than cascading deletion over new children.
- SQL migration enables RLS and removes direct anonymous/authenticated access to business tables. Server routes remain the data access boundary.
- User navigation bypass removed; marketing reads restricted to administrators. This is not a completed fine-grained permission audit.
- Explicit verification of email confirmation before fallback account linking.
- WordPress/WooCommerce reader with fixed HTTPS host, bounded pagination, redirect rejection, timeout, and previous-snapshot preservation on failure.
- Administrator integration status screen. Unimplemented or unconfigured connections are labelled accordingly.
- Dependency updates, including PDF.js security upgrade.

## Checks

- `npm test`: PostgreSQL ownership, rollback, conflicts, anonymous denial, row diff, mocked WordPress pagination and errors.
- `npm run build`: passes.
- API TypeScript check: passes.
- Lint of new connector/state files: passes. Repository-wide lint still has existing errors, including effect patterns and unused variables; not a release pass.
- Dependency audit still reports seven issues, primarily development tooling. Do not describe the project as security-audited or production-ready.
- No browser or production end-to-end validation of this branch yet. PDF rendering needs a real sample verification following its major upgrade.

## Before production

1. Make and verify a database backup; use an isolated staging Supabase project and Vercel preview environment.
2. Apply `supabase/002_atomic_changes.sql` and `003_integration_snapshots.sql` to staging. The new API requires these migrations.
3. Verify admin and salesperson workflows with independent users, including multi-tab saves, logout/login and archive behaviour.
4. Audit all remaining server routes, Storage policies, team view-as behaviour, and permission handling. The legacy public course-files bucket remains unresolved.
5. Provision `WORDPRESS_USERNAME` and `WORDPRESS_APPLICATION_PASSWORD` as server-only secrets for a dedicated read-only integration user. Never prefix them with `VITE_`.
6. Verify WordPress import against the actual site. It currently stores an independent snapshot; it does not yet reconcile orders to CRM clients/products.
7. Port Google Calendar OAuth into the Supabase/Vercel deployment; configure callback, encryption key, and consent. The separate Sites application's Google connection has not been transferred.
8. Implement and verify Sheets stable row IDs, column mapping, conflict handling and a retryable outbox before enabling two-way writes.
9. Inspect the site's LearnDash API and implement progress mapping; Elementor lead ingestion and scheduled synchronization remain outstanding.
10. SUMIT remains paused by owner request.

No migrations, deployments, external-source mutations, or business-data changes have been performed by this branch's work.
