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
};

export type PlaybackReason = 'play' | 'reduced-motion';

export type PlaybackDecision = { play: boolean; reason: PlaybackReason };

/**
 * Play on every opening, including repeat visits and replay. Stored visit
 * history and reported device specifications must not silently remove the
 * sequence. The guest's motion preference remains the accessibility override.
 */
export function shouldPlayIntro(context: PlaybackContext): PlaybackDecision {
  if (context.reducedMotion) return { play: false, reason: 'reduced-motion' };

  return { play: true, reason: 'play' };
}
