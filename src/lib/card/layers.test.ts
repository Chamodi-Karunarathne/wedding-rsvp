import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARD_ASPECT_RATIO,
  CARD_LAYERS,
  CARD_VIEWBOX,
  RSVP_REGION,
  RSVP_SLOT,
  layerTransform,
} from './layers.ts';

describe('card layers', () => {
  it('paints base, then florals, then text', () => {
    assert.deepEqual(
      CARD_LAYERS.map((l) => l.name),
      ['card-base', 'card-florals', 'card-text'],
    );
  });

  it('leaves the base untransformed, because it is the reference frame', () => {
    const base = CARD_LAYERS[0]!;
    assert.deepEqual({ x: base.x, y: base.y, scale: base.scale }, { x: 0, y: 0, scale: 1 });
    assert.equal(layerTransform(base), undefined, 'no transform attribute at all');
  });

  it('emits a transform for every layer that needs one', () => {
    for (const layer of CARD_LAYERS.slice(1)) {
      assert.match(layerTransform(layer) ?? '', /^translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)$/);
    }
  });

  it('keeps the text inside the card once placed', () => {
    // 302.51 x 304.04 at the declared offset must not overhang the base.
    const text = CARD_LAYERS.find((l) => l.name === 'card-text')!;
    const right = text.x + 302.51 * text.scale;
    const bottom = text.y + 304.04 * text.scale;
    assert.ok(text.x >= 0 && right <= CARD_VIEWBOX.width, `text overhangs: 0..${right}`);
    assert.ok(text.y >= 0 && bottom <= CARD_VIEWBOX.height, `text overhangs: 0..${bottom}`);
  });

  it('leaves the text horizontally centred', () => {
    const text = CARD_LAYERS.find((l) => l.name === 'card-text')!;
    const centre = text.x + (302.51 * text.scale) / 2;
    assert.ok(
      Math.abs(centre - CARD_VIEWBOX.width / 2) < 0.5,
      `text centre ${centre} vs card centre ${CARD_VIEWBOX.width / 2}`,
    );
  });
});

describe('RSVP slot', () => {
  it('is derived from the region, not written twice', () => {
    assert.equal(RSVP_SLOT.left, (RSVP_REGION.x / CARD_VIEWBOX.width) * 100);
    assert.equal(RSVP_SLOT.top, (RSVP_REGION.y / CARD_VIEWBOX.height) * 100);
  });

  it('sits inside the card', () => {
    assert.ok(RSVP_SLOT.left + RSVP_SLOT.width <= 100);
    assert.ok(RSVP_SLOT.top + RSVP_SLOT.height <= 100);
  });

  it('sits below the text block, so the two cannot overlap', () => {
    const text = CARD_LAYERS.find((l) => l.name === 'card-text')!;
    assert.ok(
      RSVP_REGION.y >= text.y + 304.04 * text.scale,
      'the RSVP region starts before the text ends',
    );
  });
});

describe('card aspect ratio', () => {
  it('matches the base viewBox, so the card reserves its space before paint', () => {
    assert.equal(CARD_ASPECT_RATIO, CARD_VIEWBOX.width / CARD_VIEWBOX.height);
    assert.ok(CARD_ASPECT_RATIO > 0.7 && CARD_ASPECT_RATIO < 0.8, 'portrait card');
  });
});
