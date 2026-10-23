# WhatsApp emoji and phone check

23 October 2026, Asia/Colombo. The template, personalized message and
`encodeURIComponent` output preserved the original Unicode correctly. The
corruption was reproduced in the external `wa.me` HTTP redirect rather than in
the stored template or this application's encoder.

Using a reserved fictional phone number and synthetic text containing emoji,
a ZWJ sequence, Sinhala and `+ & ?`, `wa.me` returned HTTP 302 with emoji replaced
by U+FFFD (`%EF%BF%BD`) in the destination query. The same encoded text supplied
directly to `https://api.whatsapp.com/send` returned handoff links whose decoded
text exactly matched the original. Desktop, Android and iPhone user-agent probes
all preserved the native-app handoff; desktop WhatsApp Web links did too.

The application now bypasses that shortener and builds the direct endpoint URL
with the message encoded once. There is no browser-specific text transformation.
The actual rendered Invitations anchor was checked against an emoji-containing
template in the disposable local database; its text query matched exactly.
No messages were sent and no real phone number or template was sent to WhatsApp
during the synthetic external probe. This verifies the URL/handoff path rather
than a signed-in WhatsApp editor or delivery to another person.

WhatsApp's [click-to-chat guidance](https://faq.whatsapp.com/5913398998672934)
describes full international phone digits and URL-encoded prefilled text. The
shortener issue above is a measured observation, not a claim from that guidance.

Guest creation, updates and CSV imports now persist canonical phone numbers.
For example `077 123 4567`, `771234567`, `94771234567`, `0094771234567` and
`+94 77 123 4567` become `+94771234567`. Omitted phone patches preserve the current
number; an explicit empty/null value clears it. Existing saved local numbers are
also normalized when generating a WhatsApp URL, so their links work without a
database backfill. International numbers retain their country codes.

Unit tests cover normalized inputs and message round trips with emoji modifiers,
ZWJ sequences, Sinhala, line breaks, literal query punctuation and invitation
URLs. Actual local API and guest-editor checks confirm canonical storage.
Evidence is in ignored `build/qa/whatsapp-redirect-results.json` and
`build/qa/messaging-preview-results.json`.
