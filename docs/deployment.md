# Production deployment from an empty guest list

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
- Review the initialized event, venue, dates, names and reply contacts. Verify
  the guest list and all operational tables are empty before importing real data.
- Verify HTTPS/custom domain, backup retention, a tested restore, error monitoring,
  and the actual WhatsApp preview for Latin and Sinhala invitations.

## Fresh-start setup

All existing households and operational records are disposable test data. A fresh
deployment initializes only the real ceremony and wedding configuration. It never
inserts development guests. All real households are created or imported through
the admin UI.

For a new empty database, set its DATABASE_URL, then run:

```sh
pnpm db:migrate
pnpm db:prepare
```

`db:prepare` creates the canonical `ceremony` event and any missing `phase`, `site`
and `messaging` settings. Repeating it preserves existing settings and guest data.
It creates no guest, invitation, response or delivery records.

For the existing database containing only test data, stop application traffic and
use the explicit one-time reset instead:

```sh
pnpm db:migrate
pnpm db:reset-test-data -- --confirm-test-data
```

The reset atomically clears all ten application tables, rebuilds one ceremony and
three configuration keys, and verifies that every operational count is zero.
It preserves the Drizzle migration ledger. Without the explicit confirmation flag
it refuses to connect. Do not run it after real households have been imported.

Verify the migration journal includes `0003_remove_guest_personal_note` and
`0004_public_rate_limits`. The new sign-in/reply endpoints require the limiter
table and return 503 if it is missing. Old application instances must be drained
before migration 0003 drops the column they used.

Activate the new build, sign in at `/admin/login`, review Wedding Details, then
use **Guests → Import a guest list** to add real households. Assign the ceremony through
the import form and review the preview before importing. Add individual guests
through the same admin UI. Confirm the final permanent invitation/preview origin
before sending links.

For application rollback to code that still uses `guests.personal_note`, restore
that nullable column before activating the older build. Test-data contents are
deliberately discarded by this fresh start. Once real data exists, enable backups
and rehearse restores; never use the test reset as a rollback mechanism.

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
