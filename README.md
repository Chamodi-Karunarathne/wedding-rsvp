# Wedding invitation site

Per-guest invitations, RSVPs, and an admin console for ~500 households.

One event: a Poruwa ceremony, 09:15 on Thursday 3 December 2026, at the Lumina Ballroom, Cinnamon Life, Colombo. Every invitation is delivered digitally, as a link sent personally over WhatsApp or email. A small number of households also receive a printed card, but the card does not reference this site: nobody types a code and nobody scans anything.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL from your Neon dev branch
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` prints sample invitation links to open.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests via Node's built-in runner. No test framework dependency. |
| `pnpm db:generate` | Write a migration from schema changes. Works without a database. |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Wipe and reseed. Refuses to run against `NODE_ENV=production` without `--force`. |
| `pnpm verify` | Runs the database-backed acceptance checks. Needs `pnpm dev` running. |
| `pnpm make-test-csv` | Writes a 50-row import fixture for the CSV import check. |
| `pnpm assets:optimize` | Rewrites `public/card/*.svg` through SVGO at 2dp precision. |

## Architecture

The rule the layout enforces: **the guest UI is disposable, everything below it is not.**

```
src/
  db/            schema, migrations, client        permanent
  lib/domain/    pure logic, no I/O                permanent
  lib/services/  all data access & writes          permanent
  lib/api/       Zod schemas, Result -> HTTP       permanent
  app/api/       thin handlers over services       permanent
  app/(admin)/   admin console                     semi-permanent, shadcn/ui
  app/(guest)/   guest UI                          DISPOSABLE
  components/ui/ shadcn components, admin only     generated, edit freely
  proxy.ts       the /admin gate                   permanent
```

`app/(guest)` imports nothing but `lib/services`, `lib/copy` and `lib/format`. Both invariants are checkable:

```bash
grep -rn "drizzle-orm\|@/db" "src/app/(guest)"   # returns nothing
rm -rf "src/app/(guest)" && pnpm typecheck        # still passes
```

The boundary is `lib/services/types.ts`, which exports plain view models rather than ORM row types. That is the whole reason the guest UI can be deleted without a ripple.

### One event, deliberately not collapsed

The `events` and `invitations` tables are untouched by the move to a single event, and every service still takes an `eventId`. Only the UI collapses: no event selector, no per-event headings, one set of counts. `POST /api/rsvp` still takes a `responses` array, and the client still sends exactly one entry.

That is on purpose. If a homecoming or a reception appears, it should be a row somebody inserts plus admin UI for choosing who is invited to what — not a migration three weeks before a printed deadline. Nothing above the data layer hardcodes a slug; `getPrimaryEvent()` is how the single event is found.

## Set in ink from the first message

1. **`NEXT_PUBLIC_SITE_URL`** — baked into every invitation link sent over WhatsApp. A delivered message cannot be reissued, so this must be the final production domain, registered and held, before the first send. This is the hardest external dependency in the project.
2. **The invitation token** — regenerating one breaks a link somebody already holds. CSV re-imports never touch it.
3. **The OG image** — see below. WhatsApp caches previews near-permanently.

## Before anyone receives a link

`src/app/(guest)/i/[token]/opengraph-image.tsx` is a **placeholder**. WhatsApp caches link previews more or less permanently, so the first image a guest's phone fetches is the one they keep forever — redeploying does not replace it for anyone who already has the link. It currently renders "PLACEHOLDER — not the final invitation image" in large red type, deliberately, so it cannot slip through quietly. Replace it before sending anything to anybody, including a test group chat.

## Domain rules, and where they live

All in `lib/domain`, none in the UI:

- One `guests` row per **invitation** — never per person, never per delivery channel.
- RSVP is per `(guest, event)`, even with a single event.
- `party_count <= max_party_size`, validated server-side from the guest's own record. Also pinned by a database CHECK constraint.
- Declining always normalizes to a party of zero with attendee names cleared, whatever the client sent.
- RSVPs are upserts. `submitted_at` records the first answer; `updated_at` moves on every change. Nothing is ever hard-deleted or duplicated.
- Every overwrite copies the previous answer into `rsvp_history` first, carrying `source`, `recorded_by` and `attendee_names`. A guest submitting over a response transcribed from a phone call must not erase it silently — when the counts look wrong in November, this is the audit trail.
- The reply date is **displayed and never enforced**. A late answer saves normally and the copy softens rather than closing the form; `submitted_at` already says who was late.
- Every value in `lib/copy.ts` is a plain string, and must stay one. The whole bundle is handed to `RsvpForm`, a Client Component, so a function anywhere in it throws "Functions cannot be passed directly to Client Components" at render - and only on the routes that reach the form, so a type check and a build both pass while the invitation page 500s. Strings carry `{{placeholders}}` filled by `renderTemplate`; `copy.test.ts` fails if a non-string creeps back in.
- A `display_name` over 28 characters warns in admin and saves anyway. `display_name_fallback` holds the shorter card form; `cardName` resolves the two while `displayName` stays truthful, so admin can still see the real name it is warning about.
- A guest may only RSVP to events they hold an `invitations` row for — otherwise 403.
- Phase controls section **order**, never visibility. The RSVP form is reachable in every phase.

## The phase system

`lib/domain/phase.ts` is pure and dependency-free, with unit tests covering every boundary — including exact-millisecond equality, the manual override for each phase, misordered configuration, and a zero-width phase.

Phase dates and the override are edited at `/admin/config`. Times there are entered in the wedding's own timezone, not the browser's or the server's.

## CSV import

Matches existing guests on `(sort_name, phone)`, both normalized — `077 123 4567` and `+94771234567` are the same household, and a missing phone collapses to `''` rather than `NULL` so two households with no number are still comparable. Re-running an import updates rather than duplicates, and **never regenerates a token**, so a link already sent stays valid.

Errors are reported per row; one bad row does not stop the other 499.

Exports are written with a UTF-8 BOM, because Excel will not read UTF-8 without one and the Sinhala names would otherwise reach the card designer as mojibake.

## Admin auth

One shared password, no user system. A signed httpOnly cookie carrying only an expiry, verified in `src/proxy.ts` (Next 16 renamed middleware to proxy; it always runs on Node). `lib/auth.ts` uses Web Crypto rather than `node:crypto` so the same code runs in the proxy and in the login handler. The password comparison hashes both sides before comparing, so the real password's length does not leak.

## Responses that arrive by telephone

The printed cards carry a reply date of 3 November 2026 and two phone numbers, so a real fraction of the answers arrive as calls that somebody has to key in. `/admin/rsvps` leads with a search-first **Record a response** flow: find the household, key in the answer, saved with `source = 'phone'` and `recorded_by`. It goes through the same endpoint, and therefore the same invariants, as a guest's own submission.

The dashboard filters by source, so it stays visible which numbers came from guests and which were transcribed. That filter narrows the **list and the CSV only, never the counts** — an invitation with no answer has no source, so a source-filtered count table would understate every column and read as a catastrophe rather than a filter.

## Sent, opened, responded

Every guest arrives through a link somebody sent them, which makes `guest_opens` the only signal separating "has not seen it" from "seen it and not replied" — the difference between resending a link and picking up the phone. `/admin/send` shows all three as distinct states:

- **sent** — a delivery channel is marked `sent` or `delivered`
- **opened** — somebody actually loaded the invitation; link-preview crawlers are excluded, so WhatsApp fetching the URL to build its preview does not count
- **responded** — an answer exists, however it arrived

`deliveryState()` in `lib/domain/delivery.ts` is pure and tested. Each household shows the furthest point it has reached, so someone who telephoned without ever opening their link still reads as responded.

## The admin console

shadcn/ui, on the `b2gRh45yxF` preset (`components.json` records it). Applied with:

```bash
pnpm dlx shadcn@latest init --preset b2gRh45yxF
pnpm dlx shadcn@latest apply --preset b2gRh45yxF
```

Components live in `src/components/ui/` and are ordinary source files - generated once, then edited like anything else. This preset is built on Base UI rather than Radix, so `Select` takes `value`/`onValueChange` on the root.

Two things it touches outside `/admin`, both in `src/app/globals.css` and both from the preset's own base layer: `body` gets `bg-background text-foreground`, and `html` gets `font-serif` with Noto Serif and Public Sans loaded in the root layout. The guest UI is disposable and unstyled, so it inherits those and is otherwise untouched.

The root layout no longer sets a width. Guest pages get their reading column from `(guest)/layout.tsx` and `not-found.tsx` sets its own; the console needs the full width for its tables.

## Card artwork

Illustrator exports land in `public/card/` as SVG. `public/card/manifest.json` lists what the design expects, and `pnpm build` fails before `next build` runs if a listed file is missing or any SVG exceeds 150 KB — the alternative is an empty frame that a guest notices first. `pnpm assets:optimize` rewrites the exports through SVGO at 2dp coordinate precision, adds anything new to the manifest, and stamps it with a content hash. It also prefixes every id with the filename (`card-base__card-base-root`), because Illustrator writes `id="Layer_2"` on every root and 325 glyph ids of the form `font_2_37` into card-text.svg alone - inline two of those in one document and the second silently wins. Entries are never removed from the manifest by the script: a file that vanishes should fail the build, not quietly stop being expected.

Assets are served `immutable` for a year. That is only safe because `cardAsset()` appends that hash: artwork arrives iteratively under the same filenames, and a bare `/card/frame.svg` would pin the first export in every cache that ever saw it. The same trap as the WhatsApp preview cache, in a different costume.

## Configuration and dates

Phase dates, the reply date, the couple's names and the WhatsApp message template all live in `site_config` and are edited at `/admin/config`. The wording of that message will change repeatedly and never at a convenient moment, so it must not need a deploy. The defaults ship as the real dates and can be re-pointed from the environment — `WEDDING_EVENT_DATE`, `WEDDING_RSVP_DEADLINE` and the phase dates, see `.env.example`. A malformed override throws at startup rather than quietly reverting.

`events.starts_at` is the single source of truth for when the wedding is. The event date is deliberately **not** duplicated into `site_config`: two copies drift, and the one the guest page reads would not be the one somebody edited. `/admin/config` shows it read-only.

Details open on **1 October**, a month before the reply date. They previously opened after it, which was defensible while the printed card carried the venue and time. It no longer does, so that ordering would have asked five hundred people to commit before being told where they were going.

## Not in scope

No visual design, guestbook, photo uploads, seating, or email. Sinhala translation is not written, but `lib/copy.ts` holds every guest-facing string keyed by locale, so adding it later is one object rather than a hunt through JSX.
