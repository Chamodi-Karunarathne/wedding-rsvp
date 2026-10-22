# Invitation and future photo-wall boundary

Reviewed 22 October 2026 against `2596db8`. Scope: source and installed Next.js architecture documentation only. This review adds no photo feature, routes, schemas, migrations, storage integration, or database changes.

**Verdict:** the invitation UI has a useful separation from persistent services and data. A photo wall can be introduced as a separate feature without replacing the RSVP system. **Automatic wedding-day stage switching is not implemented:** existing phase data is scaffolding, and the current invitation page renders the same invitation in every phase.

## Current boundaries

| Concern | Current implementation |
| --- | --- |
| Invitation presentation | `src/app/(guest)/i/[token]/page.tsx:60`, its `_components`, `guest.css`, and group layout. The guest UI has no direct Drizzle/database imports. |
| Shared application shell | `src/app/layout.tsx:52` owns the root layout and fonts; the admin layout is separate. Next route groups organize layouts and files; their names do not appear in URLs and do not grant access control. |
| Invitation reads | `src/lib/services/invitation.ts:21` loads a token-matched household, invited events, replies, message, settings and calculated phase. Plain view models are defined in `src/lib/services/types.ts:80`. |
| Invitation writes | Thin public/admin handlers delegate to guest/RSVP services. Shared transactions and guest-row locking live in `src/lib/services/transactions.ts:20`; RSVP rules live in `src/lib/domain/rsvp.ts:67`. |
| Persistent state | `src/db/schema.ts` contains events, households, invitations, replies/history, messages, delivery/open tracking, settings and rate counters. It contains no photo records or object-storage boundary. |
| Admin access | `src/proxy.ts:39` gates `/admin/*` and `/api/admin/*`; private handlers independently call `src/lib/api/guard.ts:18`. The admin session represents the shared family password, not an individual moderator account. |

## Findings and severity

Severity describes impact on a future photo-wall integration. Items labeled future requirements are not claims of vulnerabilities in a feature that does not exist.

1. **Medium — phase settings do not switch the rendered stage today.** `src/lib/domain/phase.ts:6` defines `invitation`, `details`, `dayOf`, and `thankYou`; `currentPhase()` derives the stage or honors an override. `src/lib/services/invitation.ts:39` returns that phase and section order. However, `src/app/(guest)/i/[token]/page.tsx:103` always renders Intro/Card/RespondFlow and never consumes `invitation.phase` or `invitation.sections`. The “Website stage” control in `src/app/(admin)/admin/config/config-form.tsx:327` saves data; it does not activate a wall. There is also no live-refresh subscription or scheduled client stage transition. Intro's local animation `phase` is unrelated to the wedding phase.

2. **Medium — the disposable boundary is presentation, not the complete invitation feature.** `(guest)` also owns `/` and the token-specific OG image. Deleting it removes those routes but leaves `/api/rsvp`, admin workflows, tokens, stored replies, settings, shared fonts, and public artwork. Replacing a view must not silently invalidate previously sent `/i/[token]` links. `src/lib/services/types.ts:23` also exposes a broad GuestView with phone/private notes; current page props select fields carefully. A future wall should receive a smaller photo-specific view model rather than this whole object.

3. **High, future requirement — separate upload capability from RSVP and moderation authority.** `src/db/schema.ts:72` stores one unique bearer invitation token per household; `src/lib/domain/ids.ts:13` generates ten-character tokens. Possession currently permits reading that invitation and submitting its RSVP. It is not proof of an individual person's identity. Prefer separately scoped, revocable photo-upload links/capabilities associated with a household, without regenerating invitation tokens. Validate upload authority and the upload window server-side; a phase-dependent button is insufficient. Moderation must remain behind the admin guard. Individual moderator attribution would require an identity design beyond the existing shared password.

4. **High, future requirement — originals and unapproved photos need a private storage boundary.** Repository files under `public/` are directly accessible without an invitation/admin session. `next.config.ts:26` makes `/card/*` public and immutable for a year; noindex and no-referrer headers do not authorize reads. Keep incoming files outside `public/` and the card-artwork pipeline. A server-owned photo service should mediate private originals, validation/processing, moderation state and allowed display derivatives. Only approved content may enter the display feed. Decide whether wall viewers need guest access or a separate display capability before exposing derivative URLs.

5. **Medium, future requirement — live updates and moderation removal need their own cache policy.** The invitation page is `force-dynamic` (`page.tsx:27`); current services read the database without a persistent application cache. Static artwork caching and long-lived messaging-preview caches are unsuitable for a changing moderated feed. Define refresh behavior for already-open wall clients and cache invalidation when approval is withdrawn. Do not put pending items in cached feed data or use an invitation OG image as the wall feed. No polling, streaming, realtime channel, or moderation cache invalidation exists now.

6. **Medium, future requirement — upload transport and lifecycle must be independent.** `src/lib/api/request-body.ts:3` permits ordinary JSON bodies up to 64 KiB and requires JSON; it is not an upload parser. Keep those RSVP/admin protections intact. A future upload boundary needs its own byte/type/dimension limits, quotas and limiter scopes, plus storage finalization checks. `src/lib/services/opens.ts:29` measures invitation opens; wall polling/uploading should not inflate that metric. Database deletion cannot by itself remove external file objects: define retention and retryable cleanup explicitly.

## Recommended future feature boundary

Keep the current invitation domain and service commands. Add a separate photo presentation area, photo read/command services, minimal photo view models, moderation rules and a storage adapter when that feature is authorized. Give the wall its own layout so it does not inherit the invitation's paper/intro/response-dialog assumptions. Keep a single root layout; adding another route group alone cannot create a second route at an existing URL.

Use a small server-side stage entry point to select or link to the invitation and wall experiences. Existing `currentPhase()` and validated phase settings are suitable inputs, but the stage decision and upload-open decision must be explicit. Preserve a route back to invitation details/RSVP in every stage: `src/lib/domain/phase.ts:41` deliberately keeps RSVP reachable, and the deadline is informational. Do not overload section ordering or unrelated animation state to implement the new experience.

Future integration touchpoints are `src/lib/domain/phase.ts`, `src/lib/services/config.ts`, the current `/i/[token]` entry point, admin navigation (`src/app/(admin)/admin/_components/navigation.tsx:20`), and authenticated moderation handlers under `/api/admin/*`. Put photo-specific settings behind their own validated configuration boundary rather than changing the meaning of existing RSVP deadlines or invitation event membership. Binary objects belong behind the storage adapter; the database should hold photo workflow metadata and relationships. These are proposed boundaries, not files or tables created by this review.

## Invitation invariants to preserve

- Existing invitation URLs/tokens survive CSV updates, stage transitions and photo-capability changes. A household token must never become moderator authority or appear in a wall's public feed data.
- Replies remain scoped to invited events; server-owned party limits, decline normalization, guest-row locking, transactional history, provenance and idempotent retries remain in the RSVP service. Photo operations must not change replies or reuse their transaction locks for long-running file processing.
- Late replies remain accepted; phase selection does not erase or hide the route to RSVP. Private notes, guest messages, phone numbers and attendee names stay out of photo feeds unless a separate explicit disclosure decision is made.
- Delivery progress, invitation-open analytics, admin authorization, existing body limits and public-endpoint limiter budgets retain their current meanings.
- Guest deletion currently cascades through invitation-owned rows (`src/db/schema.ts:106`, `:128`, `:174`, `:204`, `:221`, `:247`); events, settings and shared limiter counters survive. Choose photo retention/anonymization and object cleanup explicitly, independently of guest deletion and stage switching, when adding relationships. `src/db/prepare-service.ts:102` is an explicitly confirmed test-data reset, never a wedding-day stage switch; its application-table inventory would also need review after future schema additions.

Validation for this review was read-only file/import inspection. No database, network, deletion experiment, or future feature implementation was performed. Installed Next guidance consulted: route groups, layouts/pages, Route Handlers, data security, and caching without Cache Components under `node_modules/next/dist/docs/01-app/`.
