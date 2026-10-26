import { CSV_IMPORT_BODY_LIMIT_BYTES } from '../../../../lib/api/request-body.ts';
import type { ImportDecision, ImportSummary } from '../../../../lib/services/import.ts';

export { CSV_IMPORT_BODY_LIMIT_BYTES };

/** Check the encoded request, including JSON escaping, before uploading a list. */
export function importPayloadError(body: {
  csv: string;
  defaultEventSlugs: string[];
  dryRun: boolean;
  decisions?: ImportDecision[];
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

  const counts = { created: 0, updated: 0, duplicates: 0, skipped: 0, errors: 0 };
  const rowNumbers = new Set<number>();
  for (const value of candidate.results) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.row !== 'number' || !Number.isSafeInteger(row.row) || row.row < 2 ||
      rowNumbers.has(row.row) || typeof row.displayName !== 'string' ||
      (row.message !== undefined && typeof row.message !== 'string') ||
      (row.warnings !== undefined && (!Array.isArray(row.warnings) || row.warnings.some((message) => typeof message !== 'string'))) ||
      (row.status !== 'created' && row.status !== 'updated' &&
        row.status !== 'duplicate' && row.status !== 'skipped' && row.status !== 'error')
    ) return null;
    if (row.duplicate !== undefined) {
      if (!row.duplicate || typeof row.duplicate !== 'object') return null;
      const duplicate = row.duplicate as Record<string, unknown>;
      if (typeof duplicate.guestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(duplicate.guestId) ||
          typeof duplicate.updatedAt !== 'string' || !Number.isFinite(Date.parse(duplicate.updatedAt)) ||
          typeof duplicate.displayName !== 'string' || (duplicate.phone !== null && typeof duplicate.phone !== 'string')) return null;
    }
    if (row.status === 'duplicate' && !row.duplicate) return null;
    if (row.action !== undefined && !['update', 'replace', 'discard'].includes(String(row.action))) return null;
    rowNumbers.add(row.row);
    counts[row.status === 'error' ? 'errors' : row.status === 'duplicate' ? 'duplicates' : row.status] += 1;
  }
  for (const key of ['created', 'updated', 'duplicates', 'skipped', 'errors'] as const) {
    if (candidate[key] !== counts[key]) return null;
  }
  return candidate as ImportSummary;
}
