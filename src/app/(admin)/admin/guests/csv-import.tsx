'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EventView } from '@/lib/services/types';
import type { ImportSummary } from '@/lib/services/import';
import { postJson } from '../_components/api';
import { Feedback } from '../_components/ui';
import { CSV_IMPORT_BODY_LIMIT_BYTES, importPayloadError, readImportSummary } from './csv-import-helpers';
const template =
  'display_name,side,max_party_size,phone,channels,notes\nThe Fernando Family,bride,4,0771234567,whatsapp,\n';
const columns = [
  ['display_name', 'Guest or family name (required)'],
  ['side', 'Family: bride, groom or both (required)'],
  ['max_party_size', 'Places reserved, from 1 to 50. Blank uses 2.'],
  ['phone', 'Phone number'],
  ['channels', 'Sending method: whatsapp, print or in_person'],
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
  const inputVersion = useRef(0);
  const pending = useRef(false);
  const fileReading = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canImport = summary?.dryRun === true && summary.created + summary.updated > 0;

  function invalidatePreview() {
    inputVersion.current += 1;
    setSummary(null);
    setError(null);
  }

  async function run(dryRun: boolean) {
    if (pending.current || fileReading.current || !csv.trim() || (!dryRun && !canImport)) return;
    pending.current = true;
    try {
      if (!dryRun && !window.confirm(
        `Import this guest list?\n\n${summary!.created} to add, ${summary!.updated} to update` +
        (summary!.errors ? `, ${summary!.errors} rows with errors will be skipped.` : '.') +
        '\n\nMatching guests will be updated. Omitted optional detail columns keep existing values; blank cells in included columns can clear or reset them. The selected celebrations may change their invitations. Sending progress and already shared invitation links will stay the same.',
      )) return;

      setSummary(null);
      setError(null);
      const body = { csv, defaultEventSlugs: defaultSlugs, dryRun };
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
          href={'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + template)}
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
            For more than one sending method or celebration, separate values with a semicolon.{' '}
            {events.length > 0 && (
              <>
                Celebrations available:{' '}
                {events.map((event) => event.name + ' (' + event.slug + ')').join(', ')}.
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            Existing households are matched by name to sort by and phone number. If the sort name is
            omitted, the guest name is used. Include the same phone number when updating; changing
            either matching value creates a new household. To change these values, edit the guest
            directly instead.
          </p>
          <p className="text-sm text-muted-foreground">
            Omitted optional detail columns keep existing values. Blank cells in included columns
            can clear notes or shorter names, reset reserved places to 2, or reset language to English.
            The celebrations selected below apply when a row has no celebrations of its own; leaving
            both empty keeps existing invitations. Sending methods are added, and sending progress
            and shared invitation links are preserved.
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
            {summary.skipped > 0 ? ', ' + summary.skipped + ' skipped' : ''}, {summary.errors}{' '}
            {summary.errors === 1 ? 'row needs' : 'rows need'} attention.
          </p>
          {summary.dryRun && (
            <p className="text-sm text-muted-foreground">
              Nothing has been saved yet. Check the rows below, then choose Import guests. Rows with
              errors will be skipped; other details are checked again when saved.
            </p>
          )}
          {summary.dryRun && summary.created + summary.updated === 0 && (
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
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">
                  {summary.dryRun ? 'Guest list preview' : 'Guest import results'}
                </caption>
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border">
                    <th scope="col" className="w-14 px-3 py-2 font-medium">Row</th>
                    <th scope="col" className="px-3 py-2 font-medium">Guest or family</th>
                    <th scope="col" className="w-32 px-3 py-2 font-medium">{summary.dryRun ? 'Planned action' : 'Result'}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.results.map((row) => (
                    <tr key={row.row} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 align-top">{row.row}</td>
                      <td className="px-3 py-2 align-top break-words">
                        {row.displayName || 'Unnamed household'}
                        {row.message && <p className={row.status === 'error' ? 'mt-1 text-destructive' : 'mt-1 text-muted-foreground'}>{row.message}</p>}
                      </td>
                      <td className={`px-3 py-2 align-top whitespace-nowrap${row.status === 'error' ? ' text-destructive' : ''}`}>
                        {row.status === 'created' ? (summary.dryRun ? 'Will add' : 'Added')
                          : row.status === 'updated' ? (summary.dryRun ? 'Will update' : 'Updated')
                            : row.status === 'error' ? 'Needs attention' : 'Skipped'}
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
