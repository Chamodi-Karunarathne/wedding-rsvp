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
  /*
   * Ten, not the storyboard's eleven.
   *
   * The eleventh was the closing monogram - "we look forward to celebrating
   * with you" - which the boards place at the end of a film. In a sequence
   * that hands somebody an invitation to read and answer, it landed three
   * seconds after the card arrived, took the card away with it, and then gave
   * the card back. A farewell belongs at the end of the exchange, so it moved
   * to the panel that replaces the card once a guest has actually replied.
   */
  it('is ten beats and ends on the card, not on a farewell', () => {
    assert.equal(BEATS.length, 10);
    assert.ok(
      !BEATS.some((b) => b.id === 'monogram-ending'),
      'the closing monogram belongs after the reply, not inside the sequence',
    );
  });

  it('has a unique id per beat, so a timeline label cannot collide', () => {
    assert.equal(new Set(BEATS.map((b) => b.id)).size, BEATS.length);
  });

  it('starts at zero and runs about twenty seconds', () => {
    assert.equal(BEATS[0]!.start, 0);
    assert.equal(SEQUENCE_DURATION, 20);
  });

  it('leaves the card on screen once it is out of the envelope', () => {
    const card = BEATS.find((b) => b.id === 'card-slides-out');
    assert.ok(card, 'the card beat is the point of the sequence');
    assert.equal(card.exitAt, undefined, 'the card must not be faded away again');
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
    // 12 line groups at 0.38s apart is 4.18s of stagger; the beat is 5s.
    const lines = BEATS.find((b) => b.id === 'text-lines')!;
    assert.ok((12 - 1) * lines.stagger! <= lines.duration, 'the last line never appears');
  });

  it('shows the skip control well before the first beat ends', () => {
    assert.ok(SKIP_VISIBLE_AT <= 1, 'a guest must be able to leave early');
    assert.equal(SKIP_VISIBLE_AT, 0.8);
  });

  it('caps the particle count', () => {
    assert.equal(MAX_PARTICLES, 120);
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
