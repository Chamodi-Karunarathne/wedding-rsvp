# Production deployment

Use Node 24.x, the pnpm version pinned in package.json, and a frozen lockfile.
Build with the final `NEXT_PUBLIC_SITE_URL=https://your-domain.example` already set.
That origin supplies invitation links, metadata and browser Origin validation;
changing it requires rebuilding. HTTP loopback origins are accepted for local QA.

## Before activation

- Set production `DATABASE_URL` to a TLS-required, pooled Neon connection, and set
  strong `ADMIN_PASSWORD` and random `ADMIN_SESSION_SECRET` values in hosting secrets.
- Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  and `pnpm audit`. Install build dependencies before building.
- Rehearse the migrations and `pnpm test:integration` on a disposable local database.
  The integration suite deliberately requires the loopback database
  `wedding_release_test`, role `release_test`, through `TEST_DATABASE_URL` and
  `RATE_LIMIT_TEST_DATABASE_URL`. It never reads the normal DATABASE_URL or .env.
- Review the event, venue, dates, reply contacts, guest assignments and duplicate
  import identities in the intended production database.
- Verify HTTPS/custom domain, backup retention, a tested restore, error monitoring,
  and the actual WhatsApp preview for Latin and Sinhala invitations.

## Migration order for this release

Migration `0003` deletes the old personal notes. Migration `0004` creates durable
public endpoint rate-limit counters. Both must be included in the release plan:
old code needs the dropped column, while new sign-in/reply endpoints require the
new table and deliberately return 503 if it is missing.

1. Build and stage the new artifact with the final origin and secrets configured.
2. Put the deployment into maintenance and drain old instances. Preserve a
   recoverable Neon branch/backup, including personal-note values; CSV exports
   do not preserve that column.
3. Run `pnpm db:migrate` with the production migration credential. Verify the
   migration journal includes `0003_remove_guest_personal_note` and
   `0004_public_rate_limits` and that the rate-limit table/index exist.
4. Activate the new artifact and run the smoke checks below before reopening
   traffic. Retain maintenance/telephone communication if a check fails.

For rollback after the drop, restore the nullable `guests.personal_note` column
before activating the older application. Adding the column restores compatibility;
recovering its previous values requires the backup. The additive rate-limit table
may remain during rollback. Rehearse this procedure before the live change.

Never use `db:seed`, `db:push` or the legacy `verify` acceptance script to update
an existing production guest list. Seed clears records/tokens, push skips the
reviewed migration history, and verify overwrites existing responses.

## Throttling and proxy configuration

Limits are enforced by atomic PostgreSQL UPSERTs shared by every app instance.
Identifiers are hashed; counters expire, saturate when denied and receive bounded
cleanup. Missing storage fails closed with a redacted server log and retryable 503.
Per-IP and endpoint allowances are admitted in one transaction: an already denied
IP spends no shared capacity, and a globally denied request creates no new IP row.

| Bucket | Limit |
| --- | --- |
| Login, per trusted IP | 10 attempts per 15 minutes |
| Login, entire endpoint | 100 attempts per 15 minutes |
| RSVP, per trusted IP | 60 requests per minute |
| RSVP, entire endpoint | 300 requests per minute |
| RSVP, per invitation token | 10 requests per 10 minutes |

The app ignores forwarded IP headers by default. If your hosting ingress overwrites
a header with exactly one verified IP and direct app access is blocked, set
`RATE_LIMIT_TRUSTED_IP_HEADER` to that header's name. Do not trust arbitrary
X-Forwarded-For chains. Verify the selected header against the provider's current
documentation and an actual request. Without a trusted header, per-IP buckets are
shared across visitors, providing a secure fallback with lower throughput.

Denied requests return 429 and Retry-After. JSON is streamed with byte ceilings:
2 KiB for login, 64 KiB for normal APIs, 1 MiB for CSV import. Imports accept at
most 1,000 data rows. Browser write requests must provide JSON and match the
configured Origin; Origin-less non-browser clients remain supported.

## Smoke checks

- Holding page 200; unknown invitation 404; unauthenticated admin redirects and
  private APIs return 401; successful login sets Secure/HttpOnly/SameSite cookies.
- Correct invitation details and both 1200 x 630 preview images; emitted image
  URLs use the permanent HTTPS domain. Check desktop, mobile and Sinhala names.
- Use dedicated synthetic invitations for create/change/decline/phone replies,
  allowance conflicts, re-import preservation, throttling, and response history.
  Confirm ordinary duplicate submissions do not manufacture history.
- Confirm late replies remain accepted, failed submissions remain retryable,
  keyboard focus stays visible, and telephone details survive script failure.
- Check logs for limiter-storage failures and database/5xx errors. Ensure logs
  redact invitation tokens, passwords, session cookies and database credentials.

The repository fixes do not provision DNS/TLS, backups, monitoring or provider
ingress rules. Those controls must be verified on the selected production host.
