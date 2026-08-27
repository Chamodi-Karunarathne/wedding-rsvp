import { getDb } from '@/db/client';
import { currentPhase, sectionOrder } from '@/lib/domain/phase';
import { serviceError, ok, type Result } from '@/lib/domain/result';
import { getConfig } from './config';
import {
  findGuestByToken,
  getGuestMessage,
  listInvitedEvents,
  listRsvpsForGuest,
} from './guests';
import type { InvitationView, RsvpView } from './types';

/**
 * PERMANENT. The single read behind /i/[token].
 *
 * app/(guest) calls exactly this and renders the result. It returns view
 * models only - no Drizzle rows, no query builders - which is what makes the
 * guest UI deletable without touching anything underneath.
 */
export async function loadInvitation(
  token: string,
  now = new Date(),
): Promise<Result<InvitationView>> {
  const db = getDb();

  const guest = await findGuestByToken(token, db);
  if (!guest) return serviceError('not_found', 'No invitation matches that link.', 'token');

  const [config, events, rsvpList, message] = await Promise.all([
    getConfig(db),
    listInvitedEvents(guest.id, db),
    listRsvpsForGuest(guest.id, db),
    getGuestMessage(guest.id, db),
  ]);

  const rsvps: Record<string, RsvpView> = {};
  for (const rsvp of rsvpList) rsvps[rsvp.eventSlug] = rsvp;

  const phase = currentPhase(now, config.phase);

  return ok({
    guest,
    events,
    rsvps,
    message,
    phase,
    rsvpDeadline: config.phase.rsvpDeadline,
    rsvpDeadlinePassed: now > config.phase.rsvpDeadline,
    sections: sectionOrder(phase),
    site: config.site,
  });
}
