'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
    <div className="space-y-3 border p-3 text-sm">
      <p>
        Columns: <code>display_name</code> (required), <code>side</code> (bride|groom|both,
        required), <code>display_name_fallback</code>, <code>sort_name</code>,{' '}
        <code>language</code>, <code>max_party_size</code>, <code>phone</code>,{' '}
        <code>personal_note</code>, <code>notes</code>, <code>events</code>,{' '}
        <code>channels</code>. Use <code>;</code> or <code>|</code> to separate multiple events
        or channels.
      </p>
      <p className="text-gray-600">
        Matching is on sort name plus phone, both normalized. Re-importing the same file updates
        those guests rather than duplicating them, and never regenerates a token or short code -
        so a card already at the printer stays valid.
      </p>

      <input type="file" accept=".csv,text/csv" onChange={onFile} />

      <textarea
        rows={6}
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setSummary(null);
        }}
        placeholder="...or paste CSV here"
        className="w-full border px-2 py-1 font-mono text-xs"
      />

      <fieldset className="border p-2">
        <legend>Invite imported guests to (when the row has no events column)</legend>
        {events.map((event) => (
          <label key={event.slug} className="mr-4">
            <input
              type="checkbox"
              checked={defaultSlugs.includes(event.slug)}
              onChange={(e) =>
                setDefaultSlugs((prev) =>
                  e.target.checked
                    ? [...prev, event.slug]
                    : prev.filter((slug) => slug !== event.slug),
                )
              }
            />{' '}
            {event.name}
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy || csv.trim() === ''}
          className="border px-3 py-1 disabled:opacity-50"
        >
          Preview (no writes)
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy || csv.trim() === ''}
          className="border px-3 py-1 font-medium disabled:opacity-50"
        >
          {busy ? 'Importing...' : 'Import'}
        </button>
      </div>

      {error && <p className="text-red-700">{error}</p>}

      {summary && (
        <div>
          <p className="font-medium">
            {summary.dryRun ? 'Preview: ' : 'Done: '}
            {summary.created} created, {summary.updated} updated, {summary.errors} failed.
          </p>
          {summary.errors > 0 && (
            <table className="mt-2 border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border px-2 py-1 text-left">Row</th>
                  <th className="border px-2 py-1 text-left">Name</th>
                  <th className="border px-2 py-1 text-left">Problem</th>
                </tr>
              </thead>
              <tbody>
                {summary.results
                  .filter((row) => row.status === 'error')
                  .map((row) => (
                    <tr key={row.row}>
                      <td className="border px-2 py-1">{row.row}</td>
                      <td className="border px-2 py-1">{row.displayName || '(blank)'}</td>
                      <td className="border px-2 py-1 text-red-700">{row.message}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
