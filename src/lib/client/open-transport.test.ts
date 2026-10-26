import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { sendOpenRequest } from './open-transport.ts';

describe('optional invitation open transport', () => {
  it('aborts a stalled fetch so later visits are not blocked forever', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchTransport: typeof fetch = async (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
    };
    await assert.rejects(sendOpenRequest('test-only-token', { fetchTransport, timeoutMs: 5 }), { name: 'AbortError' });
    assert.equal(signal!.aborted, true);
  });

  it('uses the visible-visit request contract and clears its deadline after success', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchTransport: typeof fetch = async (url, options) => {
      assert.equal(url, '/api/open');
      assert.equal(options?.method, 'POST');
      assert.equal(options?.keepalive, true);
      assert.equal(options?.credentials, 'same-origin');
      assert.deepEqual(JSON.parse(options?.body as string), { token: 'test-only-token' });
      signal = options?.signal;
      return new Response(null, { status: 503, headers: { 'retry-after': '30' } });
    };
    assert.deepEqual(await sendOpenRequest('test-only-token', { fetchTransport, timeoutMs: 5 }), { status: 503, retryAfter: '30' });
    await delay(15);
    assert.equal(signal!.aborted, false);
  });

  it('clears its deadline when the transport fails before timeout', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchTransport: typeof fetch = async (_url, options) => {
      signal = options?.signal;
      throw new Error('network unavailable');
    };
    await assert.rejects(sendOpenRequest('test-only-token', { fetchTransport, timeoutMs: 5 }), /network unavailable/);
    await delay(15);
    assert.equal(signal!.aborted, false);
  });
});
