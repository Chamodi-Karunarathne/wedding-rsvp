# Production deployment

Use Node 24.x, the pnpm version pinned in package.json, and a frozen lockfile.
Build with the final `NEXT_PUBLIC_SITE_URL=https://your-domain.example` already set.
That origin supplies invitation links, metadata and browser Origin validation;
changing it requires rebuilding. HTTP loopback origins are accepted for local QA.

Vercel's CDN handles gzip/Brotli compression, so `next.config.ts` disables Next's
own compression middleware. The bundled middleware can accumulate `drain` once
listeners on Gzip during streamed responses under backpressure. This avoids that
path without raising listener limits or suppressing warnings. If self-hosting,
configure compression in the reverse proxy. See [Vercel compression](https://vercel.com/docs/how-vercel-cdn-works/compression).

## Before activation

- Apply `pnpm db:migrate` through `0006_retire_unused_delivery_values` before
  activating this build. It removes only `in_person` delivery-channel rows,
  changes `delivered` to `sent` while preserving their sending metadata, and
  restricts channels/statuses to the active choices. Households, invitation
  tokens, replies, messages and open timestamps are preserved. No database
  reset or phone backfill is required.
- Set production `DATABASE_URL` to a TLS-required, pooled Neon connection, and set
  strong `ADMIN_PASSWORD` and random `ADMIN_SESSION_SECRET` values in hosting secrets.
- `vercel.json` pins functions to `sin1` (Singapore), matching the configured
  Neon compute in `ap-southeast-1`. If the database moves, update this setting.
  The CDN location does not establish where functions run. Re-deploy after a
  region change; see [Vercel's region configuration](https://vercel.com/docs/functions/configuring-functions/region).
- Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  and `pnpm audit`. Install build dependencies before building.
- Rehearse the migrations and `pnpm test:integration` on a disposable local database.
  The integration suite deliberately requires the loopback database
  `wedding_release_test`, role `release_test`, through `TEST_DATABASE_URL` and
  `RATE_LIMIT_TEST_DATABASE_URL`. It never reads the normal DATABASE_URL or .env.
- Review the configured event, venue, dates, names and reply contacts. For an
  existing production database, preserve the guest list and operational tables.
  Verify an empty list only when initializing a genuinely new database.
- Verify HTTPS/custom domain, backup retention, a tested restore, error monitoring,
  and the actual WhatsApp preview for Latin and Sinhala invitations.

## Existing production upgrades

Production contains real data. Apply reviewed forward migrations with
`pnpm db:migrate`, then activate the new build. Do not run `db:reset-test-data`,
Clear All Guests or fresh-start cleanup as part of a production deployment.
Migration `0006_retire_unused_delivery_values` is the only data adjustment for
the retired channel/status and does not clear guest or RSVP data.

## New empty database setup

A fresh deployment initializes only the real ceremony and wedding configuration.
It never inserts development guests. All real households are created or imported through
the admin UI. Guest-seeding, fake CSV generation and the legacy acceptance script
that wrote synthetic responses have been removed. The guarded integration tests
create fixtures only in private schemas on the disposable local test database.

For a new empty database, set its DATABASE_URL, then run:

```sh
pnpm db:migrate
pnpm db:prepare
```

`db:prepare` creates the canonical `ceremony` event and any missing `phase`, `site`
and `messaging` settings. Repeating it preserves existing settings and guest data.
It creates no guest, invitation, response or delivery records.

Verify the migration journal includes `0003_remove_guest_personal_note`,
`0004_public_rate_limits`, `0005_add_social_delivery_channels` and
`0006_retire_unused_delivery_values`. The sign-in/reply endpoints require the limiter
table and return 503 if it is missing. Old application instances must be drained
before migration 0003 drops the column they used.

Activate the new build, sign in at `/admin/login`, review Wedding Details, then
use **Guests → Import a guest list** to add real households. Assign the ceremony through
the import form and review the preview before importing. Add individual guests
through the same admin UI. Confirm the final permanent invitation/preview origin
before sending links.

For application rollback to code that still uses `guests.personal_note`, restore
that nullable column before activating the older build. Keep backups and rehearse
restores; never use the test reset as a rollback mechanism.

Use `db:migrate` for production schema changes. `db:push` bypasses the reviewed
migration history and must not update a production database. Guest imports and
guest changes belong in the admin UI.

## Admin database latency

Standalone queries use Neon's HTTP transport without a persistent data cache;
independent page reads run concurrently. Interactive transactions still use a
checked-out WebSocket connection for their entire lifetime, preserving locks,
dependent writes and rollback. The transaction pool permits up to four clients
per function instance. No environment variable or schema migration is needed for
this transport change; deploy the updated build.

Do not add pool `connect`, `acquire`, `release` or `remove` event listeners: these
disable Neon's HTTP query path. Use a standard Neon pooled URL; HTTP queries do
not apply PostgreSQL session startup options from the URL. The shipped Neon 1.1
driver documents `poolQueryViaFetch` as experimental, so retain the transport
regression checks when upgrading it.

If deployed admin loads remain slow, compare full response completion with time
to first byte: loading skeletons can arrive well before database content. Inspect
Vercel function duration and its actual region, then Neon activation and query
latency. A first visit after Neon suspends may include wake-up time; sustained
warm-page delays need separate investigation. See
[the performance review](admin-performance-review.md) for measurements and limits.

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
| Link opens, per trusted IP | 120 requests per minute |
| Link opens, entire endpoint | 600 requests per minute |
| Link opens, per invitation token | 30 requests per 10 minutes |

The app ignores forwarded IP headers by default. If your hosting ingress overwrites
a header with exactly one verified IP and direct app access is blocked, set
`RATE_LIMIT_TRUSTED_IP_HEADER` to that header's name. Do not trust arbitrary
X-Forwarded-For chains. Verify the selected header against the provider's current
documentation and an actual request. Without a trusted header, per-IP buckets are
shared across visitors, providing a secure fallback with lower throughput.

Denied requests return 429 and Retry-After. JSON is streamed with byte ceilings:
2 KiB for login/link opens, 64 KiB for normal APIs, 1 MiB for CSV import. Imports accept at
most 1,000 data rows. Browser write requests must provide JSON and match the
configured Origin; Origin-less non-browser clients remain supported.

## Smoke checks

Run synthetic invitation and response checks only against an isolated local or
staging database. Keep fresh production empty; after real admin imports, validate
invitation rendering and tracking with a real imported guest and record only
genuine responses.

- Holding page 200; unknown invitation 404; unauthenticated admin redirects and
  private APIs return 401; successful login sets Secure/HttpOnly/SameSite cookies.
- Correct invitation details and both 1200 x 630 preview images; emitted image
  URLs use the permanent HTTPS domain. Check desktop, mobile and Sinhala names.
  Fetch the exact `og:image` URL from the invitation HTML and verify HTTP 200
  with `image/png`; the correct origin alone does not prove the image works.
  Keep the image handler explicitly `force-dynamic`: its artwork ID does not
  enumerate guest tokens. It must not appear as a partial SSG fallback in
  `.next/prerender-manifest.json`, even though the build summary can mark the
  metadata helper as SSG because it internally exports static image IDs.
- Use dedicated synthetic invitations for create/change/decline/phone replies,
  allowance conflicts, re-import preservation, throttling, and response history.
  Confirm ordinary duplicate submissions do not manufacture history.
- Confirm late replies remain accepted, failed submissions remain retryable,
  keyboard focus stays visible, and telephone details survive script failure.
- Open a synthetic invitation in a visible browser and verify the first/last
  link-open times in admin. Ordinary links count even with a signed-in admin
  cookie. The **Preview invitation** action explicitly adds `?preview=1` and,
  like messaging previews and background prefetches, leaves those times unchanged.
  Real embedded browser user agents containing WhatsApp/Viber remain eligible;
  bare messaging preview agents remain excluded. Tracking failures must not block
  the invitation or replies. Return after switching tabs or restoring a page
  from browser history: first-open remains fixed and last-open advances. Rapid
  duplicate visibility/pageshow events are deduplicated for five seconds.
  Temporary failures retry with a bounded budget and respect Retry-After;
  storage failures return a retryable 503. A tracking request times out after
  ten seconds, and a later visible return is queued while an earlier request
  is pending. No heartbeat updates an idle page.
  The Invitations table includes seconds and an ISO datetime, in the configured
  wedding timezone. A recorded open is a visible browser visit, not proof of
  guest identity or attendance.
- Verify response and invitation cards lead with guest counts and show household
  counts underneath. Reserved-place totals drive invited/waiting/declined figures;
  attendance uses the confirmed reply headcount. Check the overview's bride,
  groom and **Both families** groups reconcile to its primary ceremony totals
  without double-counting shared households.
- Check logs for limiter-storage failures and database/5xx errors. Ensure logs
  redact invitation tokens, passwords, session cookies and database credentials.

The repository fixes do not provision DNS/TLS, backups, monitoring or provider
ingress rules. Those controls must be verified on the selected production host.
