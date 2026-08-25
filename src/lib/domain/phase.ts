/**
 * PERMANENT. Pure, dependency-free, and unit tested. Imports nothing on
 * purpose, so `node --test` can run the spec without a bundler.
 */

export const PHASES = ['invitation', 'details', 'dayOf', 'thankYou'] as const;
export type Phase = (typeof PHASES)[number];

export function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

export type PhaseConfig = {
  detailsOpenAt: Date;
  dayOfStartAt: Date;
  thankYouAt: Date;
  /** Set from /admin/config to force a phase while testing. Null = derive. */
  phaseOverride: Phase | null;
};

/**
 * Boundaries are half-open: at exactly `detailsOpenAt` the phase is already
 * 'details'. Total by construction - misordered config still yields a phase.
 */
export function currentPhase(now: Date, cfg: PhaseConfig): Phase {
  if (cfg.phaseOverride) return cfg.phaseOverride;
  if (now < cfg.detailsOpenAt) return 'invitation';
  if (now < cfg.dayOfStartAt) return 'details';
  if (now < cfg.thankYouAt) return 'dayOf';
  return 'thankYou';
}

/* -------------------------------------------------------------------------- */
/* section ordering                                                           */
/* -------------------------------------------------------------------------- */

export const SECTION_IDS = ['invitation', 'note', 'events', 'rsvp', 'thanks'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Phase controls ORDER and PROMINENCE, never visibility.
 *
 * Every ordering below contains every section. A guest opening their
 * invitation for the first time in late November must still see the
 * invitation, and the RSVP form must stay reachable in every phase. The
 * section at index 0 is the lead section; the UI may render it larger.
 */
const ORDERS: Record<Phase, readonly SectionId[]> = {
  // Before details open: the invitation itself leads, RSVP close behind.
  invitation: ['invitation', 'note', 'rsvp', 'events', 'thanks'],
  // Details are live: venue, time and dress code lead, RSVP stays high.
  details: ['events', 'rsvp', 'invitation', 'note', 'thanks'],
  // On the day: where and when, above everything else.
  dayOf: ['events', 'invitation', 'note', 'rsvp', 'thanks'],
  // After: thanks leads, but the RSVP form is still present and reachable.
  thankYou: ['thanks', 'events', 'invitation', 'note', 'rsvp'],
};

export function sectionOrder(phase: Phase): readonly SectionId[] {
  return ORDERS[phase];
}
