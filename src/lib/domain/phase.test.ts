import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currentPhase,
  PHASES,
  SECTION_IDS,
  sectionOrder,
  type Phase,
  type PhaseConfig,
} from './phase.ts';

const DETAILS_OPEN = new Date('2026-11-01T00:00:00.000Z');
const DAY_OF_START = new Date('2026-12-11T18:30:00.000Z');
const THANK_YOU = new Date('2026-12-12T18:30:00.000Z');

const cfg = (phaseOverride: Phase | null = null): PhaseConfig => ({
  detailsOpenAt: DETAILS_OPEN,
  dayOfStartAt: DAY_OF_START,
  thankYouAt: THANK_YOU,
  phaseOverride,
});

const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

describe('currentPhase', () => {
  describe('derived from dates', () => {
    it('is invitation long before details open', () => {
      assert.equal(currentPhase(new Date('2026-06-01T00:00:00Z'), cfg()), 'invitation');
    });

    it('is invitation one millisecond before detailsOpenAt', () => {
      assert.equal(currentPhase(ms(DETAILS_OPEN, -1), cfg()), 'invitation');
    });

    it('is details at exactly detailsOpenAt (boundary is inclusive of the later phase)', () => {
      assert.equal(currentPhase(DETAILS_OPEN, cfg()), 'details');
    });

    it('is details between detailsOpenAt and dayOfStartAt', () => {
      assert.equal(currentPhase(new Date('2026-11-20T12:00:00Z'), cfg()), 'details');
    });

    it('is details one millisecond before dayOfStartAt', () => {
      assert.equal(currentPhase(ms(DAY_OF_START, -1), cfg()), 'details');
    });

    it('is dayOf at exactly dayOfStartAt', () => {
      assert.equal(currentPhase(DAY_OF_START, cfg()), 'dayOf');
    });

    it('is dayOf between dayOfStartAt and thankYouAt', () => {
      assert.equal(currentPhase(new Date('2026-12-12T06:00:00Z'), cfg()), 'dayOf');
    });

    it('is dayOf one millisecond before thankYouAt', () => {
      assert.equal(currentPhase(ms(THANK_YOU, -1), cfg()), 'dayOf');
    });

    it('is thankYou at exactly thankYouAt', () => {
      assert.equal(currentPhase(THANK_YOU, cfg()), 'thankYou');
    });

    it('is thankYou long after', () => {
      assert.equal(currentPhase(new Date('2027-03-01T00:00:00Z'), cfg()), 'thankYou');
    });
  });

  describe('override', () => {
    for (const phase of PHASES) {
      it(`returns '${phase}' regardless of the clock when overridden`, () => {
        // A time that would otherwise derive to each of the four phases.
        const times = [
          new Date('2026-06-01T00:00:00Z'),
          new Date('2026-11-20T12:00:00Z'),
          new Date('2026-12-12T06:00:00Z'),
          new Date('2027-03-01T00:00:00Z'),
        ];
        for (const now of times) {
          assert.equal(currentPhase(now, cfg(phase)), phase);
        }
      });
    }

    it('falls through to date derivation when the override is null', () => {
      assert.equal(currentPhase(new Date('2026-11-20T12:00:00Z'), cfg(null)), 'details');
    });
  });

  describe('robustness', () => {
    it('stays total when the configured dates are misordered', () => {
      const broken: PhaseConfig = {
        detailsOpenAt: THANK_YOU,
        dayOfStartAt: DETAILS_OPEN,
        thankYouAt: DAY_OF_START,
        phaseOverride: null,
      };
      const result = currentPhase(new Date('2026-11-20T12:00:00Z'), broken);
      assert.ok(PHASES.includes(result), `expected a valid phase, got ${result}`);
    });

    it('treats identical boundaries as a zero-width phase, skipping it', () => {
      const collapsed: PhaseConfig = {
        detailsOpenAt: DETAILS_OPEN,
        dayOfStartAt: DETAILS_OPEN,
        thankYouAt: THANK_YOU,
        phaseOverride: null,
      };
      // 'details' has zero width, so exactly at the boundary we are in dayOf.
      assert.equal(currentPhase(DETAILS_OPEN, collapsed), 'dayOf');
      assert.equal(currentPhase(ms(DETAILS_OPEN, -1), collapsed), 'invitation');
    });
  });
});

describe('sectionOrder', () => {
  it('never removes a section in any phase', () => {
    for (const phase of PHASES) {
      const order = sectionOrder(phase);
      assert.equal(
        order.length,
        SECTION_IDS.length,
        `${phase} has ${order.length} sections, expected ${SECTION_IDS.length}`,
      );
      for (const id of SECTION_IDS) {
        assert.ok(order.includes(id), `${phase} is missing section '${id}'`);
      }
    }
  });

  it('never duplicates a section', () => {
    for (const phase of PHASES) {
      const order = sectionOrder(phase);
      assert.equal(new Set(order).size, order.length, `${phase} has a duplicate section`);
    }
  });

  it('keeps the RSVP form reachable in every phase, including thankYou', () => {
    for (const phase of PHASES) {
      assert.ok(sectionOrder(phase).includes('rsvp'), `${phase} dropped the RSVP form`);
    }
  });

  it('leads with events once details are open and on the day', () => {
    assert.equal(sectionOrder('details')[0], 'events');
    assert.equal(sectionOrder('dayOf')[0], 'events');
  });

  it('leads with the invitation before details open', () => {
    assert.equal(sectionOrder('invitation')[0], 'invitation');
  });
});
