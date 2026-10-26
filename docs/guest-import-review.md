# Guest import review

Updated 26 October 2026, Asia/Colombo. This review covers the admin file picker and paste
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
- Re-imports now require a per-household Update, Replace or Discard decision.
  Update preserves blank/absent detail values and merges assignments; Replace
  applies CSV defaults and replaces assignments. Shared links and recorded
  replies remain protected. Unresolved duplicates never overwrite existing data.
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
  enabling Import. A failed save refreshes the guest list and explains that a
  dropped connection can leave the final commit outcome unconfirmed.
- The Guests download was an RSVP report with status-decorated channels, which
  could not be imported unchanged. `/api/admin/export/guests` now supplies all
  editable guest columns, plain channel names and event slugs. The existing RSVP
  and sending report exports retain their formats.

## Expected behavior

Matching uses normalized `sort_name` and phone sets, including overlapping or
missing numbers for a unique household name. If `sort_name` is absent or blank,
the display name supplies it. Ambiguous matches and two CSV rows targeting the
same household are rejected. Decisions include the previewed guest ID and update
time; changed records require another preview.

New households use English, two places and null optional text by default.
Update merges nonblank details, phone sets, events and channels into the existing
household. Replace applies CSV details/defaults and replaces channel/event
assignments while retaining metadata on channels that remain assigned. Discard
does not alter the existing record. Both save modes preserve token and response
history and reject allowance changes below recorded attendance or removal of an
event with a reply. A row's explicit events override the default checkboxes.

Phone cells support quoted comma-separated numbers. Each is normalized and
deduplicated individually. Channels accept WhatsApp, print, Instagram, Messenger,
WeChat and legacy in_person values. Phone-free social guests are valid. Missing
WhatsApp numbers produce warnings, not rejected registrations; the warning is
derived from current channel/phone data and clears automatically when repaired.

Structural file errors reject the complete file. Row errors skip only invalid
households. The result reports actual creates, updates and errors; a preview
shows the same checks without saving. The save repeats database checks because
guest details and replies may have changed after preview. One outer transaction
and a shared advisory lock cover the full apply operation; batches use savepoints.
Infrastructure errors roll the whole import back, while row data errors allow
other valid rows to commit. Clear All cannot interleave between import batches.

The API requires admin authentication, same-site browser origins, valid JSON and
a maximum streamed body of 1 MiB. The UI checks encoded JSON bytes as well as raw
file size, since JSON quoting and multibyte text can increase payload size. Save
spreadsheets as **CSV UTF-8**; semicolons or pipes separate multiple values inside
the `events` and `channels` cells. Commas inside a phone/channel cell require CSV
quoting. The downloadable sample includes all supported columns and both a
multi-number household and a phone-free social household.

## Verification

Domain/parser and UI response-contract tests cover malformed input, Unicode,
physical row numbers, byte limits and invalid summaries. Real PostgreSQL tests
cover idempotency, ambiguous and concurrent imports, response races, preserving
tokens/data, explicit resets, rollback after SQL failures and 1,000-row imports.
The import integration script is included in `pnpm test:integration` and refuses
normal DATABASE_URL/.env or non-local databases.

The production build, TypeScript, 241 unit tests and all 58 PostgreSQL integration
tests passed (one opt-in integration is skipped by the ordinary unit command).
Chromium and WebKit both passed the actual file upload, read-only preview,
partial save, RSVP conflict, normalized re-import, failed recheck, duplicate
submit, invalid UTF-8 and delayed file-read race flows at a mobile viewport.
Infrastructure and malformed/cross-origin/oversized API requests were checked
against the local server. WebKit ran on Windows rather than a physical iPhone.

Results and screenshots are recorded in ignored `build/qa/import-review-*`,
`import-messaging-build.log`, `import-messaging-unit.log` and
`import-messaging-integration.log` artifacts.

The channel/dialog follow-up also passed Chromium and WebKit checks for all five
requested channels, quoted multiple phones, duplicate choices, both warning
repair paths, separate message templates, compact tables and guarded clearing.
Current Node 24 build/test logs, results and screenshots are under
`build/qa/channel-workflows-*`.
