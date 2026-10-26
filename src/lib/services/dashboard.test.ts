import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './service-test-support.ts';
import type { GuestListRow } from './guests.ts';
import type { EventView, RsvpSource } from './types.ts';

const { summarizeEventSides, summarizeGuests } = await import('./dashboard.ts');

const date = new Date('2026-12-03T03:45:00Z');
const events: EventView[] = ['ceremony', 'reception'].map((slug, index) => ({
  id: slug, slug, name: slug, startsAt: date, venueName: 'Venue', venueAddress: 'Address',
  mapUrl: null, dressCode: null, sortOrder: index,
}));

function household(id: string, side: 'bride' | 'groom' | 'both', channel: 'whatsapp' | 'print'): GuestListRow {
  return {
    guest: {
      id, token: id, displayName: id, displayNameFallback: null, cardName: id, sortName: id,
      side, language: 'en', maxPartySize: 4, phone: null, notes: null,
    },
    eventSlugs: ['ceremony'], rsvps: [], message: null, firstOpen: null, lastOpen: null,
    channels: [{ id, channel, status: 'pending', sentAt: null, sentBy: null, notes: null }],
  };
}

function reply(eventSlug: string, attending: boolean, partyCount: number, source: RsvpSource) {
  return { eventSlug, attending, partyCount, source, attendeeNames: null, recordedBy: null,
    submittedAt: date, updatedAt: date };
}

describe('dashboard totals from a shared guest snapshot', () => {
  const coming = household('Coming family', 'bride', 'whatsapp');
  coming.eventSlugs.push('reception');
  coming.rsvps = [reply('ceremony', true, 3, 'self'), reply('reception', true, 2, 'self')];
  const declined = household('Declined family', 'bride', 'print');
  declined.rsvps = [reply('ceremony', false, 0, 'phone')];
  const waiting = household('Waiting family', 'groom', 'whatsapp');
  const rows = [coming, declined, waiting];

  it('keeps catering totals across reply methods and counts each celebration separately', () => {
    const summary = summarizeGuests(rows, events, { source: 'phone' });
    assert.equal(summary.totalGuests, 3);
    assert.equal(summary.respondedGuests, 2);
    assert.deepEqual(summary.perEvent.map(({ event, ...counts }) => ({ slug: event.slug, ...counts })), [
      { slug: 'ceremony', invited: 3, attending: 1, declined: 1, noResponse: 1, headcount: 3,
        invitedGuests: 12, waitingGuests: 4, declinedGuests: 4 },
      { slug: 'reception', invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 2,
        invitedGuests: 4, waitingGuests: 0, declinedGuests: 0 },
    ]);
  });

  it('narrows totals to the selected family and sending method', () => {
    const summary = summarizeGuests(rows, events, { side: 'bride', channel: 'whatsapp' });
    assert.equal(summary.totalGuests, 1);
    assert.equal(summary.respondedGuests, 1);
    assert.deepEqual(summary.perEvent.map(({ event: _event, ...counts }) => counts), [
      { invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 3,
        invitedGuests: 4, waitingGuests: 0, declinedGuests: 0 },
      { invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 2,
        invitedGuests: 4, waitingGuests: 0, declinedGuests: 0 },
    ]);
  });

  it('uses each household allowance for invited, waiting and declined places and actual party sizes for attendance', () => {
    const bride = household('Bride', 'bride', 'whatsapp');
    bride.eventSlugs.push('reception');
    bride.rsvps = [reply('ceremony', true, 2, 'self'), reply('reception', false, 0, 'phone')];
    const groom = household('Groom', 'groom', 'print');
    groom.guest.maxPartySize = 7;
    groom.rsvps = [reply('ceremony', false, 0, 'phone')];
    const shared = household('Shared', 'both', 'print');
    shared.guest.maxPartySize = 3;
    const unassigned = household('Unassigned', 'both', 'whatsapp');
    unassigned.eventSlugs = [];
    unassigned.guest.maxPartySize = 9;
    const receptionOnly = household('Reception only', 'groom', 'whatsapp');
    receptionOnly.eventSlugs = ['reception'];
    receptionOnly.guest.maxPartySize = 2;
    receptionOnly.rsvps = [reply('reception', true, 1, 'admin')];
    const mixed = [bride, groom, shared, unassigned, receptionOnly];
    const summary = summarizeGuests(mixed, events);
    assert.deepEqual(summary.perEvent.map(({ event, ...counts }) => ({ slug: event.slug, ...counts })), [
      { slug: 'ceremony', invited: 3, attending: 1, declined: 1, noResponse: 1, headcount: 2,
        invitedGuests: 14, waitingGuests: 3, declinedGuests: 7 },
      { slug: 'reception', invited: 2, attending: 1, declined: 1, noResponse: 0, headcount: 1,
        invitedGuests: 6, waitingGuests: 0, declinedGuests: 4 },
    ]);
    const sides = summarizeEventSides(mixed, events[0]!);
    assert.deepEqual(sides, [
      { side: 'bride', invitedGuests: 4, invitedHouseholds: 1, attendingGuests: 2, attendingHouseholds: 1 },
      { side: 'groom', invitedGuests: 7, invitedHouseholds: 1, attendingGuests: 0, attendingHouseholds: 0 },
      { side: 'both', invitedGuests: 3, invitedHouseholds: 1, attendingGuests: 0, attendingHouseholds: 0 },
    ]);
    assert.equal(sides.reduce((sum, side) => sum + side.invitedGuests, 0), summary.perEvent[0]!.invitedGuests);
    assert.equal(sides.reduce((sum, side) => sum + side.attendingGuests, 0), summary.perEvent[0]!.headcount);
    assert.equal(sides.reduce((sum, side) => sum + side.invitedHouseholds, 0), summary.perEvent[0]!.invited);
    assert.deepEqual(summarizeEventSides(mixed, events[1]!), [
      { side: 'bride', invitedGuests: 4, invitedHouseholds: 1, attendingGuests: 0, attendingHouseholds: 0 },
      { side: 'groom', invitedGuests: 2, invitedHouseholds: 1, attendingGuests: 1, attendingHouseholds: 1 },
      { side: 'both', invitedGuests: 0, invitedHouseholds: 0, attendingGuests: 0, attendingHouseholds: 0 },
    ]);
  });
});
