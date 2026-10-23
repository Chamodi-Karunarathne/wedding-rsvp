# Guest import review

23 October 2026, Asia/Colombo. This review covers the admin file picker and paste
input, API boundary, CSV parsing, preview, matching, database writes and exports.
Testing uses an explicitly guarded disposable loopback PostgreSQL database;
production guest data is not used for write tests.

## Fixed issues

- Broken quotes, duplicate or unnamed headers and extra cells could silently
  change or discard data. They now reject the entire file with a useful location
  before writes. CR-only files, empty quoted cells, BOM, Sinhala and multiline
  text are preserved. Error rows use physical file line numbers.
- Missing required headers and duplicate aliases such as `display_name` plus
  `display name` now reject the file. Guest field lengths use the same input
  schema as manual entry. Invalid phone placeholders and spreadsheet exponent
  notation are rejected rather than silently converted into a different number.
- Multiple existing households with the same normalized matching key could
  cause an arbitrary household to be overwritten. Ambiguous matches now require
  correction in Guests. Concurrent imports refresh matching data after acquiring
  a database advisory lock, avoiding duplicate creates from overlapping uploads.
- A minimal re-import could erase optional details. Absent optional detail
  columns now preserve stored values; deliberately blank columns retain their
  documented clearing/default behavior. Tokens, existing answers, guest messages,
  open tracking and sending history are retained.
- The old implementation made many sequential SQL calls per household. Batches
  of 25 use bulk writes with locked shared response validation. A row constraint
  failure rolls its batch back before retrying rows individually, preserving
  partial import behavior without half-written households. Infrastructure errors
  stop processing and return a redacted JSON error rather than retrying every row.
- Late file reads could overwrite a replacement file or pasted list. Reads are
  generation-checked, previews invalidated immediately, invalid UTF-8 rejected,
  and file/request byte limits checked before upload. A failed preview or changed
  input cannot authorize an import. Imports with no valid rows are disabled.
- Preview previously hid successful planned actions. It now lists every planned
  add, update and error, including row numbers, in a compact scrollable table.
  Duplicate submissions are blocked and unexpected responses are checked before
  enabling Import. A failed save refreshes the guest list and explains that some
  earlier batches may already have saved.
- The Guests download was an RSVP report with status-decorated channels, which
  could not be imported unchanged. `/api/admin/export/guests` now supplies all
  editable guest columns, plain channel names and event slugs. The existing RSVP
  and sending report exports retain their formats.

## Expected behavior

Matching uses normalized `sort_name` and phone together. If `sort_name` is absent
or blank, the display name supplies it. Include the household's existing phone
when updating a household that has one. Editing either matching value can make a
row a new household; change identity fields in the guest editor instead.

For a new household, blank optional values use defaults: English, two reserved
places, and null optional text. For existing households, an absent fallback,
language, allowance or notes column preserves that field. A present blank
fallback/notes clears it; a blank language/allowance resets it to English/two.

An explicit event list overrides the checkboxes; otherwise selected defaults
apply. With no events specified or selected, an existing household's invitations
remain unchanged and a new household receives no event invitations. Channels are
additive and do not remove existing delivery channels or reset sent dates/status.
The importer rejects allowance changes below recorded attendance and removal of
an event with a recorded reply, using the same validation as manual edits.

Structural file errors reject the complete file. Row errors skip only invalid
households. The result reports actual creates, updates and errors; a preview
shows the same checks without saving. The save repeats database checks because
guest details and replies may have changed after preview. Completed batches can
remain saved if a later infrastructure failure interrupts an import; recheck the
file before retrying and matching prevents duplicate households.

The API requires admin authentication, same-site browser origins, valid JSON and
a maximum streamed body of 1 MiB. The UI checks encoded JSON bytes as well as raw
file size, since JSON quoting and multibyte text can increase payload size. Save
spreadsheets as **CSV UTF-8**; semicolons or pipes separate multiple values inside
the `events` and `channels` cells, while commas separate CSV columns.

## Verification

Domain/parser and UI response-contract tests cover malformed input, Unicode,
physical row numbers, byte limits and invalid summaries. Real PostgreSQL tests
cover idempotency, ambiguous and concurrent imports, response races, preserving
tokens/data, explicit resets, rollback after SQL failures and 1,000-row imports.
The import integration script is included in `pnpm test:integration` and refuses
normal DATABASE_URL/.env or non-local databases.

The production build, TypeScript, 231 unit tests and all 37 PostgreSQL integration
tests passed (one opt-in integration is skipped by the ordinary unit command).
Chromium and WebKit both passed the actual file upload, read-only preview,
partial save, RSVP conflict, normalized re-import, failed recheck, duplicate
submit, invalid UTF-8 and delayed file-read race flows at a mobile viewport.
Infrastructure and malformed/cross-origin/oversized API requests were checked
against the local server. WebKit ran on Windows rather than a physical iPhone.

Results and screenshots are recorded in ignored `build/qa/import-review-*`,
`import-messaging-build.log`, `import-messaging-unit.log` and
`import-messaging-integration.log` artifacts.
