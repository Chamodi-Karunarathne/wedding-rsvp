import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardAssetNames } from './domain/card-assets.ts';
import { InlineSvg, readCardSvg } from './svg.ts';

/** Bare names, as InlineSvg takes them. */
const NAMES = cardAssetNames().map((file) => file.replace(/\.svg$/, ''));

describe('readCardSvg', () => {
  it('reads every asset the manifest declares', () => {
    assert.ok(NAMES.length > 0, 'manifest lists no assets');

    for (const name of NAMES) {
      const { viewBox, inner } = readCardSvg(name);
      assert.match(viewBox, /^[\d.\s-]+$/, `${name} has a malformed viewBox`);
      assert.ok(inner.length > 0, `${name} inlined as empty`);
      assert.ok(!inner.includes('<svg'), `${name} kept a nested <svg> root`);
    }
  });

  it('returns the same parse on a second read', () => {
    const first = readCardSvg('monogram');
    const second = readCardSvg('monogram');
    assert.deepEqual(first, second);
  });

  it('refuses a name the manifest does not list', () => {
    // The failure this prevents: a typo rendering an empty box on somebody's
    // invitation, noticed by them rather than by us.
    assert.throws(() => readCardSvg('not-a-real-asset'), /manifest\.json/);
  });
});

describe('InlineSvg', () => {
  it('rebuilds the root element with the file viewBox', () => {
    const element = InlineSvg({ name: 'card-base' });
    const props = element.props as Record<string, unknown>;

    assert.equal(element.type, 'svg');
    assert.equal(props.viewBox, readCardSvg('card-base').viewBox);
    assert.equal(props['aria-hidden'], true, 'card artwork is decorative by default');
    assert.equal(props.focusable, 'false');
  });

  it('fills its box rather than letterboxing, so stacked layers stay aligned', () => {
    const props = InlineSvg({ name: 'card-base' }).props as Record<string, unknown>;
    assert.equal(props.preserveAspectRatio, 'none');
  });

  it('can be made announceable when a layer is not decorative', () => {
    const props = InlineSvg({ name: 'monogram', 'aria-hidden': false }).props as Record<
      string,
      unknown
    >;
    assert.equal(props['aria-hidden'], undefined, 'false must not render aria-hidden="false"');
  });
});
