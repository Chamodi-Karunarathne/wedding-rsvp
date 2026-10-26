import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './service-test-support.ts';
import type { DbLike } from '@/db/client';

const { importGuestsCsv } = await import('./import.ts');

describe('CSV import validation before writes', () => {
  const unavailableDb = new Proxy({}, { get() { throw new Error('Database must not be accessed.'); } }) as DbLike;

  it('rejects missing required headers, empty/header-only files and overlapping aliases before database access', async () => {
    for (const csv of ['', 'display_name,side', 'name,side\nPerson,bride', 'display_name,display name,side\nA,B,bride']) {
      const result = await importGuestsCsv(csv, {}, unavailableDb);
      assert.equal(result.ok, false, csv);
      if (!result.ok) assert.equal(result.error.field, 'csv');
    }
  });

  it('rejects malformed quotes and overflowing rows before database access', async () => {
    for (const csv of ['display_name,side\n"Unclosed,bride', 'display_name,side\nPerson,bride,extra']) {
      const result = await importGuestsCsv(csv, {}, unavailableDb);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.field, 'csv');
    }
  });

  it('rejects more than 1000 guest rows before database access', async () => {
    const csv = 'display_name,side\n' + Array.from({ length: 1001 }, (_, i) => `Guest ${i},bride`).join('\n');
    const result = await importGuestsCsv(csv, {}, unavailableDb);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /1000/);
  });

  const readOnlyDb = {
    select() { return { from() { return { orderBy() { return Promise.resolve([]); } }; } }; },
    transaction() { throw new Error('Invalid rows must not start a write transaction.'); },
  } as unknown as DbLike;

  it('enforces the same text lengths as manual guest entry for preview and save', async () => {
    for (const [column, length] of [['display_name', 301], ['sort_name', 301], ['display_name_fallback', 301], ['phone', 501], ['notes', 4001]] as const) {
      const header = column === 'display_name' ? 'display_name,side' : `display_name,side,${column}`;
      const line = column === 'display_name' ? `${'A'.repeat(length)},bride` : `Person,bride,${'1'.repeat(length)}`;
      for (const dryRun of [true, false]) {
        const result = await importGuestsCsv(`${header}\n${line}`, { dryRun }, readOnlyDb);
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.data.errors, 1, column);
          assert.equal(result.data.created, 0);
        }
      }
    }
  });

  it('rejects non-phone placeholders, spreadsheet exponent notation and invalid party counts', async () => {
    for (const csv of [
      'display_name,side,phone\nPerson,bride,N/A',
      'display_name,side,phone\nPerson,bride,7.71E+08',
      'display_name,side,phone\nPerson,bride,77+1234567',
      'display_name,side,max_party_size\nPerson,bride,1e1',
      'display_name,side,max_party_size\nPerson,bride,0x10',
      'display_name,side,max_party_size\nPerson,bride,1.5',
    ]) {
      const result = await importGuestsCsv(csv, {}, readOnlyDb);
      assert.equal(result.ok && result.data.errors, 1, csv);
    }
  });

  it('reports actual CSV line numbers after blank lines and multiline fields', async () => {
    const result = await importGuestsCsv('display_name,side,notes\n\n"Long\nName",invalid,notes\nLast,invalid,', {}, readOnlyDb);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data.results.map((row) => row.row), [3, 5]);
  });
});
