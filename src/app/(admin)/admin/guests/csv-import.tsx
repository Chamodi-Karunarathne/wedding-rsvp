'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EventView } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { Feedback } from '../_components/ui';

type RowResult = {
  row: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  displayName: string;
  message?: string;
};
type Summary = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: RowResult[];
  dryRun: boolean;
};
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
  ['personal_note', 'A note shown to this guest'],
  ['notes', 'Private family notes'],
];

export function CsvImport({ events }: { events: EventView[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [defaultSlugs, setDefaultSlugs] = useState<string[]>(events.map((e) => e.slug));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'preview' | 'import' | null>(null);
  async function run(dryRun: boolean) {
    if (
      !dryRun &&
      !window.confirm(
        'Import this guest list?\n\nMatching guests will be updated. Their details, event invitations and sending records may change. Missing optional values can replace existing information. Already shared invitation links will stay the same.',
      )
    )
      return;
    setRunning(dryRun ? 'preview' : 'import');
    setError(null);
    const result = await postJson('/api/admin/import', {
      csv,
      defaultEventSlugs: defaultSlugs,
      dryRun,
    });
    setRunning(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const value = result.data.summary;
    if (
      !value ||
      typeof value !== 'object' ||
      !('results' in value) ||
      !Array.isArray(value.results)
    ) {
      setError('The list could not be checked. Please try again.');
      return;
    }
    setSummary(value as Summary);
    if (!dryRun) router.refresh();
  }
  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setCsv(await file.text());
      setSummary(null);
      setError(null);
    } catch {
      setError('This file could not be read. Try saving it as a CSV file again.');
    }
  }
  return (
    <div className="space-y-5">
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
            required.
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
            Existing households are matched by name to sort by and phone number. Re-importing can
            replace notes, reserved places and other details, and reset sending records. Include the
            information you want to keep.
          </p>
        </div>
      </details>
      <div className="space-y-2">
        <Label htmlFor="csv-file">Choose your CSV file</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          disabled={running !== null}
        />
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
              setCsv(e.target.value);
              setSummary(null);
            }}
            disabled={running !== null}
            placeholder="Paste the CSV text here"
          />
        </div>
      </details>
      <fieldset disabled={running !== null} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Invite these guests to</legend>
        <div className="flex flex-wrap gap-3">
          {events.map((event) => (
            <Label key={event.slug} className="admin-choice font-normal">
              <input
                type="checkbox"
                checked={defaultSlugs.includes(event.slug)}
                onChange={(e) => {
                  setDefaultSlugs((prev) =>
                    e.target.checked
                      ? [...prev, event.slug]
                      : prev.filter((slug) => slug !== event.slug),
                  );
                  setSummary(null);
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
          disabled={running !== null || !csv.trim()}
        >
          {running === 'preview' ? 'Checking list…' : 'Check guest list'}
        </Button>
        <Button
          type="button"
          onClick={() => run(false)}
          disabled={running !== null || !summary?.dryRun}
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
          {summary.results
            .filter((row) => row.status === 'error')
            .map((row) => (
              <div key={row.row} className="rounded-lg border border-border p-4">
                <strong>
                  Row {row.row}
                  {row.displayName ? ' · ' + row.displayName : ''}
                </strong>
                <p className="mt-1 text-sm text-destructive">{row.message}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
