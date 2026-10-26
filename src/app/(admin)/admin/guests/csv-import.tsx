'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EventView } from '@/lib/services/types';
import type { ImportDecision, ImportDuplicateAction, ImportSummary } from '@/lib/services/import';
import { toCsv } from '@/lib/domain/csv';
import { postJson } from '../_components/api';
import { Feedback } from '../_components/ui';
import { CSV_IMPORT_BODY_LIMIT_BYTES, importPayloadError, readImportSummary } from './csv-import-helpers';
const template = toCsv([
  ['display_name', 'display_name_fallback', 'sort_name', 'side', 'language', 'max_party_size', 'phone', 'events', 'channels', 'notes'],
  ['The Fernando Family', '', '', 'bride', 'en', 4, '0771234567,0777654321', '', 'whatsapp;print', ''],
  ['The Jayasinghe Family', '', '', 'groom', 'en', 2, '', '', 'instagram;messenger;wechat', ''],
]);
const columns = [
  ['display_name', 'Guest or family name (required)'],
  ['side', 'Family: bride, groom or both (required)'],
  ['max_party_size', 'Places reserved, from 1 to 50. New/Replace uses 2 when blank; Update keeps the current value.'],
  ['phone', 'Phone numbers separated by commas. Quote the CSV cell when it contains multiple numbers.'],
  ['channels', 'Sending methods: whatsapp, print, instagram, messenger, wechat (or legacy in_person)'],
  ['events', 'Celebration names used by the website'],
  ['display_name_fallback', 'Shorter invitation name'],
  ['sort_name', 'Name to sort by'],
  ['language', 'en for English, si for Sinhala'],
  ['notes', 'Private family notes'],
];

export function CsvImport({ events }: { events: EventView[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [defaultSlugs, setDefaultSlugs] = useState<string[]>(events.map((e) => e.slug));
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'preview' | 'import' | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, ImportDecision>>({});
  const inputVersion = useRef(0);
  const pending = useRef(false);
  const fileReading = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const duplicateRows = summary?.results.filter((row) => row.status === 'duplicate') ?? [];
  const unresolved = duplicateRows.filter((row) => !decisions[row.row] ||
    decisions[row.row]!.guestId !== row.duplicate?.guestId || decisions[row.row]!.updatedAt !== row.duplicate?.updatedAt);
  const canImport = summary?.dryRun === true && summary.created + summary.updated + duplicateRows.length > 0 && unresolved.length === 0;

  function invalidatePreview() {
    inputVersion.current += 1;
    setSummary(null);
    setDecisions({});
    setError(null);
  }

  async function run(dryRun: boolean) {
    if (pending.current || fileReading.current || !csv.trim() || (!dryRun && !canImport)) return;
    pending.current = true;
    try {
      if (!dryRun && !window.confirm(
        `Import this guest list?\n\n${summary!.created} to add, ${duplicateRows.length} duplicate decisions to apply` +
        (summary!.errors ? `, ${summary!.errors} rows with errors will be skipped.` : '.') +
        '\n\nUpdate merges nonblank details and adds sending methods/celebrations. Replace uses the CSV details and assignments, including defaults for blank or omitted fields. Discard leaves the existing guest unchanged. Shared invitation links and recorded replies are preserved.',
      )) return;

      setSummary(null);
      setError(null);
      const body = { csv, defaultEventSlugs: defaultSlugs, dryRun, decisions: Object.values(decisions) };
      const payloadError = importPayloadError(body);
      if (payloadError) {
        setError(payloadError);
        return;
      }
      setRunning(dryRun ? 'preview' : 'import');
      const version = inputVersion.current;
      const result = await postJson('/api/admin/import', body);
      if (version !== inputVersion.current) return;
      if (!result.ok) {
        setError(dryRun ? result.message
          : `${result.message} Some rows may have been saved. Check the guest list and preview the CSV again before retrying.`);
        if (!dryRun) router.refresh();
        return;
      }
      const checked = readImportSummary(result.data.summary, dryRun);
      if (!checked) {
        setError(dryRun
          ? 'The list could not be checked. Please try again.'
          : 'The website did not confirm the import results. Check the guest list before trying again.');
        if (!dryRun) router.refresh();
        return;
      }
      setSummary(checked);
      setDecisions((current) => Object.fromEntries(checked.results.flatMap((row) => {
        const choice = current[row.row];
        return row.duplicate && choice && choice.guestId === row.duplicate.guestId && choice.updatedAt === row.duplicate.updatedAt
          ? [[row.row, choice]] : [];
      })));
      if (!dryRun) router.refresh();
    } finally {
      pending.current = false;
      setRunning(null);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    invalidatePreview();
    const version = inputVersion.current;
    setCsv('');
    if (file.size > CSV_IMPORT_BODY_LIMIT_BYTES) {
      fileReading.current = false;
      setReadingFile(false);
      event.target.value = '';
      setError('This file is too large. Split it into CSV files smaller than 1 MB.');
      return;
    }
    fileReading.current = true;
    setReadingFile(true);
    try {
      const bytes = await file.arrayBuffer();
      if (version !== inputVersion.current) return;
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      setCsv(text);
      if (!text.trim()) setError('This file is empty. Add column headings and at least one guest.');
    } catch {
      if (version === inputVersion.current) {
        if (fileInput.current) fileInput.current.value = '';
        setError('This file could not be read. Try saving it as a UTF-8 CSV file again.');
      }
    } finally {
      if (version === inputVersion.current) {
        fileReading.current = false;
        setReadingFile(false);
      }
    }
  }
  return (
    <div className="space-y-5" aria-busy={running !== null || readingFile}>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={'data:text/csv;charset=utf-8,' + encodeURIComponent(template)}
          download="wedding-guest-list-template.csv"
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download a sample list
        </a>
        <span className="text-sm text-muted-foreground">Use it as a starting point in Excel.</span>
      </div>
      <details className="admin-disclosure">
        <summary>How to prepare your file</summary>
        <div className="admin-disclosure-body space-y-3">
          <p>
            Keep the column headings below. Each row is one household. Only the name and family are
            required. Save as CSV UTF-8 so Sinhala names stay readable. A file can contain up to
            1,000 households and must fit within 1 MB.
          </p>
          <dl className="space-y-2">
            {columns.map(([key, label]) => (
              <div key={key} className="grid gap-1 sm:grid-cols-[180px_1fr]">
                <dt>
                  <code className="text-xs">{key}</code>
                </dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            For more than one sending method or celebration, separate values with a semicolon.
            Multiple phones use commas inside one quoted CSV cell, as in the sample.{' '}
            {events.length > 0 && (
              <>
                Celebrations available:{' '}
                {events.map((event) => event.name + ' (' + event.slug + ')').join(', ')}.
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            Existing households are matched by sort name and normalized phone numbers. The guest
            name supplies a missing sort name. A unique same-name household also matches when a
            phone is missing or the numbers overlap. Ambiguous matches need correction in Guests.
            Every existing match asks you to Update, Replace or Discard the incoming entry.
          </p>
          <p className="text-sm text-muted-foreground">
            Update keeps blank or omitted details and adds selected celebrations/sending methods.
            Replace resets editable details and replaces assignments from this CSV; a blank allowance
            uses 2 and a blank language uses English. Neither choice changes a shared invitation
            link or deletes a recorded reply. Discard keeps the household unchanged.
          </p>
          <p className="text-sm text-muted-foreground">
            A phone is needed only for WhatsApp. A WhatsApp household without a phone is still
            registered and flagged until you add a number or change its sending method.
          </p>
        </div>
      </details>
      <div className="space-y-2">
        <Label htmlFor="csv-file">Choose your CSV file</Label>
        <Input
          id="csv-file"
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          disabled={running !== null}
        />
        {readingFile && <p role="status" className="text-sm text-muted-foreground">Reading your CSV file…</p>}
      </div>
      <details className="admin-disclosure">
        <summary>Or paste your list</summary>
        <div className="admin-disclosure-body space-y-2">
          <Label htmlFor="csv-paste">Guest list with column headings</Label>
          <Textarea
            id="csv-paste"
            rows={6}
            value={csv}
            onChange={(e) => {
              invalidatePreview();
              fileReading.current = false;
              setReadingFile(false);
              if (fileInput.current) fileInput.current.value = '';
              setCsv(e.target.value);
            }}
            disabled={running !== null}
            placeholder="Paste the CSV text here"
          />
        </div>
      </details>
      <fieldset disabled={running !== null || readingFile} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Invite these guests to</legend>
        <div className="flex flex-wrap gap-3">
          {events.map((event) => (
            <Label key={event.slug} className="admin-choice font-normal">
              <input
                type="checkbox"
                checked={defaultSlugs.includes(event.slug)}
                onChange={(e) => {
                  invalidatePreview();
                  setDefaultSlugs((prev) =>
                    e.target.checked
                      ? [...prev, event.slug]
                      : prev.filter((slug) => slug !== event.slug),
                  );
                }}
              />
              {event.name}
            </Label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Used when a row does not specify its own celebration.
        </p>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => run(true)}
          disabled={running !== null || readingFile || !csv.trim()}
        >
          {running === 'preview' ? 'Checking list…' : 'Check guest list'}
        </Button>
        <Button
          type="button"
          onClick={() => run(false)}
          disabled={running !== null || readingFile || !canImport}
        >
          {running === 'import' ? 'Importing guests…' : 'Import guests'}
        </Button>
      </div>
      <Feedback error={error} />
      {summary && (
        <div className="space-y-4">
          <p role="status" className={summary.errors > 0 ? 'admin-error' : 'admin-success'}>
            {summary.dryRun ? 'List checked: ' : 'Import complete: '}
            {summary.created} {summary.dryRun ? 'to add' : 'added'}, {summary.updated}{' '}
            {summary.dryRun ? 'to update' : 'updated'}
            {summary.duplicates > 0 ? ', ' + summary.duplicates + ' duplicates to review' : ''}
            {summary.skipped > 0 ? ', ' + summary.skipped + ' skipped' : ''}, {summary.errors}{' '}
            {summary.errors === 1 ? 'row needs' : 'rows need'} attention.
          </p>
          {summary.dryRun && (
            <p className="text-sm text-muted-foreground">
              Nothing has been saved yet. Check the rows below, then choose Import guests. Rows with
              errors will be skipped; other details and duplicate choices are checked again when saved.
            </p>
          )}
          {summary.dryRun && unresolved.length > 0 && (
            <p role="status" className="text-sm text-amber-800">
              Choose Update, Replace or Discard for all {unresolved.length} unresolved duplicates to continue.
            </p>
          )}
          {summary.dryRun && summary.duplicates > 0 && (
            <p className="text-sm text-muted-foreground">
              Update merges nonblank fields and adds assignments. Replace uses CSV defaults and
              replaces assignments. Discard keeps the existing household. Recheck the list after
              choosing an action to validate it before saving.
            </p>
          )}
          {summary.dryRun && summary.created + summary.updated + duplicateRows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              There are no valid guests to import. Correct the rows below, then check the list again.
            </p>
          )}
          {summary.results.length > 0 && (
            <div
              className="max-h-80 overflow-auto rounded-lg border border-border"
              role="region"
              aria-label={summary.dryRun ? 'Guest list preview' : 'Guest import results'}
              tabIndex={0}
            >
              <table className="w-full min-w-[38rem] text-left text-sm">
                <caption className="sr-only">
                  {summary.dryRun ? 'Guest list preview' : 'Guest import results'}
                </caption>
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border">
                    <th scope="col" className="w-14 px-3 py-2 font-medium">Row</th>
                    <th scope="col" className="px-3 py-2 font-medium">Guest or family</th>
                    <th scope="col" className="w-44 px-3 py-2 font-medium">{summary.dryRun ? 'Planned action' : 'Result'}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.results.map((row) => (
                    <tr key={row.row} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 align-top">{row.row}</td>
                      <td className="px-3 py-2 align-top break-words">
                        {row.displayName || 'Unnamed household'}
                        {row.duplicate && <p className="mt-1 text-xs text-muted-foreground">Existing: {row.duplicate.displayName}{row.duplicate.phone ? ` · ${row.duplicate.phone}` : ' · No phone'}</p>}
                        {row.message && <p className={row.status === 'error' ? 'mt-1 text-destructive' : 'mt-1 text-muted-foreground'}>{row.message}</p>}
                        {row.warnings?.map((warning) => <p key={warning} className="mt-1 text-xs text-amber-800">{warning}</p>)}
                      </td>
                      <td className={`px-3 py-2 align-top whitespace-nowrap${row.status === 'error' ? ' text-destructive' : ''}`}>
                        {summary.dryRun && row.duplicate ? (
                          <select
                            className="admin-select w-full"
                            aria-label={`Duplicate action for row ${row.row}`}
                            value={decisions[row.row]?.action ?? ''}
                            disabled={running !== null}
                            onChange={(event) => {
                              const action = event.target.value as ImportDuplicateAction | '';
                              setDecisions((current) => {
                                const next = { ...current };
                                if (!action) delete next[row.row];
                                else next[row.row] = { row: row.row, guestId: row.duplicate!.guestId, updatedAt: row.duplicate!.updatedAt, action };
                                return next;
                              });
                            }}
                          >
                            <option value="">Choose an action</option>
                            <option value="update">Update</option>
                            <option value="replace">Replace</option>
                            <option value="discard">Discard</option>
                          </select>
                        ) : row.status === 'created' ? (summary.dryRun ? 'Will add' : 'Added')
                          : row.status === 'updated' ? (row.action === 'replace' ? 'Replaced' : 'Updated')
                            : row.status === 'duplicate' ? 'Needs a decision'
                              : row.status === 'error' ? 'Needs attention' : 'Discarded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
