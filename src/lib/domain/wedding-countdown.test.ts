import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countdownParts, weddingDayState } from './wedding-countdown.ts';

describe('wedding countdown', () => {
  const ceremony = Date.parse('2026-12-03T03:45:00Z');

  it('splits the remaining duration across day and clock boundaries', () => {
    const duration = (3 * 86400 + 4 * 3600 + 5 * 60 + 6) * 1000;
    assert.deepEqual(countdownParts(ceremony, ceremony - duration), {
      totalSeconds: duration / 1000, days: 3, hours: 4, minutes: 5, seconds: 6,
    });
  });

  it('keeps the final second until the ceremony and never displays negative time', () => {
    assert.equal(countdownParts(ceremony, ceremony - 1).seconds, 1);
    for (const now of [ceremony, ceremony + 1000, ceremony + 86400000]) {
      assert.deepEqual(countdownParts(ceremony, now), { totalSeconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
    }
  });

  it('uses the configured wedding calendar day rather than the browser or UTC day', () => {
    const now = Date.parse('2026-12-02T20:00:00Z');
    assert.equal(weddingDayState(ceremony, now, 'Asia/Colombo'), 'today');
    assert.equal(weddingDayState(ceremony, now, 'UTC'), 'upcoming');
  });

  it('celebrates the rest of the wedding day after the ceremony, then marks it past', () => {
    assert.equal(weddingDayState(ceremony, ceremony, 'Asia/Colombo'), 'today');
    assert.equal(weddingDayState(ceremony, Date.parse('2026-12-03T17:00:00Z'), 'Asia/Colombo'), 'today');
    assert.equal(weddingDayState(ceremony, Date.parse('2026-12-03T19:00:00Z'), 'Asia/Colombo'), 'celebrated');
  });
});
