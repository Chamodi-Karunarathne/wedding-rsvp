/**
 * The intro sequence, as data.
 *
 * Eleven beats over roughly 23 seconds. Every timing is a number in this
 * file and nowhere else - not spread through CSS, not inline in the timeline
 * builder - because these WILL be changed repeatedly, by someone who wants to
 * change a number and see what happens, not to read a timeline.
 *
 * `start` and `duration` are seconds on the master timeline. Targets are CSS
 * selectors resolved against the document when the timeline is built; a beat
 * whose target matches nothing is skipped rather than throwing, so a
 * re-exported asset that drops an id costs that beat and not the sequence.
 *
 * Pure data: no imports, no GSAP, no DOM. Unit tested for orderliness.
 */

export type BeatEffect =
  | 'wipe' /* a mask sweeping across, revealing what is under it */
  | 'fade'
  | 'rise' /* fade up from slightly below */
  | 'crack' /* the seal halves rotating apart, and the flap lifting after */
  | 'slide' /* the card leaving the envelope */
  | 'bloom' /* scale up from the stem base */
  | 'stagger' /* fade in children one after another */
  | 'sweep' /* a masked gradient passing over */
  | 'particles'; /* canvas, not DOM */

export type Beat = {
  id: string;
  /** Seconds from the start of the sequence. */
  start: number;
  /** Seconds. */
  duration: number;
  /** Resolved with querySelectorAll. Missing targets skip the beat. */
  target: string;
  effect: BeatEffect;
  /** A GSAP core ease. Core only - no plugins, see the README. */
  ease: string;
  /** For 'stagger' and 'bloom': seconds between each child starting. */
  stagger?: number;
  /**
   * Descendants of the target revealed alongside it. The monogram appears in
   * two beats and only carries the closing line in the second, so which
   * children come with it has to be per-beat rather than per-element.
   */
  revealChildren?: string;
  /**
   * When the target leaves again, in seconds on the master timeline.
   *
   * Without this a beat's target simply stays wherever it was put. The
   * monogram was raised at beat 1 and never lowered, so it sat on top of the
   * envelope, the seal and the whole card for the remaining twenty seconds -
   * every later beat played out behind it.
   */
  exitAt?: number;
  exitDuration?: number;
  note?: string;
};

/**
 * The last beat's end. Everything that needs to know how long the sequence
 * runs derives it from here rather than repeating 23.
 */
export function sequenceDuration(beats: readonly Beat[]): number {
  return beats.reduce((end, beat) => Math.max(end, beat.start + beat.duration), 0);
}

export const BEATS: readonly Beat[] = [
  {
    id: 'monogram-reveal',
    start: 0,
    duration: 3,
    target: '[data-intro="monogram"]',
    effect: 'wipe',
    ease: 'power2.inOut',
    // Leaves as the envelope arrives, so the two cross-fade rather than the
    // mark hanging over the envelope for the rest of the sequence.
    exitAt: 2.6,
    exitDuration: 0.9,
    // A single wipe, not a per-letter stagger: monogram.svg is one group of
    // three anonymous paths with no mono-m / mono-amp / mono-c to stagger.
    note: 'Single wipe. The mark has no per-letter groups to stagger.',
  },
  {
    id: 'envelope-appears',
    start: 3,
    duration: 3,
    target: '[data-intro="envelope"]',
    effect: 'rise',
    ease: 'power2.out',
    note: 'Carries the guest name, which is live text on the envelope face.',
  },
  {
    id: 'seal-cracks',
    start: 6,
    duration: 2,
    target: '[data-intro="seal"]',
    effect: 'crack',
    ease: 'power3.inOut',
    note: 'Halves rotate about their inner edges. Needs transform-box: fill-box.',
  },
  {
    id: 'card-slides-out',
    start: 8,
    duration: 2,
    target: '[data-intro="card"]',
    effect: 'slide',
    ease: 'power2.out',
    // Clears the stage for the closing monogram, which the storyboard shows
    // alone on the ground rather than over the card. finish() restores the
    // card to the page afterwards.
    exitAt: 19.9,
    exitDuration: 1.1,
    // The slide also takes the envelope out: the card cannot appear to come
    // out of something that is still sitting on top of it.
    note: 'Card rises as the envelope falls away beneath it.',
  },
  {
    id: 'florals-bloom',
    start: 10,
    duration: 1,
    target: '[data-layer="card-florals"] [id*="floral-"]',
    effect: 'bloom',
    ease: 'back.out(1.4)',
    stagger: 0.18,
    // Two clusters, so this is a two-step stagger rather than a bloom across
    // many. More clusters would need no code change, only a richer export.
    note: 'Two clusters: floral-top-right and floral-bottom-left.',
  },
  {
    id: 'text-lines',
    start: 11,
    duration: 5,
    target: '[data-layer="card-text"] [id*="line-"]',
    effect: 'stagger',
    ease: 'power1.out',
    stagger: 0.38,
    // Ordered by vertical position at build time, NOT document order:
    // line-07-names is last in the file but seventh down the card, so source
    // order would reveal the couple's names after the blessing.
    note: 'Sorted top to bottom, because the export order is wrong.',
  },
  {
    id: 'date-time-venue',
    start: 16,
    duration: 1,
    target: '[data-layer="card-text"] [id*="line-08"], [data-layer="card-text"] [id*="line-09"], [data-layer="card-text"] [id*="line-10"], [data-layer="card-text"] [id*="line-11"]',
    effect: 'fade',
    ease: 'power1.out',
    note: 'A settling emphasis on lines already revealed by the stagger.',
  },
  {
    id: 'rsvp-details',
    start: 17,
    duration: 1,
    target: '.rsvp-slot',
    effect: 'rise',
    ease: 'power2.out',
  },
  {
    id: 'sparkle-pass',
    start: 18,
    duration: 1,
    target: '[data-intro="sweep"]',
    effect: 'sweep',
    ease: 'none',
    note: 'A masked gradient translating across. Never a filter.',
  },
  {
    id: 'petals',
    start: 19,
    duration: 1,
    target: '[data-intro="canvas"]',
    effect: 'particles',
    ease: 'none',
    note: 'One canvas, capped at 120 particles, destroyed when the beat ends.',
  },
  {
    id: 'monogram-ending',
    start: 20,
    duration: 3,
    target: '[data-intro="monogram"]',
    effect: 'wipe',
    ease: 'power2.inOut',
    revealChildren: '[data-intro-reveal]',
    note: 'Brings the closing line and its rule with it. Beat 1 does not.',
  },
];

export const SEQUENCE_DURATION = sequenceDuration(BEATS);

/** The skip control appears at this point, and never moves afterwards. */
export const SKIP_VISIBLE_AT = 0.8;

/** Hard cap for beat 10. DOM nodes would not survive this on a mid-range phone. */
export const MAX_PARTICLES = 120;
