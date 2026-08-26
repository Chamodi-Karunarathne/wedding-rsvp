# Wedding invitation site

Per-guest invitations, RSVPs, and an admin console for ~500 households.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL from your Neon dev branch
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` prints sample invitation links and short codes to open.

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

## Architecture

The rule the layout enforces: **the guest UI is disposable, everything below it is not.**

```
src/
  db/            schema, migrations, client        permanent
  lib/domain/    pure logic, no I/O                permanent
  lib/services/  all data access & writes          permanent
  lib/api/       Zod schemas, Result -> HTTP       permanent
  app/api/       thin handlers over services       permanent
  app/c/         short-code redirect               permanent (PRINTED ON PAPER)
  app/(admin)/   admin console                     semi-permanent, stays ugly
  app/(guest)/   guest UI                          DISPOSABLE
```

`app/(guest)` imports nothing but `lib/services`, `lib/copy` and `lib/format`. Both invariants are checkable:

```bash
grep -rn "drizzle-orm\|@/db" "src/app/(guest)"   # returns nothing
rm -rf "src/app/(guest)" && pnpm typecheck        # still passes
```

The boundary is `lib/services/types.ts`, which exports plain view models rather than ORM row types. That is the whole reason the guest UI can be deleted without a ripple.

### Two things that are deliberately *not* in `app/(guest)`

`/c/[code]` and `/api/qr/[code]` are printed on paper. They live outside the disposable route group, because a physical card must not point at code someone has been invited to delete.

## Things that are set in ink once cards are printed

Cards go to the printer in October. After that these cannot change:

1. **`NEXT_PUBLIC_SITE_URL`** — baked into every QR code. It must be the final production domain, registered and held, before printing. This is the hardest external dependency in the project.
2. **The short code alphabet** (`src/lib/domain/ids.ts`) — 24 characters, no vowels so a code can never spell a word, and one of each confusable pair removed (`0/O`, `1/I/L`, `2/Z`, `5/S`, `6/G`, `8/B`).
3. **The QR payload shape** — `{origin}/c/{SHORT_CODE}`, matching the code printed as text beside it.

## Before anyone receives a link

`src/app/(guest)/i/[token]/opengraph-image.tsx` is a **placeholder**. WhatsApp caches link previews more or less permanently, so the first image a guest's phone fetches is the one they keep forever — redeploying does not replace it for anyone who already has the link. It currently renders "PLACEHOLDER — not the final invitation image" in large red type, deliberately, so it cannot slip through quietly. Replace it before sending anything to anybody, including a test group chat.

## Domain rules, and where they live

All in `lib/domain`, none in the UI:

- One `guests` row per **invitation** — never per person, never per delivery channel.
- RSVP is per `(guest, event)`; someone can attend the reception and skip the ceremony.
- `party_count <= max_party_size`, validated server-side from the guest's own record. Also pinned by a database CHECK constraint.
- Declining always normalizes to a party of zero with attendee names cleared, whatever the client sent.
- RSVPs are upserts. `submitted_at` records the first answer; `updated_at` moves on every change. Nothing is ever hard-deleted or duplicated.
- A guest may only RSVP to events they hold an `invitations` row for — otherwise 403.
- Phase controls section **order**, never visibility. The RSVP form is reachable in every phase.

## The phase system

`lib/domain/phase.ts` is pure and dependency-free, with unit tests covering every boundary — including exact-millisecond equality, the manual override for each phase, misordered configuration, and a zero-width phase.

Phase dates and the override are edited at `/admin/config`. Times there are entered in the wedding's own timezone, not the browser's or the server's.

## CSV import

Matches existing guests on `(sort_name, phone)`, both normalized — `077 123 4567` and `+94771234567` are the same household, and a missing phone collapses to `''` rather than `NULL` so two print-only guests are still comparable. Re-running an import updates rather than duplicates, and **never regenerates a token or short code**, so a card already at the printer stays valid.

Errors are reported per row; one bad row does not stop the other 499.

Exports are written with a UTF-8 BOM, because Excel will not read UTF-8 without one and the Sinhala names would otherwise reach the card designer as mojibake.

## Admin auth

One shared password, no user system. A signed httpOnly cookie carrying only an expiry, verified in `src/proxy.ts` (Next 16 renamed middleware to proxy; it always runs on Node). `lib/auth.ts` uses Web Crypto rather than `node:crypto` so the same code runs in the proxy and in the login handler. The password comparison hashes both sides before comparing, so the real password's length does not leak.

## Not in scope

No visual design, guestbook, photo uploads, seating, or email. Sinhala translation is not written, but `lib/copy.ts` holds every guest-facing string keyed by locale, so adding it later is one object rather than a hunt through JSX.
