# Guest delivery and admin workflows

26 October 2026, Asia/Colombo.

Apply migration `0005_add_social_delivery_channels` with `pnpm db:migrate` before
deploying the new channels. It widens one CHECK constraint without deleting
guests or existing delivery records. The legacy `in_person` value remains valid.

## Channels, contacts and messages

Channels are `whatsapp`, `print`, `instagram`, `messenger`, `wechat` and legacy
`in_person`. Guest creation/editing can select channels in the same transaction
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

Guests uses eight columns, Invitations seven and Responses eleven. The wider admin
layout and separate phone/channel/reply/action columns keep rows compact.
Mobile tables scroll within their own container rather than stacking every
field into tall rows. Long names are clamped with full details in the editor;
phone cells show two numbers with a count for additional contacts.

The Invitations table combines sending controls under **Invitation**. A selected
WhatsApp channel shows direct sending, WhatsApp message copying and, for several
contacts, a number selector. Copying also works when the phone is missing.
Other channels offer **Copy message** using the plain-text template; mixed-channel
households distinguish **Copy WhatsApp** from **Copy plain text**. Both message
formats remain available in the sending details dialog.

The overview displays a live countdown to the configured ceremony, using the
wedding timezone for its wedding-day and past-date states. It preserves the
guest totals and quick actions, with no per-second screen reader announcements.

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
