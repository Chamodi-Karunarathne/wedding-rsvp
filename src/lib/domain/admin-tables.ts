import { DELIVERY_CHANNELS, RSVP_SOURCES, SIDES } from '../../db/schema.ts';
import type { GuestListRow } from '../services/guests.ts';
import type { DeliveryChannelName, RsvpSource, Side } from '../services/types.ts';
import { deliveryNeedsPhone, deliveryState, DELIVERY_STATES } from './delivery.ts';
import { normalizePhone, splitPhoneNumbers } from './phone.ts';

export type TableView = 'guests' | 'send' | 'rsvps';
export type TableSearchParams = Record<string, string | string[] | undefined>;
export type TableSort =
  | 'name' | 'side' | 'phone' | 'reserved' | 'channels' | 'state' | 'response'
  | 'attending' | 'attendees' | 'source' | 'replied' | 'opened' | 'created' | 'updated';

export type TableFilters = {
  q: string;
  side: 'all' | Side;
  channel: 'all' | 'none' | DeliveryChannelName;
  status: 'all' | 'waiting' | 'coming' | 'declined' | 'not_sent' | 'needs_phone';
  state: 'all' | (typeof DELIVERY_STATES)[number] | 'needs_phone';
  source: 'all' | 'none' | RsvpSource;
  event: string;
  phone: 'all' | 'present' | 'missing' | 'needs_phone';
  opened: 'all' | 'yes' | 'no';
  sort: TableSort;
  direction: 'asc' | 'desc';
};

const nameOption = { value: 'name', label: 'Guest / Family' } as const;
const sideOption = { value: 'side', label: 'Which side' } as const;
const phoneOption = { value: 'phone', label: 'Phone number' } as const;
const reservedOption = { value: 'reserved', label: 'Reserved places' } as const;
const channelsOption = { value: 'channels', label: 'Sending channels' } as const;
const stateOption = { value: 'state', label: 'Invitation progress' } as const;
const responseOption = { value: 'response', label: 'Response status' } as const;
const openedOption = { value: 'opened', label: 'Last opened' } as const;
const repliedOption = { value: 'replied', label: 'Latest reply' } as const;
const createdOption = { value: 'created', label: 'Date added' } as const;
const updatedOption = { value: 'updated', label: 'Guest details updated' } as const;

export const TABLE_SORT_OPTIONS: Record<TableView, { value: TableSort; label: string }[]> = {
  guests: [nameOption, sideOption, phoneOption, reservedOption, channelsOption, stateOption,
    responseOption, openedOption, repliedOption, createdOption, updatedOption],
  send: [nameOption, sideOption, phoneOption, channelsOption, stateOption, openedOption,
    responseOption, repliedOption, createdOption, updatedOption],
  rsvps: [nameOption, sideOption, phoneOption, channelsOption, responseOption,
    { value: 'attending', label: 'Attending (total)' }, reservedOption,
    { value: 'attendees', label: 'Attendee names' }, { value: 'source', label: 'Reply method' },
    repliedOption, openedOption, createdOption, updatedOption],
};

const DEFAULTS: TableFilters = {
  q: '', side: 'all', channel: 'all', status: 'all', state: 'all', source: 'all',
  event: 'all', phone: 'all', opened: 'all', sort: 'name', direction: 'asc',
};

function one(value: string | string[] | undefined): string | undefined {
  // Duplicate URL keys are ambiguous; ignore them instead of picking a winner.
  return typeof value === 'string' ? value : undefined;
}

function choice<const T extends readonly string[]>(value: string | undefined, options: T, fallback: T[number]): T[number] {
  return value !== undefined && options.includes(value) ? value as T[number] : fallback;
}

/** Normalize the same URL state for the page, column links, and CSV export. */
export function parseTableFilters(params: TableSearchParams, eventSlugs: readonly string[], view: TableView): TableFilters {
  return {
    q: (one(params.q) ?? '').trim().slice(0, 300),
    side: choice(one(params.side), ['all', ...SIDES], 'all'),
    channel: choice(one(params.channel), ['all', 'none', ...DELIVERY_CHANNELS], 'all'),
    status: choice(one(params.status), ['all', 'waiting', 'coming', 'declined', 'not_sent', 'needs_phone'], 'all'),
    state: choice(one(params.state), ['all', ...DELIVERY_STATES, 'needs_phone'], 'all'),
    source: choice(one(params.source), ['all', 'none', ...RSVP_SOURCES], 'all'),
    event: choice(one(params.event), ['all', ...eventSlugs], 'all'),
    phone: choice(one(params.phone), ['all', 'present', 'missing', 'needs_phone'], 'all'),
    opened: choice(one(params.opened), ['all', 'yes', 'no'], 'all'),
    sort: choice(one(params.sort), TABLE_SORT_OPTIONS[view].map(option => option.value), 'name'),
    direction: choice(one(params.direction), ['asc', 'desc'], 'asc'),
  };
}

export function tableQuery(filters: TableFilters, overrides: Partial<TableFilters> = {}): string {
  const selected = { ...filters, ...overrides };
  const query = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS) as (keyof TableFilters)[]) {
    if (selected[key] !== DEFAULTS[key]) query.set(key, selected[key]);
  }
  return query.toString();
}

export function tableHref(path: string, filters: TableFilters, overrides: Partial<TableFilters> = {}): string {
  const query = tableQuery(filters, overrides);
  return path + (query ? '?' + query : '');
}

export function scopedEventSlugs(row: GuestListRow, filters: Pick<TableFilters, 'event'>): string[] {
  return row.eventSlugs.filter(slug => filters.event === 'all' || slug === filters.event);
}

export function scopedReplies(row: GuestListRow, filters: Pick<TableFilters, 'event'>) {
  const invited = new Set(scopedEventSlugs(row, filters));
  return row.rsvps.filter(reply => invited.has(reply.eventSlug));
}

function folded(value: string): string {
  // Strip Latin accents without removing meaningful Sinhala/Tamil vowel marks.
  return value.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').toLocaleLowerCase();
}

function matchesSearch(row: GuestListRow, query: string): boolean {
  if (!query) return true;
  const phoneDigits = splitPhoneNumbers(row.guest.phone).map(phone => phone.replace(/\D/g, ''));
  if (/^[+\d\s().-]+$/.test(query) && /\d/.test(query)) {
    const digits = query.replace(/\D/g, '');
    const normalized = normalizePhone(query)?.replace(/\D/g, '') ?? digits;
    if (phoneDigits.some(phone => phone.includes(digits) || phone.includes(normalized))) return true;
  }
  const haystack = folded([
    row.guest.displayName, row.guest.cardName, row.guest.sortName,
    row.guest.phone ?? '', row.guest.notes ?? '',
    ...row.rsvps.map(reply => reply.attendeeNames ?? ''),
  ].join(' '));
  return folded(query).split(/\s+/).every(word =>
    haystack.includes(word) || (/^\+?\d+$/.test(word) && phoneDigits.some(phone => phone.includes(word.replace(/\D/g, '')))),
  );
}

function invitationState(row: GuestListRow) {
  return deliveryState({ channels: row.channels, firstOpen: row.firstOpen, hasResponse: row.rsvps.length > 0 });
}

function needsPhone(row: GuestListRow): boolean {
  return deliveryNeedsPhone({ phone: row.guest.phone, channels: row.channels });
}

function matchesFilters(row: GuestListRow, filters: TableFilters): boolean {
  if (!matchesSearch(row, filters.q)) return false;
  if (filters.side !== 'all' && row.guest.side !== filters.side) return false;
  if (filters.channel === 'none' ? row.channels.length > 0
    : filters.channel !== 'all' && !row.channels.some(channel => channel.channel === filters.channel)) return false;
  const phonePresent = splitPhoneNumbers(row.guest.phone).length > 0;
  if (filters.phone === 'present' && !phonePresent || filters.phone === 'missing' && phonePresent ||
      filters.phone === 'needs_phone' && !needsPhone(row)) return false;
  if (filters.opened === 'yes' && !row.firstOpen || filters.opened === 'no' && row.firstOpen) return false;
  if (filters.state === 'needs_phone' ? !needsPhone(row)
    : filters.state !== 'all' && invitationState(row) !== filters.state) return false;
  if (filters.status === 'not_sent' && invitationState(row) !== 'not_sent' ||
      filters.status === 'needs_phone' && !needsPhone(row)) return false;

  const events = scopedEventSlugs(row, filters);
  if (filters.event !== 'all' && !events.length) return false;
  const replies = scopedReplies(row, filters);
  if (filters.source === 'none' && replies.length > 0) return false;
  if (filters.status === 'waiting') {
    if (filters.source !== 'all' && filters.source !== 'none') return false;
    return events.some(slug => !replies.some(reply => reply.eventSlug === slug));
  }
  const responseStatus = filters.status === 'coming' || filters.status === 'declined';
  const specificSource = filters.source !== 'all' && filters.source !== 'none';
  if (responseStatus || specificSource) {
    return replies.some(reply =>
      (!responseStatus || reply.attending === (filters.status === 'coming')) &&
      (!specificSource || reply.source === filters.source) && filters.source !== 'none',
    );
  }
  return true;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const sideLabels: Record<Side, string> = { bride: "Bride's family", groom: "Groom's family", both: 'Both families' };
const channelLabels: Record<DeliveryChannelName, string> = {
  whatsapp: 'WhatsApp', print: 'Printed card', instagram: 'Instagram', messenger: 'Messenger',
  wechat: 'WeChat', in_person: 'In person',
};
const sourceLabels: Record<RsvpSource, string> = { self: 'Online', phone: 'By phone', admin: 'Entered by family' };
type SortValue = string | number | null;

function dateValue(value: Date | undefined | null): number | null {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function sortedText(values: readonly string[]): string | null {
  const nonempty = values.map(value => value.trim()).filter(Boolean);
  return nonempty.length ? [...new Set(nonempty)].sort(collator.compare).join(', ') : null;
}

function sortValue(row: GuestListRow, filters: TableFilters): SortValue {
  const replies = scopedReplies(row, filters);
  switch (filters.sort) {
    case 'name': return row.guest.sortName || row.guest.displayName;
    case 'side': return sideLabels[row.guest.side];
    case 'phone': return sortedText(splitPhoneNumbers(row.guest.phone));
    case 'reserved': return row.guest.maxPartySize;
    case 'channels': return sortedText(row.channels.map(channel => channelLabels[channel.channel]));
    case 'state': return DELIVERY_STATES.indexOf(invitationState(row));
    case 'response': {
      if (replies.some(reply => reply.attending)) return 2;
      if (scopedEventSlugs(row, filters).some(slug => !replies.some(reply => reply.eventSlug === slug))) return 0;
      return replies.length ? 1 : null;
    }
    case 'attending': return replies.length ? replies.reduce((sum, reply) => sum + (reply.attending ? reply.partyCount : 0), 0) : null;
    case 'attendees': return sortedText(replies.map(reply => reply.attendeeNames ?? ''));
    case 'source': return sortedText(replies.map(reply => sourceLabels[reply.source]));
    case 'replied': {
      const dates = replies.map(reply => dateValue(reply.updatedAt)).filter((value): value is number => value !== null);
      return dates.length ? Math.max(...dates) : null;
    }
    case 'opened': return dateValue(row.lastOpen);
    case 'created': return dateValue(row.guest.createdAt);
    case 'updated': return dateValue(row.guest.updatedAt);
  }
}

/** Read-only projection: stable ordering with empty values last in both directions. */
export function filterAndSortGuests(rows: readonly GuestListRow[], filters: TableFilters): GuestListRow[] {
  const selected = rows.filter(row => matchesFilters(row, filters));
  const values = new Map(selected.map(row => [row, sortValue(row, filters)]));
  return selected.sort((a, b) => {
    const left = values.get(a) ?? null;
    const right = values.get(b) ?? null;
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    if (left !== null && right !== null) {
      const order = typeof left === 'number' && typeof right === 'number'
        ? left - right : collator.compare(String(left), String(right));
      if (order) return filters.direction === 'asc' ? order : -order;
    }
    return collator.compare(a.guest.sortName || a.guest.displayName, b.guest.sortName || b.guest.displayName) ||
      a.guest.id.localeCompare(b.guest.id);
  });
}
