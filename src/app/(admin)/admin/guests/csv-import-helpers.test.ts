import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CSV_IMPORT_BODY_LIMIT_BYTES,
  importPayloadError,
  readImportSummary,
} from './csv-import-helpers.ts';

function summary() {
  return {
    created: 1, updated: 1, skipped: 0, errors: 1, dryRun: true,
    results: [
      { row: 2, status: 'created', displayName: 'New family' },
      { row: 3, status: 'updated', displayName: 'Existing family' },
      { row: 4, status: 'error', displayName: '', message: 'Name is required.' },
    ],
  };
}

describe('CSV import response validation', () => {
  it('accepts matching per-row counts and the requested preview mode', () => {
    const result = summary();
    assert.equal(readImportSummary(result, true), result);
    assert.equal(readImportSummary(result, false), null);
  });

  it('rejects inconsistent counts, malformed rows and duplicate row numbers', () => {
    assert.equal(readImportSummary({ ...summary(), created: 9 }, true), null);
    assert.equal(readImportSummary({ ...summary(), results: [null] }, true), null);
    assert.equal(readImportSummary({ ...summary(), results: [{ row: 2, status: 'other' }] }, true), null);
    const duplicate = summary();
    duplicate.results[1]!.row = 2;
    assert.equal(readImportSummary(duplicate, true), null);
    const unsafeMessage = summary();
    Object.assign(unsafeMessage.results[2]!, { message: { detail: 'bad' } });
    assert.equal(readImportSummary(unsafeMessage, true), null);
  });

  it('counts encoded JSON bytes so escaped or multibyte text cannot bypass the limit', () => {
    assert.equal(importPayloadError({ csv: 'display_name,side\nFamily,bride', defaultEventSlugs: [], dryRun: true }), null);
    assert.match(importPayloadError({ csv: '"'.repeat(CSV_IMPORT_BODY_LIMIT_BYTES / 2), defaultEventSlugs: [], dryRun: true })!, /too large/);
    assert.match(importPayloadError({ csv: 'අ'.repeat(CSV_IMPORT_BODY_LIMIT_BYTES / 3), defaultEventSlugs: [], dryRun: true })!, /too large/);
  });
});
