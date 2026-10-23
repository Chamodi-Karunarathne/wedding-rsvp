import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldPlayIntro } from './playback.ts';

describe('shouldPlayIntro', () => {
  it('plays on every opening when motion is allowed', () => {
    for (let visit = 0; visit < 3; visit += 1) {
      assert.deepEqual(shouldPlayIntro({ reducedMotion: false }), {
        play: true,
        reason: 'play',
      });
    }
  });

  it('does not suppress playback because of legacy seen or replay flags', () => {
    for (const replayRequested of [false, true]) {
      const facts = { reducedMotion: false, alreadySeen: true, replayRequested };
      assert.deepEqual(shouldPlayIntro(facts), { play: true, reason: 'play' });
    }
  });

  it('does not suppress playback based on reported hardware', () => {
    for (const hardware of [
      { hardwareConcurrency: 2, deviceMemory: 1 },
      { hardwareConcurrency: 4, deviceMemory: 2 },
      { hardwareConcurrency: 8, deviceMemory: 8 },
      {},
    ]) {
      const facts = { reducedMotion: false, ...hardware };
      assert.deepEqual(shouldPlayIntro(facts), { play: true, reason: 'play' });
    }
  });

  it('honors reduced motion on initial opening and replay', () => {
    for (const replayRequested of [false, true]) {
      const facts = { reducedMotion: true, replayRequested };
      assert.deepEqual(shouldPlayIntro(facts), {
        play: false,
        reason: 'reduced-motion',
      });
    }
  });
});
