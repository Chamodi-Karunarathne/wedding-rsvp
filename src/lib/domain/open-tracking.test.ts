import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOpenTracking } from './open-tracking.ts';

type Result = { status: number; retryAfter: string | null };
const success = { status: 204, retryAfter: null };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(send: () => Promise<Result> = async () => success) {
  let now = Date.parse('2026-10-26T09:00:00Z');
  let visible = true;
  let online = true;
  let calls = 0;
  let sequence = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const tracker = createOpenTracking({
    now: () => now,
    isVisible: () => visible,
    isOnline: () => online,
    send: () => { calls += 1; return send(); },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(timer) { timers.delete(timer as number); },
  });
  return {
    tracker,
    calls: () => calls,
    timers: () => timers.size,
    visible(value: boolean) { visible = value; tracker.visibilityChanged(); },
    visibilityWithoutEvent(value: boolean) { visible = value; },
    online(value: boolean) { online = value; if (value) tracker.online(); },
    async advance(milliseconds: number) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()].sort((left, right) => left[1].at - right[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

describe('visible invitation visit tracking', () => {
  it('records the first visible visit and never records a heartbeat or an online event after success', async () => {
    const f = fixture();
    f.visible(false);
    f.tracker.start();
    await flush();
    assert.equal(f.calls(), 0);
    f.visible(true);
    await flush();
    assert.equal(f.calls(), 1);
    f.tracker.pageShown(false);
    f.tracker.visibilityChanged();
    f.online(true);
    await f.advance(600_000);
    assert.equal(f.calls(), 1);
    assert.equal(f.timers(), 0);
  });

  it('records a later return to the tab while coalescing duplicate visible/page-show events', async () => {
    const f = fixture();
    f.tracker.start();
    await flush();
    await f.advance(1_000);
    f.visible(false);
    f.visible(true);
    f.tracker.pageShown(true);
    await flush();
    assert.equal(f.calls(), 1);
    await f.advance(5_000);
    f.visible(false);
    f.visible(true);
    f.tracker.pageShown(true);
    f.tracker.visibilityChanged();
    await flush();
    assert.equal(f.calls(), 2);
    assert.equal(f.timers(), 0);
  });

  it('records a BFCache restore even when the browser did not emit visibilitychange', async () => {
    const f = fixture();
    f.tracker.start();
    await flush();
    await f.advance(10_000);
    f.tracker.pageShown(true);
    await flush();
    assert.equal(f.calls(), 2);
  });

  it('deduplicates StrictMode setup/cleanup while its initial request is in flight', async () => {
    let resolve!: (result: Result) => void;
    const f = fixture(() => new Promise<Result>(done => { resolve = done; }));
    f.tracker.start();
    await flush();
    f.tracker.stop();
    f.tracker.start();
    f.tracker.visibilityChanged();
    assert.equal(f.calls(), 1);
    resolve(success);
    await flush();
    assert.equal(f.calls(), 1);
    assert.equal(f.timers(), 0);
  });

  it('defers a hidden BFCache restore until the tab actually becomes visible', async () => {
    const f = fixture();
    f.tracker.start();
    await flush();
    await f.advance(10_000);
    f.visibilityWithoutEvent(false);
    f.tracker.pageShown(true);
    await flush();
    assert.equal(f.calls(), 1);
    f.visible(true);
    await flush();
    assert.equal(f.calls(), 2);
  });

  it('queues one later visible return behind a slow request without creating a heartbeat', async () => {
    let resolve!: (result: Result) => void;
    let attempt = 0;
    const f = fixture(() => ++attempt === 1
      ? new Promise<Result>(done => { resolve = done; }) : Promise.resolve(success));
    f.tracker.start();
    await flush();
    await f.advance(6_000);
    f.visible(false);
    f.visible(true);
    f.tracker.pageShown(true);
    f.tracker.visibilityChanged();
    assert.equal(f.calls(), 1);
    resolve(success);
    await flush();
    assert.equal(f.calls(), 2);
    await f.advance(600_000);
    f.online(true);
    assert.equal(f.calls(), 2);
    assert.equal(f.timers(), 0);
  });

  it('does not treat a delayed acknowledgement alone as a new visit', async () => {
    let resolve!: (result: Result) => void;
    const f = fixture(() => new Promise<Result>(done => { resolve = done; }));
    f.tracker.start();
    await flush();
    await f.advance(20_000);
    f.tracker.visibilityChanged();
    resolve(success);
    await flush();
    await f.advance(600_000);
    f.online(true);
    assert.equal(f.calls(), 1);
    assert.equal(f.timers(), 0);
  });

  it('retains Retry-After when a queued visible return follows a slow failure', async () => {
    let resolve!: (result: Result) => void;
    let attempt = 0;
    const f = fixture(() => ++attempt === 1
      ? new Promise<Result>(done => { resolve = done; }) : Promise.resolve(success));
    f.tracker.start();
    await flush();
    await f.advance(6_000);
    f.visible(false);
    f.visible(true);
    resolve({ status: 503, retryAfter: '30' });
    await flush();
    await f.advance(29_999);
    assert.equal(f.calls(), 1);
    await f.advance(1);
    assert.equal(f.calls(), 2);
  });

  it('discards a queued return if the tab is hidden when the earlier request succeeds', async () => {
    let resolve!: (result: Result) => void;
    const f = fixture(() => new Promise<Result>(done => { resolve = done; }));
    f.tracker.start();
    await flush();
    await f.advance(6_000);
    f.visible(false);
    f.visible(true);
    f.visible(false);
    resolve(success);
    await flush();
    assert.equal(f.calls(), 1);
    assert.equal(f.timers(), 0);
  });

  it('recovers from network and storage failures with bounded backoff', async () => {
    let attempt = 0;
    const f = fixture(async () => {
      if (++attempt === 1) throw new Error('offline');
      return attempt === 2 ? { status: 503, retryAfter: null } : success;
    });
    f.tracker.start();
    await flush();
    assert.equal(f.calls(), 1);
    await f.advance(999);
    assert.equal(f.calls(), 1);
    await f.advance(1);
    assert.equal(f.calls(), 2);
    await f.advance(4_999);
    assert.equal(f.calls(), 2);
    await f.advance(1);
    assert.equal(f.calls(), 3);
    assert.equal(f.timers(), 0);
  });

  it('stops after three failed attempts rather than polling an unavailable service', async () => {
    const f = fixture(async () => { throw new Error('unavailable'); });
    f.tracker.start();
    await flush();
    await f.advance(600_000);
    f.online(true);
    await flush();
    assert.equal(f.calls(), 3);
    assert.equal(f.timers(), 0);
  });

  it('honors numeric Retry-After through hide/show and online events', async () => {
    let attempt = 0;
    const f = fixture(async () => ++attempt === 1 ? { status: 429, retryAfter: '30' } : success);
    f.tracker.start();
    await flush();
    await f.advance(5_000);
    f.visible(false);
    f.visible(true);
    f.online(true);
    await f.advance(24_999);
    assert.equal(f.calls(), 1);
    await f.advance(1);
    assert.equal(f.calls(), 2);
  });

  it('honors HTTP-date Retry-After and caps a retry delay at five minutes', async () => {
    let attempt = 0;
    const f = fixture(async () => ++attempt === 1
      ? { status: 503, retryAfter: 'Mon, 26 Oct 2026 09:00:10 GMT' }
      : attempt === 2 ? { status: 503, retryAfter: '999999' } : success);
    f.tracker.start();
    await flush();
    await f.advance(9_999);
    assert.equal(f.calls(), 1);
    await f.advance(1);
    assert.equal(f.calls(), 2);
    await f.advance(299_999);
    assert.equal(f.calls(), 2);
    await f.advance(1);
    assert.equal(f.calls(), 3);
  });

  it('does not retry permanent request failures', async () => {
    for (const status of [400, 401, 403, 404, 408, 422]) {
      const f = fixture(async () => ({ status, retryAfter: null }));
      f.tracker.start();
      await flush();
      f.online(true);
      await f.advance(600_000);
      assert.equal(f.calls(), 1);
      assert.equal(f.timers(), 0);
    }
  });

  it('waits for connectivity and pauses failed visits while hidden', async () => {
    let attempt = 0;
    const f = fixture(async () => ++attempt === 1 ? { status: 503, retryAfter: null } : success);
    f.online(false);
    f.tracker.start();
    await flush();
    assert.equal(f.calls(), 0);
    f.online(true);
    await flush();
    assert.equal(f.calls(), 1);
    f.visible(false);
    assert.equal(f.timers(), 0);
    await f.advance(20_000);
    assert.equal(f.calls(), 1);
    f.visible(true);
    await flush();
    assert.equal(f.calls(), 2);
  });

  it('cleans up retry timers and suppresses work after unmount, including late failures', async () => {
    const f = fixture(async () => ({ status: 503, retryAfter: null }));
    f.tracker.start();
    await flush();
    assert.equal(f.timers(), 1);
    f.tracker.stop();
    assert.equal(f.timers(), 0);
    await f.advance(600_000);
    f.tracker.online();
    f.tracker.pageShown(true);
    assert.equal(f.calls(), 1);
    let reject!: (error: Error) => void;
    const late = fixture(() => new Promise<Result>((_, fail) => { reject = fail; }));
    late.tracker.start();
    await flush();
    late.tracker.stop();
    reject(new Error('late network failure'));
    await flush();
    assert.equal(late.timers(), 0);
    assert.equal(late.calls(), 1);
  });
});
