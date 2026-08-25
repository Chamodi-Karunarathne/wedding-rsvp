import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from './format.ts';

const COLOMBO = 'Asia/Colombo'; // UTC+05:30, no DST
const LONDON = 'Europe/London'; // UTC+0 / +1, has DST

describe('fromDateTimeLocalValue', () => {
  it('interprets wall time in the given zone, not the server zone', () => {
    // Midnight in Colombo is 18:30 UTC the previous day.
    const result = fromDateTimeLocalValue('2026-12-12T00:00', COLOMBO);
    assert.equal(result.toISOString(), '2026-12-11T18:30:00.000Z');
  });

  it('handles a half-hour offset correctly', () => {
    const result = fromDateTimeLocalValue('2026-12-12T09:30', COLOMBO);
    assert.equal(result.toISOString(), '2026-12-12T04:00:00.000Z');
  });

  it('respects daylight saving in zones that have it', () => {
    // British Summer Time: local 12:00 in July is 11:00 UTC.
    assert.equal(
      fromDateTimeLocalValue('2026-07-01T12:00', LONDON).toISOString(),
      '2026-07-01T11:00:00.000Z',
    );
    // Greenwich Mean Time: local 12:00 in January is 12:00 UTC.
    assert.equal(
      fromDateTimeLocalValue('2026-01-01T12:00', LONDON).toISOString(),
      '2026-01-01T12:00:00.000Z',
    );
  });

  it('accepts a value that already carries seconds', () => {
    assert.equal(
      fromDateTimeLocalValue('2026-12-12T09:30:00', COLOMBO).toISOString(),
      '2026-12-12T04:00:00.000Z',
    );
  });
});

describe('toDateTimeLocalValue', () => {
  it('renders an instant as wall time in the given zone', () => {
    assert.equal(
      toDateTimeLocalValue(new Date('2026-12-11T18:30:00.000Z'), COLOMBO),
      '2026-12-12T00:00',
    );
  });

  it('round-trips with fromDateTimeLocalValue', () => {
    for (const zone of [COLOMBO, LONDON, 'UTC', 'America/New_York']) {
      for (const iso of [
        '2026-11-01T00:00:00.000Z',
        '2026-12-12T04:00:00.000Z',
        '2026-07-04T16:45:00.000Z',
      ]) {
        const instant = new Date(iso);
        const wall = toDateTimeLocalValue(instant, zone);
        assert.equal(
          fromDateTimeLocalValue(wall, zone).toISOString(),
          iso,
          `round trip failed for ${iso} in ${zone}`,
        );
      }
    }
  });
});
