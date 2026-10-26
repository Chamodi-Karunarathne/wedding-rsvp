import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuestListRow } from '../services/guests.ts';
import type { RsvpView } from '../services/types.ts';
import {
  filterAndSortGuests, parseTableFilters, scopedEventSlugs, scopedReplies,
  tableHref, tableQuery, TABLE_SORT_OPTIONS,
  type TableFilters, type TableSearchParams, type TableView,
} from './admin-tables.ts';

const date = new Date('2026-10-25T09:00:00Z');
const events = ['ceremony', 'reception'];

function filters(params: TableSearchParams = {}, view: TableView = 'rsvps'): TableFilters {
  return parseTableFilters(params, events, view);
}

function household(id: string, changes: Partial<GuestListRow['guest']> = {}): GuestListRow {
  return {
    guest: {
      id, token: 'private-' + id, displayName: id, displayNameFallback: null, cardName: id,
      sortName: id, side: 'bride', language: 'en', maxPartySize: 2, phone: null, notes: null,
      ...changes,
    },
    eventSlugs: ['ceremony'], rsvps: [], channels: [], message: null, firstOpen: null, lastOpen: null,
  };
}

function reply(eventSlug: string, attending: boolean, changes: Partial<RsvpView> = {}): RsvpView {
  return {
    eventSlug, attending, partyCount: attending ? 2 : 0, attendeeNames: null, source: 'self',
    recordedBy: null, submittedAt: date, updatedAt: date, ...changes,
  };
}

function channel(row: GuestListRow, name: 'whatsapp' | 'print' | 'instagram', status: 'pending' | 'sent' = 'pending') {
  row.channels.push({ id: row.guest.id + name, channel: name, status, sentAt: status === 'sent' ? date : null, sentBy: null, notes: null });
  return row;
}

function ids(rows: readonly GuestListRow[], selected: TableFilters): string[] {
  return filterAndSortGuests(rows, selected).map(row => row.guest.id);
}

describe('admin table URL state', () => {
  it('normalizes unknown, unavailable and repeated values without throwing', () => {
    const selected = filters({
      q: ['one', 'two'], side: 'unknown', channel: ['whatsapp', 'print'], status: 'maybe',
      state: 'delivered', source: 'online', event: 'removed', phone: 'empty', opened: 'true',
      sort: 'attending', direction: 'DESC',
    }, 'send');
    assert.deepEqual(selected, filters({}, 'send'));
    assert.equal(filters({ q: '   ' + 'a'.repeat(350) + '  ' }).q.length, 300);
    assert.equal(filters({ sort: 'attending' }).sort, 'attending');
    for (const view of ['guests', 'send', 'rsvps'] as const) {
      for (const option of TABLE_SORT_OPTIONS[view]) {
        assert.equal(filters({ sort: option.value }, view).sort, option.value);
      }
    }
  });

  it('preserves every filter when changing a sort or progress card and omits defaults', () => {
    const selected = filters({
      q: 'Élodie family', side: 'both', channel: 'instagram', status: 'coming', state: 'responded',
      source: 'phone', event: 'reception', phone: 'present', opened: 'yes', sort: 'replied', direction: 'desc',
    });
    const serialized = tableQuery(selected, { sort: 'name', direction: 'asc' });
    const restored = filters(Object.fromEntries(new URLSearchParams(serialized)));
    assert.deepEqual(restored, { ...selected, sort: 'name', direction: 'asc' });
    assert.equal(tableHref('/admin/guests', filters()), '/admin/guests');
    assert.equal(tableHref('/admin/send', selected, { state: 'opened' }).includes('state=opened'), true);
    assert.equal(tableQuery(filters()), '');
    assert.equal(new URLSearchParams(serialized).has('sort'), false);
    assert.equal(new URLSearchParams(serialized).has('direction'), false);
  });
});

describe('admin table filtering', () => {
  it('combines side, channel, reply, source, event, phone and opened filters', () => {
    const matching = channel(household('Matching', { side: 'groom', phone: '+94771234567' }), 'whatsapp');
    matching.firstOpen = date;
    matching.lastOpen = date;
    matching.rsvps = [reply('ceremony', true, { source: 'phone' })];
    const wrongSource = structuredClone(matching);
    wrongSource.guest.id = 'Other';
    wrongSource.rsvps[0]!.source = 'self';
    const selected = filters({ side: 'groom', channel: 'whatsapp', status: 'coming', source: 'phone',
      event: 'ceremony', phone: 'present', opened: 'yes', state: 'responded' });
    assert.deepEqual(ids([wrongSource, matching], selected), ['Matching']);
    assert.deepEqual(ids([matching], { ...selected, side: 'bride' }), []);
    assert.deepEqual(ids([matching], { ...selected, channel: 'print' }), []);
    assert.deepEqual(ids([matching], { ...selected, opened: 'no' }), []);
  });

  it('requires response status and source to match the same event reply', () => {
    const mixed = household('Mixed');
    mixed.eventSlugs = events;
    mixed.rsvps = [reply('ceremony', true, { source: 'self' }), reply('reception', false, { source: 'phone' })];
    assert.deepEqual(ids([mixed], filters({ status: 'coming', source: 'phone' })), []);
    assert.deepEqual(ids([mixed], filters({ status: 'declined', source: 'phone' })), ['Mixed']);
    assert.deepEqual(ids([mixed], filters({ status: 'coming', event: 'reception' })), []);
    assert.deepEqual(scopedEventSlugs(mixed, filters({ event: 'ceremony' })), ['ceremony']);
    assert.deepEqual(scopedReplies(mixed, filters({ event: 'reception' })).map(value => value.source), ['phone']);
  });

  it('distinguishes partial replies, completely unanswered households and uninvited records', () => {
    const partial = household('Partial');
    partial.eventSlugs = events;
    partial.rsvps = [reply('ceremony', true)];
    const unanswered = household('Unanswered');
    const uninvited = household('Uninvited');
    uninvited.eventSlugs = [];
    assert.deepEqual(ids([partial, unanswered, uninvited], filters({ status: 'waiting' })), ['Partial', 'Unanswered']);
    assert.deepEqual(ids([partial, unanswered], filters({ source: 'none', status: 'waiting' })), ['Unanswered']);
    assert.deepEqual(ids([partial], filters({ status: 'waiting', source: 'phone' })), []);
    assert.deepEqual(ids([partial], filters({ event: 'reception', status: 'waiting', source: 'none' })), ['Partial']);
    assert.deepEqual(ids([uninvited], filters({ event: 'ceremony' })), []);
    assert.deepEqual(ids([partial], filters({ source: 'none', status: 'coming' })), []);
  });

  it('finds missing WhatsApp phones independently of optional phones on other channels', () => {
    const missing = channel(household('Missing'), 'whatsapp');
    const print = channel(household('Print'), 'print');
    const complete = channel(household('Complete', { phone: '+94771234567' }), 'whatsapp');
    const noChannel = household('No channel');
    const rows = [missing, print, complete, noChannel];
    assert.deepEqual(ids(rows, filters({ phone: 'needs_phone' })), ['Missing']);
    assert.deepEqual(ids(rows, filters({ state: 'needs_phone' })), ['Missing']);
    assert.deepEqual(ids(rows, filters({ status: 'needs_phone' })), ['Missing']);
    assert.deepEqual(ids(rows, filters({ phone: 'missing' })), ['Missing', 'No channel', 'Print']);
    assert.deepEqual(ids(rows, filters({ channel: 'none' })), ['No channel']);
  });

  it('keeps invitation progress as a household high-water mark', () => {
    const fresh = household('Fresh');
    const sent = channel(household('Sent'), 'print', 'sent');
    const opened = household('Opened');
    opened.firstOpen = date;
    opened.lastOpen = date;
    const replied = household('Replied');
    replied.rsvps = [reply('ceremony', false, { source: 'phone' })];
    const rows = [fresh, sent, opened, replied];
    assert.deepEqual(ids(rows, filters({ state: 'not_sent' })), ['Fresh']);
    assert.deepEqual(ids(rows, filters({ status: 'not_sent' })), ['Fresh']);
    assert.deepEqual(ids(rows, filters({ state: 'sent' })), ['Sent']);
    assert.deepEqual(ids(rows, filters({ state: 'opened' })), ['Opened']);
    assert.deepEqual(ids(rows, filters({ state: 'responded', opened: 'no' })), ['Replied']);
  });

  it('searches words across household, card, notes and attendee names without losing Latin accents', () => {
    const row = household('Family', { displayName: 'Élodie & José', cardName: 'Dear cousins', notes: 'Vegetarian supper' });
    row.rsvps = [reply('ceremony', true, { attendeeNames: 'Ana María' })];
    assert.deepEqual(ids([row], filters({ q: '  JOSE vegetarian MARIA  ' })), ['Family']);
    assert.deepEqual(ids([row], filters({ q: 'cousins elodie' })), ['Family']);
    assert.deepEqual(ids([row], filters({ q: 'Elodie unknown' })), []);
    const sinhala = household('Sinhala', { displayName: 'කුමාර' });
    assert.deepEqual(ids([sinhala], filters({ q: 'කුමාර' })), ['Sinhala']);
    assert.deepEqual(ids([sinhala], filters({ q: 'කුමැර' })), []);
  });

  it('matches local, international and formatted digits in any number without joining different numbers', () => {
    const row = household('Numbers', { phone: '+94771234567, +94769876543' });
    for (const q of ['077 123 4567', '+94 (76) 987-6543', '769876543', '9876543']) {
      assert.deepEqual(ids([row], filters({ q })), ['Numbers'], q);
    }
    assert.deepEqual(ids([row], filters({ q: '45679476' })), []);
  });
});

describe('admin table sorting', () => {
  it('sorts numeric places naturally and keeps ties deterministic without mutating inputs', () => {
    const two = household('two', { sortName: 'Family 2', maxPartySize: 2 });
    const ten = household('ten', { sortName: 'Family 10', maxPartySize: 10 });
    const tiedA = household('a', { sortName: 'Family 2', maxPartySize: 2 });
    const rows = [ten, two, tiedA];
    const before = structuredClone(rows);
    assert.deepEqual(ids(rows, filters({ sort: 'reserved', direction: 'asc' })), ['a', 'two', 'ten']);
    assert.deepEqual(ids(rows, filters({ sort: 'reserved', direction: 'desc' })), ['ten', 'a', 'two']);
    assert.deepEqual(ids(rows, filters()), ['a', 'two', 'ten']);
    assert.deepEqual(rows, before);
  });

  it('sorts real dates and keeps absent values last in either direction', () => {
    const old = household('Old');
    old.firstOpen = old.lastOpen = new Date('2026-09-01T10:00:00Z');
    old.rsvps = [reply('ceremony', true, { updatedAt: new Date('2026-09-01T10:00:00Z') })];
    const recent = household('Recent');
    recent.firstOpen = recent.lastOpen = new Date('2026-10-01T10:00:00Z');
    recent.rsvps = [reply('ceremony', true, { updatedAt: new Date('2026-10-01T10:00:00Z') })];
    const missing = household('A missing');
    for (const sort of ['opened', 'replied']) {
      assert.deepEqual(ids([missing, recent, old], filters({ sort, direction: 'asc' })), ['Old', 'Recent', 'A missing']);
      assert.deepEqual(ids([missing, recent, old], filters({ sort, direction: 'desc' })), ['Recent', 'Old', 'A missing']);
    }
  });

  it('scopes party totals and latest replies to the selected event', () => {
    const a = household('A');
    a.eventSlugs = events;
    a.rsvps = [reply('ceremony', true, { partyCount: 1, updatedAt: new Date('2026-10-01T00:00:00Z') }),
      reply('reception', true, { partyCount: 10, updatedAt: new Date('2026-10-25T00:00:00Z') })];
    const b = household('B');
    b.eventSlugs = events;
    b.rsvps = [reply('ceremony', true, { partyCount: 2, updatedAt: new Date('2026-10-10T00:00:00Z') }),
      reply('reception', false, { updatedAt: new Date('2026-10-05T00:00:00Z') })];
    assert.deepEqual(ids([a, b], filters({ sort: 'attending', direction: 'desc' })), ['A', 'B']);
    assert.deepEqual(ids([a, b], filters({ sort: 'attending', direction: 'desc', event: 'ceremony' })), ['B', 'A']);
    assert.deepEqual(ids([a, b], filters({ sort: 'replied', direction: 'desc', event: 'ceremony' })), ['B', 'A']);
    assert.deepEqual(ids([a, b], filters({ sort: 'replied', direction: 'desc', event: 'reception' })), ['A', 'B']);
  });

  it('keeps absent text fields after valid values when descending', () => {
    const a = channel(household('A', { phone: '+94771234567' }), 'instagram');
    a.rsvps = [reply('ceremony', true, { attendeeNames: 'Alice', source: 'self' })];
    const b = channel(household('B', { phone: '+94779876543' }), 'whatsapp');
    b.rsvps = [reply('ceremony', true, { attendeeNames: 'Zoya', source: 'phone' })];
    const missing = household('Missing');
    for (const sort of ['phone', 'channels', 'attendees']) {
      assert.deepEqual(ids([missing, a, b], filters({ sort, direction: 'desc' })), ['B', 'A', 'Missing']);
    }
    assert.deepEqual(ids([missing, a, b], filters({ sort: 'source', direction: 'desc' })), ['A', 'B', 'Missing']);
  });
});
