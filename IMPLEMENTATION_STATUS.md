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
- Google Calendar OAuth callback with cookie-bound, single-use state, PKCE, encrypted tokens, scope verification, calendar selection and a bounded event import. Not yet tested against a real Google account in staging.
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
2. Apply `supabase/002_atomic_changes.sql` and `003_integration_snapshots.sql`, followed by `004_google_oauth.sql` to staging. The new API requires these migrations.
3. Verify admin and salesperson workflows with independent users, including multi-tab saves, logout/login and archive behaviour.
4. Audit all remaining server routes, Storage policies, team view-as behaviour, and permission handling. The legacy public course-files bucket remains unresolved.
5. Provision `WORDPRESS_USERNAME` and `WORDPRESS_APPLICATION_PASSWORD` as server-only secrets for a dedicated read-only integration user. Never prefix them with `VITE_`.
6. Verify WordPress import against the actual site. It currently stores an independent snapshot; it does not yet reconcile orders to CRM clients/products.
7. Configure `CRM_ORIGIN`, `CRM_VAULT_KEY` (32 random bytes, base64), `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` as server-only environment variables. Register `CRM_ORIGIN/api/google` as the callback in Google Cloud, then verify a real OAuth flow. The separate Sites application's existing tokens have not been transferred.
8. Implement and verify Sheets stable row IDs, column mapping, conflict handling and a retryable outbox before enabling two-way writes.
9. Inspect the site's LearnDash API and implement progress mapping; Elementor lead ingestion and scheduled synchronization remain outstanding.
10. SUMIT remains paused by owner request.

No migrations, deployments, external-source mutations, or business-data changes have been performed by this branch's work.

## Staging setup checkpoint (2026-09-09)
- Supabase staging project: ykavhezwzrngqaxhjxsg. Baseline schema creation verified successful in SQL editor.
- Migrations 002-004 were pasted into staging SQL editor. Run action timed out and browser inventory also timed out. Execution outcome is UNKNOWN: inspect schema before retrying.
- No staging deployment or real data import completed. Production database was not targeted.
- Local npm test: 5 tests passed.

