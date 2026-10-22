import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { DbLike } from './client.ts';
import { resetTestData } from './prepare-service.ts';

describe('production preparation safety guards', () => {
  it('refuses a reset before any database operation unless confirmation is explicitly true', async () => {
    let transactions = 0;
    const database = {
      transaction() {
        transactions += 1;
        throw new Error('Database access must not occur before confirmation.');
      },
    } as unknown as DbLike;
    await assert.rejects(resetTestData(database), /explicit confirmation/);
    await assert.rejects(resetTestData(database, { confirmTestData: false }), /explicit confirmation/);
    assert.equal(transactions, 0);
  });

  it('the CLI rejects an unconfirmed reset without using or printing a connection URL', () => {
    const sentinel = 'postgresql://do-not-connect:do-not-print@invalid.example.invalid/private';
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'prepare.ts'), 'reset-test-data'], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: sentinel }, timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Reset refused.*--confirm-test-data/);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes(sentinel));
  });

  it('the CLI rejects unexpected flags instead of starting a destructive or ambiguous command', () => {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'prepare.ts'), 'prepare', '--confirm-test-data'], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'invalid-do-not-connect' }, timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use: prepare.ts/);
    assert.equal(result.stdout, '');
  });
});
