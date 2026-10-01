import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BEATS,
  MAX_PARTICLES,
  SEQUENCE_DURATION,
  SKIP_VISIBLE_AT,
  sequenceDuration,
} from './beats.ts';

describe('the intro sequence', () => {
  it('has eleven storyboard beats including a closing dissolve', () => {
    assert.equal(BEATS.length, 11);
    assert.equal(BEATS.at(-1)?.id, 'monogram-ending');
  });

  it('has a unique id per beat, so a timeline label cannot collide', () => {
    assert.equal(new Set(BEATS.map((b) => b.id)).size, BEATS.length);
  });

  it('starts at zero and runs twenty-three seconds', () => {
    assert.equal(BEATS[0]!.start, 0);
    assert.equal(SEQUENCE_DURATION, 23);
  });

  it('holds the card until the closing monogram', () => {
    const card = BEATS.find((b) => b.id === 'card-slides-out');
    assert.ok(card, 'the card beat is the point of the sequence');
    assert.equal(card.exitAt, 20);
  });

  it('never runs a beat backwards or for no time', () => {
    for (const beat of BEATS) {
      assert.ok(beat.start >= 0, `${beat.id} starts before zero`);
      assert.ok(beat.duration > 0, `${beat.id} has no duration`);
    }
  });

  it('orders the beats, so reading the file reads the sequence', () => {
    for (let i = 1; i < BEATS.length; i += 1) {
      assert.ok(
        BEATS[i]!.start >= BEATS[i - 1]!.start,
        `${BEATS[i]!.id} starts before ${BEATS[i - 1]!.id}`,
      );
    }
  });

  it('leaves no silent gap in the middle of the sequence', () => {
    // Every beat should begin no later than the previous one ends, or the
    // sequence stalls on a blank screen.
    for (let i = 1; i < BEATS.length; i += 1) {
      const previous = BEATS[i - 1]!;
      assert.ok(
        BEATS[i]!.start <= previous.start + previous.duration,
        `gap before ${BEATS[i]!.id}`,
      );
    }
  });

  it('gives every stagger a step, and nothing else one', () => {
    for (const beat of BEATS) {
      if (beat.effect === 'stagger' || beat.effect === 'bloom') {
        assert.ok(beat.stagger && beat.stagger > 0, `${beat.id} staggers by nothing`);
      } else {
        assert.equal(beat.stagger, undefined, `${beat.id} has a pointless stagger`);
      }
    }
  });

  it('fits every text line into the beat that reveals them', () => {
    // Nine wording/name lines at 0.38s apart is 3.04s of stagger; the beat is 5s.
    const lines = BEATS.find((b) => b.id === 'text-lines')!;
    assert.ok((9 - 1) * lines.stagger! <= lines.duration, 'the last line never appears');
  });

  it('shows the skip control well before the first beat ends', () => {
    assert.ok(SKIP_VISIBLE_AT <= 1, 'a guest must be able to leave early');
    assert.equal(SKIP_VISIBLE_AT, 0.8);
  });

  it('caps the particle count', () => {
    assert.ok(MAX_PARTICLES <= 36);
  });
});

describe('sequenceDuration', () => {
  it('is the furthest end, not the last start', () => {
    assert.equal(
      sequenceDuration([
        { id: 'a', start: 0, duration: 10, target: 'x', effect: 'fade', ease: 'none' },
        { id: 'b', start: 2, duration: 1, target: 'y', effect: 'fade', ease: 'none' },
      ]),
      10,
    );
  });

  it('is zero for an empty sequence rather than throwing', () => {
    assert.equal(sequenceDuration([]), 0);
  });
});
