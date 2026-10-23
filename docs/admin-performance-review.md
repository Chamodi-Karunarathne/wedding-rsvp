# Admin page latency review

23 October 2026. The review confirmed a shared Neon WebSocket pool limited to one
connection and live Vercel functions executing in Washington, DC. The locally
configured Neon database is in Singapore; this is also a production region
mismatch if deployment uses that same database. The fixes use concurrent HTTP
queries, a bounded four-client pool for interactive transactions, and a Vercel
function region pinned to the configured database's Singapore region.

## Why a small database was still slow

Overview, Guests and Responses start `listGuests`, `listEvents` and `getConfig`
with `Promise.all`. Even with zero households, those are three network queries.
With any household present, `listGuests` also reads invitations, responses,
delivery channels, messages and opens: eight queries altogether for those pages.

The old pool's `max: 1` serialized those requests. Its shared process cache also
let concurrent requests queue behind each other. The comment assuming one
request per serverless instance was incorrect for
[Vercel Fluid compute](https://vercel.com/docs/fluid-compute), which supports
concurrent invocations in an instance. Being in the same region reduces network
latency but does not remove this queue or connection establishment.

Authentication in `src/proxy.ts` verifies a signed cookie locally without
database or network access. List routes already stream loading skeletons, and
auto-refresh starts after 30 seconds. No per-guest query loop or costly SQL was
found in the empty-list path.

## Change

`src/db/client.ts` enables the installed Neon driver's
[`poolQueryViaFetch`](https://github.com/neondatabase/serverless/blob/main/CONFIG.md#poolqueryviafetch-boolean)
option. Ordinary `Pool.query()` calls use HTTP and no longer compete for a
WebSocket slot. The runtime fetch wrapper explicitly uses `cache: 'no-store'`,
so admin updates and refreshes continue reading current data.

Drizzle's installed transaction implementation uses `Pool.connect()` and keeps
BEGIN, validation, row locks, dependent writes, COMMIT or ROLLBACK on the same
checked-out WebSocket client. Four transaction clients can be acquired per
instance. Idle clients expire after 10 seconds; idle connection errors emit a
fixed message without credentials or query parameters.

Neon 1.1 documents the hybrid flag as experimental. Its HTTP path does not apply
session startup options from the connection URL, so use the standard pooled
Neon URL without session-specific overrides. Pool lifecycle listeners other
than `error` disable the HTTP path. Transport regression tests cover these
call paths and must remain part of dependency upgrade checks.

## Measurements

Production Next builds ran locally and read the configured Neon database.
Each route was requested four times using the same local test authentication;
the table shows the median of the last three full response completion times.
These are server response timings, not browser interactivity measurements or
same-region Vercel benchmarks. The database contained one household at probe
time; probes used SELECTs and a read-only transaction and changed no records.

| Page | Before | After |
| --- | ---: | ---: |
| Overview | 716 ms | 196 ms |
| Guests | 689 ms | 293 ms |
| Invitations | 713 ms | 260 ms |
| Responses | 717 ms | 265 ms |
| Wedding Details | 172 ms | 99 ms |

The first sampled Overview response completed in 2,267 ms before and 841 ms
after. This was not a controlled cold-start comparison. Skeleton response
headers already arrived quickly on warm requests; the delay was completing the
database-backed content.

A separate three-query transport probe measured warm medians of 264 ms with
the old single-connection WebSocket pool, 86 ms with four WebSocket clients, and
92 ms with HTTP queries. This isolates the serialization overhead from page
rendering. HTTP also removes the need to establish a persistent WebSocket for
ordinary reads; these small local samples do not establish a universal HTTP
speed advantage over an already warm concurrent WebSocket pool.

Ignored QA artifacts hold raw timings without guest details:
`build/qa/admin-page-timing-before.json`, `admin-page-timing-after.json` and
`admin-neon-transport-results.json`.

## Live deployment follow-up

After the deployment URL was provided, authenticated read-only GET requests to
`https://madhushaniandcharith.vercel.app` confirmed the delay on the current live
build. Four requests per route were sampled; warm medians use the last three.
No login forms, guest changes, responses or tracking requests were submitted.
Session credentials and response bodies were not logged.

| Deployed page | Warm full response |
| --- | ---: |
| Cached holding page | 90 ms |
| Login (no database reads) | 327 ms |
| Overview | 2,165 ms |
| Guests | 2,143 ms |
| Invitations | 2,154 ms |
| Responses | 2,139 ms |
| Wedding Details | 794 ms |

Every authenticated admin response included `x-vercel-id` in the form
`bom1::iad1::...`. The first region is request ingress; the additional `iad1`
execution region is Washington, DC. Vercel documents the region fields in its
[response header reference](https://vercel.com/docs/headers/response-headers#x-vercel-id).
The locally configured Neon endpoint encodes `ap-southeast-1` (Singapore).
Assuming production uses that configured database, the database-facing runtime
and Neon are currently in different regions. Production database environment
variables were not available for independent inspection.

The deployed list pages sent their loading shell after roughly 300–480 ms, then
took another 1.8–2.5 seconds to complete content. The repeated warm delay,
single-connection queue and region mismatch explain why a nearly empty database
still feels slow. Public timings alone do not separately quantify SQL execution,
connection establishment, Neon activation or Vercel cold-start costs.

`vercel.json` now sets `regions: ["sin1"]`, matching the configured Neon region.
Vercel maps `sin1` to `ap-southeast-1` in its
[region table](https://vercel.com/docs/regions), and supports this configuration
through the [project regions setting](https://vercel.com/docs/functions/configuring-functions/region#project-configuration).
Deploy the current source to apply both fixes, then rerun the authenticated
measurements and confirm execution in `sin1`. Moving the configured database to
another region requires updating this setting.

The production deployment has not been changed by these read-only probes.
Results are in `build/qa/vercel-admin-timing-results.json` and
`build/qa/vercel-public-timing-results.json`. These are current-build baselines;
no post-deployment speedup is claimed.

## Validation and deployment limits

The production build and TypeScript passed. All 207 unit tests passed, with one
opt-in integration skipped by the ordinary unit command. All 24 PostgreSQL
integration tests passed in private schemas in the disposable local database.
Three new no-network tests exercise the installed Neon and Drizzle adapters:
concurrent HTTP query initiation, bound parameters and Date mapping, plus
same-client transaction commit, rollback and release. A real read-only Neon
transaction also passed with the hybrid flag enabled.

The stronger Reply cue also passed Chromium and WebKit browser checks: a warm
halo, two small label lifts, unchanged button geometry and no horizontal overflow.
All cue animations stop during intro/replay, dialogs, the thank-you state and
reduced-motion mode. These checks used disposable local guests; WebKit ran on
Windows rather than a physical iPhone.

Deploy the updated build; no schema migration or new environment variable is
required. Vercel project telemetry was unavailable for this review. The region
configuration was checked against Vercel's documented schema shape and region
mapping; the running deployment's placement must be rechecked after deployment.

[Neon compute activation](https://neon.com/docs/introduction/compute-lifecycle)
can still add delay to the first query after suspension. This review confirmed
the application queue and deployed runtime placement; it does not separately
measure cold-start contributions.
