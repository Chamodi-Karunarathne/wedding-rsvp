/**
 * The intro sequence, as data.
 *
 * Eleven beats over roughly 23 seconds. Primary beat timing lives here; the
 * timeline builder handles anticipation, settling and the brief overlaps
 * within each beat. There are no independent CSS animation clocks.
 *
 * `start` and `duration` are seconds on the master timeline. Targets are CSS
 * selectors resolved against the document when the timeline is built; a beat
 * whose target matches nothing is skipped rather than throwing, so a
 * re-exported asset that drops an id costs that beat and not the sequence.
 *
 * Pure data: no imports, no GSAP, no DOM. Unit tested for orderliness.
 */

export type BeatEffect =
  | 'wipe' /* a soft foil reveal; retained beat identity */
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
    note: 'A gentle foil reveal of the configured initials.',
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
    exitAt: 20,
    exitDuration: .9,
    ease: 'sine.inOut',
    note: 'The card rises and holds until the closing dissolve.',
  },
  {
    id: 'florals-bloom',
    start: 10,
    duration: 1.55,
    target: '[data-layer="card-florals"] [id*="floral-"]',
    effect: 'bloom',
    ease: 'sine.out',
    stagger: 0.32,
    // Two clusters, so this is a two-step stagger rather than a bloom across
    // many. More clusters would need no code change, only a richer export.
    note: 'Two clusters: floral-top-right and floral-bottom-left.',
  },
  {
    id: 'text-lines',
    start: 11,
    duration: 5,
    target: '[data-intro-line]',
    effect: 'stagger',
    ease: 'power1.out',
    stagger: 0.5,
    note: 'Family wording reveals top to bottom, then the couple names as one phrase.',
  },
  {
    id: 'date-time-venue',
    start: 16,
    duration: 1,
    target: '[data-intro="details"]',
    effect: 'fade',
    ease: 'power1.out',
    note: 'Event details get their own quiet reveal after the names.',
  },
  {
    id: 'rsvp-details',
    start: 17,
    duration: 1,
    target: '.rsvp-slot, [data-intro="reply-print"]',
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
    note: 'Four petals and sparse dust on the same canvas; a gentle tail into the closing moment.',
  },
  {
    id: 'monogram-ending',
    start: 20,
    duration: 3,
    target: '[data-intro="closing"]',
    effect: 'wipe',
    ease: 'sine.inOut',
    revealChildren: '[data-intro-reveal]',
    note: 'Closing monogram, then a dissolve onto the usable invitation.',
  },
];

export const SEQUENCE_DURATION = sequenceDuration(BEATS);

/** The skip control appears at this point, and never moves afterwards. */
export const SKIP_VISIBLE_AT = 0.8;

/** Hard cap for beat 10. DOM nodes would not survive this on a mid-range phone. */
export const MAX_PARTICLES = 28;
