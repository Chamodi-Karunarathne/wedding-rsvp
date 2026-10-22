import {
  DEFAULT_MESSAGING_CONFIG,
  DEFAULT_PHASE_CONFIG,
  DEFAULT_TIMEZONE,
  EVENT_DATE,
  type AppConfig,
} from '../lib/domain/config.ts';
import type { NewEventRow } from './schema.ts';

/** The real wedding foundations; development guest fixtures stay in seed.ts. */
export const PRODUCTION_EVENT = {
  slug: 'ceremony',
  name: 'Poruwa Ceremony',
  startsAt: EVENT_DATE,
  venueName: 'Lumina Ballroom, Cinnamon Life',
  // Confirm the exact street address with the venue before invitations go out.
  venueAddress: 'Cinnamon Life, Colombo',
  mapUrl: 'https://maps.google.com/?q=Cinnamon+Life+Colombo',
  dressCode: null,
  sortOrder: 1,
} as const satisfies NewEventRow;

export const PRODUCTION_CONFIG: AppConfig = {
  phase: DEFAULT_PHASE_CONFIG,
  site: {
    // Keep these names consistent with the outlined lettering in card-text.svg.
    brideName: 'Madushani',
    groomName: 'Charith',
    timezone: DEFAULT_TIMEZONE,
    rsvpContacts: [
      { name: 'Masha', phone: '075 9500073', side: 'Bride' },
      { name: 'Shirani', phone: '077 3913737', side: 'Groom' },
    ],
  },
  messaging: DEFAULT_MESSAGING_CONFIG,
};
