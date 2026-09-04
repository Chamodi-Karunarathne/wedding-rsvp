/**
 * Whether the intro sequence should run at all.
 *
 * Pure, dependency-free and unit tested, so the decision can be reasoned
 * about without a browser. The client component gathers the facts; this
 * decides. Every route through it that returns false leaves a complete,
 * working invitation on the screen - the sequence is a layer on top of a page
 * that already works, never a gate in front of one.
 */

export type PlaybackContext = {
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
  /** ?noanim=1 in the URL. */
  noanim: boolean;
  /** navigator.hardwareConcurrency, when the browser reports it. */
  hardwareConcurrency?: number | undefined;
  /** navigator.deviceMemory in GB, when the browser reports it. */
  deviceMemory?: number | undefined;
  /** localStorage says this token has already seen it. */
  alreadySeen: boolean;
  /** The guest pressed "replay". Overrides alreadySeen, nothing else. */
  replayRequested: boolean;
};

export type PlaybackReason =
  | 'play'
  | 'noanim-param'
  | 'reduced-motion'
  | 'low-end-device'
  | 'already-seen';

export type PlaybackDecision = { play: boolean; reason: PlaybackReason };

/** At or below these, the sequence is skipped the same as reduced-motion. */
export const MIN_CORES = 4;
export const MIN_MEMORY_GB = 2;

/**
 * Order matters, and it is the order of how firmly each signal was expressed.
 *
 * ?noanim=1 is someone deliberately asking, including us when sending the
 * link to a guest who reported trouble, so nothing overrides it - not even
 * replay. Reduced-motion is an accessibility setting and outranks a replay
 * press, which is far more likely to be a mis-tap than a request to override
 * the setting on their own device.
 */
export function shouldPlayIntro(context: PlaybackContext): PlaybackDecision {
  if (context.noanim) return { play: false, reason: 'noanim-param' };
  if (context.reducedMotion) return { play: false, reason: 'reduced-motion' };

  if (isLowEnd(context)) return { play: false, reason: 'low-end-device' };

  if (context.alreadySeen && !context.replayRequested) {
    return { play: false, reason: 'already-seen' };
  }

  return { play: true, reason: 'play' };
}

/**
 * A phone that will drop frames through twenty-three seconds of animation.
 *
 * Absent values are NOT treated as low-end: Safari reports neither, and
 * assuming the worst there would silently switch the sequence off for every
 * iPhone. The check only fires on a number the browser actually gave us.
 */
export function isLowEnd(context: PlaybackContext): boolean {
  const { hardwareConcurrency, deviceMemory } = context;

  if (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= MIN_CORES) return true;
  if (typeof deviceMemory === 'number' && deviceMemory <= MIN_MEMORY_GB) return true;

  return false;
}

/**
 * Per invitation, not per browser: a household that opens their link on a
 * second device should see it once there too, and clearing one does not
 * silently clear the other.
 */
export function seenStorageKey(token: string): string {
  return `invite-seen:${token}`;
}
