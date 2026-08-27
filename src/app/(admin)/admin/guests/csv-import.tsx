'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { EventView } from '@/lib/services/types';
import { postJson } from '../_components/api';

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

const COLUMNS = [
  'display_name',
  'side',
  'display_name_fallback',
  'sort_name',
  'language',
  'max_party_size',
  'phone',
  'personal_note',
  'notes',
  'events',
  'channels',
];

export function CsvImport({ events }: { events: EventView[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [defaultSlugs, setDefaultSlugs] = useState<string[]>(events.map((e) => e.slug));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);

    const result = await postJson('/api/admin/import', {
      csv,
      defaultEventSlugs: defaultSlugs,
      dryRun,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSummary(result.data.summary as Summary);
    if (!dryRun) router.refresh();
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Read as text so the BOM Excel writes is handled by the parser, not here.
    setCsv(await file.text());
    setSummary(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Columns:</span>
          {COLUMNS.map((column) => (
            <code
              key={column}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {column}
            </code>
          ))}
        </p>
        <p className="text-muted-foreground">
          Only <code className="font-mono text-xs">display_name</code> and{' '}
          <code className="font-mono text-xs">side</code> are required. Use{' '}
          <code className="font-mono text-xs">;</code> or{' '}
          <code className="font-mono text-xs">|</code> to separate multiple events or channels.
          Matching is on sort name plus phone, both normalized, and a re-import never regenerates
          a token &mdash; so a link already sent stays valid.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="csv-file">Upload a file</Label>
        <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} />
      </div>

      <Textarea
        rows={6}
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setSummary(null);
        }}
        placeholder="...or paste CSV here"
        className="font-mono text-xs"
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Invite imported guests to (when the row has no events column)
        </legend>
        <div className="flex flex-wrap gap-4">
          {events.map((event) => (
            <Label key={event.slug} className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={defaultSlugs.includes(event.slug)}
                onChange={(e) =>
                  setDefaultSlugs((prev) =>
                    e.target.checked
                      ? [...prev, event.slug]
                      : prev.filter((slug) => slug !== event.slug),
                  )
                }
              />
              {event.name}
            </Label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => run(true)}
          disabled={busy || csv.trim() === ''}
        >
          Preview (no writes)
        </Button>
        <Button type="button" onClick={() => run(false)} disabled={busy || csv.trim() === ''}>
          {busy ? 'Importing...' : 'Import'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="space-y-3">
          <Alert variant={summary.errors > 0 ? 'destructive' : 'default'}>
            <AlertDescription>
              {summary.dryRun ? 'Preview: ' : 'Done: '}
              {summary.created} created, {summary.updated} updated, {summary.errors} failed.
            </AlertDescription>
          </Alert>

          {summary.errors > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.results
                    .filter((row) => row.status === 'error')
                    .map((row) => (
                      <TableRow key={row.row}>
                        <TableCell className="tabular-nums">{row.row}</TableCell>
                        <TableCell>{row.displayName || '(blank)'}</TableCell>
                        <TableCell className="text-destructive">{row.message}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
