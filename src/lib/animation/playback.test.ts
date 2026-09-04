import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_CORES,
  MIN_MEMORY_GB,
  isLowEnd,
  seenStorageKey,
  shouldPlayIntro,
  type PlaybackContext,
} from './playback.ts';

const FRESH: PlaybackContext = {
  reducedMotion: false,
  noanim: false,
  alreadySeen: false,
  replayRequested: false,
};

describe('shouldPlayIntro', () => {
  it('plays for a first visit on a capable device', () => {
    assert.deepEqual(shouldPlayIntro(FRESH), { play: true, reason: 'play' });
  });

  it('never plays with ?noanim=1, whatever else is true', () => {
    // This is the link we send someone who reported trouble. It has to win.
    const decision = shouldPlayIntro({ ...FRESH, noanim: true, replayRequested: true });
    assert.deepEqual(decision, { play: false, reason: 'noanim-param' });
  });

  it('never plays under prefers-reduced-motion', () => {
    assert.deepEqual(shouldPlayIntro({ ...FRESH, reducedMotion: true }), {
      play: false,
      reason: 'reduced-motion',
    });
  });

  it('keeps reduced-motion winning over a replay press', () => {
    // A replay press is far likelier to be a mis-tap than a request to
    // override an accessibility setting on the guest's own device.
    const decision = shouldPlayIntro({ ...FRESH, reducedMotion: true, replayRequested: true });
    assert.equal(decision.play, false);
  });

  it('skips a second visit', () => {
    assert.deepEqual(shouldPlayIntro({ ...FRESH, alreadySeen: true }), {
      play: false,
      reason: 'already-seen',
    });
  });

  it('replays a second visit when the guest asks', () => {
    const decision = shouldPlayIntro({ ...FRESH, alreadySeen: true, replayRequested: true });
    assert.deepEqual(decision, { play: true, reason: 'play' });
  });

  it('skips a low-end device', () => {
    assert.equal(shouldPlayIntro({ ...FRESH, hardwareConcurrency: 4 }).reason, 'low-end-device');
    assert.equal(shouldPlayIntro({ ...FRESH, deviceMemory: 2 }).reason, 'low-end-device');
  });
});

describe('isLowEnd', () => {
  it('fires at the threshold, not just below it', () => {
    assert.equal(isLowEnd({ ...FRESH, hardwareConcurrency: MIN_CORES }), true);
    assert.equal(isLowEnd({ ...FRESH, deviceMemory: MIN_MEMORY_GB }), true);
  });

  it('passes a capable device', () => {
    assert.equal(isLowEnd({ ...FRESH, hardwareConcurrency: 8, deviceMemory: 8 }), false);
  });

  it('does not assume the worst when the browser reports nothing', () => {
    // Safari reports neither. Treating absence as low-end would switch the
    // sequence off for every iPhone without anybody noticing.
    assert.equal(isLowEnd(FRESH), false);
    assert.equal(isLowEnd({ ...FRESH, hardwareConcurrency: undefined }), false);
  });

  it('trusts either signal on its own', () => {
    assert.equal(isLowEnd({ ...FRESH, hardwareConcurrency: 8, deviceMemory: 1 }), true);
    assert.equal(isLowEnd({ ...FRESH, hardwareConcurrency: 2, deviceMemory: 8 }), true);
  });
});

describe('seenStorageKey', () => {
  it('is keyed per invitation, not per browser', () => {
    assert.equal(seenStorageKey('abc123XYZ0'), 'invite-seen:abc123XYZ0');
    assert.notEqual(seenStorageKey('a'), seenStorageKey('b'));
  });
});
