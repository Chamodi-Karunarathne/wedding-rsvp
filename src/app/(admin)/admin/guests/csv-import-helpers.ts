import { CSV_IMPORT_BODY_LIMIT_BYTES } from '../../../../lib/api/request-body.ts';
import type { ImportSummary } from '../../../../lib/services/import.ts';

export { CSV_IMPORT_BODY_LIMIT_BYTES };

/** Check the encoded request, including JSON escaping, before uploading a list. */
export function importPayloadError(body: {
  csv: string;
  defaultEventSlugs: string[];
  dryRun: boolean;
}): string | null {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength > CSV_IMPORT_BODY_LIMIT_BYTES
    ? 'This list is too large. Split it into smaller CSV files, then check each file separately.'
    : null;
}

/** A malformed response must never enable Import or crash the results view. */
export function readImportSummary(value: unknown, dryRun: boolean): ImportSummary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.dryRun !== dryRun || !Array.isArray(candidate.results)) return null;

  const counts = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const rowNumbers = new Set<number>();
  for (const value of candidate.results) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.row !== 'number' || !Number.isSafeInteger(row.row) || row.row < 2 ||
      rowNumbers.has(row.row) || typeof row.displayName !== 'string' ||
      (row.message !== undefined && typeof row.message !== 'string') ||
      (row.status !== 'created' && row.status !== 'updated' &&
        row.status !== 'skipped' && row.status !== 'error')
    ) return null;
    rowNumbers.add(row.row);
    counts[row.status === 'error' ? 'errors' : row.status] += 1;
  }
  for (const key of ['created', 'updated', 'skipped', 'errors'] as const) {
    if (candidate[key] !== counts[key]) return null;
  }
  return candidate as ImportSummary;
}
