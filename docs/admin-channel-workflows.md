# Guest delivery and admin workflows

27 October 2026, Asia/Colombo.

Apply migration `0006_retire_unused_delivery_values` with `pnpm db:migrate` before
activating this build. It removes only retired `in_person` delivery-channel rows
and changes `delivered` to `sent`, preserving the remaining sending metadata.
Households, invitations, tokens, replies, messages and open timestamps remain
intact. Do not reset the production database.

## Channels, contacts and messages

Channels are `whatsapp`, `print`, `instagram`, `messenger` and `wechat`.
Sending statuses are **Not sent** (`pending`) and **Sent** (`sent`).
Guest creation/editing can select channels in the same transaction
as household details. Sending details can add/remove channels and change status.
Retained channels keep their sent date, sender and notes.

Store several phone numbers in one comma-separated field. Each number is
normalized separately; local `077...` and nine-digit subscriber forms become
`+9477...`, and international country codes are retained. Duplicates collapse
without changing the preferred contact order. The API validates the entire list
and the canonical storage length; it never joins two numbers into one recipient.
The Invitations table lets the sender choose one WhatsApp number.

Numbers are optional for non-WhatsApp delivery. A WhatsApp registration without
a usable number is accepted with a persistent warning. Add a number, or remove
WhatsApp/select another channel to resolve it. Warning filters and invitation
warnings use live data rather than a flag that can become stale.

Wedding Details contains separate WhatsApp and plain-text templates. Both accept
the existing personal-detail placeholders and Unicode. Older messaging settings
retain their WhatsApp wording and receive a plain-template default; no data
migration is required for this setting. Social-channel rows default to plain
text, and a sender can explicitly choose either copy format.

## Import choices

The CSV sample contains all ten columns, quoted multi-number phones and both
WhatsApp and social examples. Preview is read-only. Existing matches must be
reviewed per row:

| Choice | Behavior |
| --- | --- |
| Update | Merge nonblank imported details and union phone/event/channel assignments. |
| Replace | Apply CSV details/defaults and replace event/channel assignments. |
| Discard | Keep the existing household unchanged. |

Tokens, recorded replies and their history survive both save choices. Invalidating
recorded attendance remains forbidden. Guest ID and update time bind each choice
to its preview; stale choices, ambiguous matches and multiple CSV rows targeting
the same guest require correction. An API upload without choices leaves matched
guests unresolved instead of silently overwriting them.

One transaction covers an apply operation. Batches of 25 use savepoints so row
constraints remain isolated, while infrastructure failures roll back the whole
upload. Imports and Clear All share an advisory lock across the complete apply.

## Dialogs and tables

Add, Import, household details, sending details and recording replies open in
shadcn-style Base UI dialogs. Optional editors load on first opening; closing a
dialog preserves drafts. Dialogs trap focus, restore it to their trigger and keep
close controls accessible while long forms scroll. Auto-refresh pauses for any
visible dialog, including content portaled outside the page's main element.

Guests uses eight columns, Invitations eight and Responses eleven. Invitations
includes **Which side** alongside the household name. The wider admin
layout and separate phone/channel/reply/action columns keep rows compact.
Mobile tables scroll within their own container rather than stacking every
field into tall rows. Long names are clamped with full details in the editor;
phone cells show two numbers with a count for additional contacts.

All three lists share search and filters for family side, channel, response,
invitation progress, invited event, reply method, phone availability and whether
the invitation link has been opened. Open **More filters** for additional fields;
active additional filters open that section automatically. Select **Apply filters**
to use all choices together, or **Reset all** to clear filters and sorting.
Search includes household/card/sort names, phone numbers, attendee names and notes.
Local and international phone searches work across all saved numbers.

Click a data column heading to sort ascending, then click again to reverse it.
**Sort by** also offers dates added, guest details updated, latest reply and last
opened. Missing values stay at the end in either direction, with stable name/ID
ordering for ties. Filters and sort order are encoded in the URL and survive
refreshes, bookmarks and browser navigation. CSV downloads use the same filters
and row order; the editable guest CSV retains its import-compatible columns.
Selecting an event scopes replies, reply sorting, response totals and response
CSV columns to that event. A response and reply-method combination must match
the same reply. Households with no event invitation are not treated as waiting.

Summary cards lead with guest counts and show households underneath. Invited,
waiting and declined counts use reserved places (`max_party_size`); attending
uses confirmed reply counts (`party_count`). Reserved places need not equal
confirmed attendance. Response totals describe the filtered households and
selected event. Invitation progress cards count reserved places once per invited
household in the current filtered scope before the progress filter, and preserve
the other choices when selected. Periodic refresh continues while filter sections
are open and pauses while a filter input is focused or an editor/dialog is open.

The Invitations table combines sending controls under **Invitation**. A selected
WhatsApp channel shows direct sending, WhatsApp message copying and, for several
contacts, a number selector. Copying also works when the phone is missing.
Other channels offer **Copy message** using the plain-text template; mixed-channel
households distinguish **Copy WhatsApp** from **Copy plain text**. Both message
formats remain available in the sending details dialog.

The sending details dialog also offers **Preview invitation**, which opens the
link with `?preview=1` and records no visit. Ordinary invitation links record
visible visits even in a browser signed into admin. Link-preview crawlers and
background renders/prefetches do not count. First-open stays fixed; last-open
updates on visible returns and browser-history restores, with rapid duplicate
events coalesced. Temporary failures retry with a bounded budget and a ten-second
request deadline. First/last times include seconds in the wedding timezone;
tracking is a visit signal, not proof of identity or attendance.

The overview displays a live countdown to the configured ceremony, using the
wedding timezone for its wedding-day and past-date states. It preserves the
guest totals and quick actions, with no per-second screen reader announcements.
Its four response cards show invited, attending, waiting and declined guests.
A separate family-side row shows invited and attending guest totals for the
bride's side, groom's side and shared **Both families** group, with household
counts underneath. Shared households remain in their own group rather than
being counted twice; the groups reconcile to the primary ceremony totals.

## Clearing the guest list

Find this under **Wedding Details → Advanced data maintenance → Clear all guests**.
It is hidden behind a closed disclosure and requires typing `DELETE ALL GUESTS`.
The server checks the expected household count under a lock, rejecting stale
confirmations. This deletes households and their invitations, replies, reply
history, messages, opens and delivery records. Wedding events/settings and
message templates remain. A failure rolls the transaction back; an active import
cannot resume later batches after a successful clear.

No production data was cleared while implementing this feature. Database tests
run only in generated schemas in the explicitly named disposable local database.
Node 24 build/unit/integration and Chromium/WebKit workflow evidence are stored
under ignored `build/qa/channel-workflows-*` artifacts.
