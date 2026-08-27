import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardAsset, cardAssetNames } from './card-assets.ts';

describe('cardAsset', () => {
  it('refuses an asset the manifest does not list', () => {
    // The failure mode this prevents: a typo that renders an empty frame on
    // somebody's invitation and is noticed by them, not by us.
    assert.throws(() => cardAsset('not-a-real-file.svg'), /manifest\.json/);
  });

  it('carries the version, so an immutable cache cannot serve a stale export', () => {
    const [first] = cardAssetNames();
    if (!first) return; // No artwork yet - the plumbing is what is under test.
    assert.match(cardAsset(first), /^\/card\/.+\?v=.+$/);
  });
});
