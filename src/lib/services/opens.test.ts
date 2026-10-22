import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './service-test-support.ts';
import type { DbLike } from '@/db/client';

const { recordOpenByToken } = await import('./opens.ts');

const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

describe('invitation open exclusions', () => {
  it('never touches storage for explicit previews, messaging crawlers, or missing browser identity', async () => {
    const forbiddenDb = {
      execute() { assert.fail('Preview/crawler requests must not query the database.'); },
    } as unknown as DbLike;
    for (const context of [
      { userAgent: safari, preview: true },
      { userAgent: 'WhatsApp/2.24.0' },
      { userAgent: 'facebookexternalhit/1.1' },
      { userAgent: 'TelegramBot (like TwitterBot)' },
      { userAgent: undefined },
      { userAgent: null },
    ]) {
      await recordOpenByToken('test-token', context, forbiddenDb);
    }
  });

  it('does not construct a default database connection for an ignored preview', async () => {
    // The unit runner deliberately has no DATABASE_URL or configured connection.
    await recordOpenByToken('test-token', { userAgent: safari, preview: true });
  });
});
