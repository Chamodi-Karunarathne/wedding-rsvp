import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './service-test-support.ts';
import type { GuestListRow } from './guests.ts';
import type { EventView, RsvpSource } from './types.ts';

const { summarizeGuests } = await import('./dashboard.ts');

const date = new Date('2026-12-03T03:45:00Z');
const events: EventView[] = ['ceremony', 'reception'].map((slug, index) => ({
  id: slug, slug, name: slug, startsAt: date, venueName: 'Venue', venueAddress: 'Address',
  mapUrl: null, dressCode: null, sortOrder: index,
}));

function household(id: string, side: 'bride' | 'groom', channel: 'whatsapp' | 'print'): GuestListRow {
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
      { slug: 'ceremony', invited: 3, attending: 1, declined: 1, noResponse: 1, headcount: 3 },
      { slug: 'reception', invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 2 },
    ]);
  });

  it('narrows totals to the selected family and sending method', () => {
    const summary = summarizeGuests(rows, events, { side: 'bride', channel: 'whatsapp' });
    assert.equal(summary.totalGuests, 1);
    assert.equal(summary.respondedGuests, 1);
    assert.deepEqual(summary.perEvent.map(({ event: _event, ...counts }) => counts), [
      { invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 3 },
      { invited: 1, attending: 1, declined: 0, noResponse: 0, headcount: 2 },
    ]);
  });
});
