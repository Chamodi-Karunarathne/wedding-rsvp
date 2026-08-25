import { ok, serviceError, type Result, type ServiceError } from './result.ts';

/**
 * PERMANENT. The RSVP invariants live here, not in the UI. The client is not
 * trusted: everything below is re-derived server-side from the guest's own
 * record, whatever the request body claimed.
 */

export type RsvpIntent = {
  eventSlug: string;
  attending: boolean;
  partyCount: number;
  attendeeNames?: string | null;
};

export type NormalizedRsvp = {
  eventSlug: string;
  attending: boolean;
  partyCount: number;
  attendeeNames: string | null;
};

/**
 * How many people this guest may bring to this event.
 *
 * Today that is a single per-guest number. This function exists so that if a
 * per-event allowance is ever needed, adding a nullable
 * invitations.max_party_size and preferring it here is the ONLY change
 * required - no caller decides this for itself.
 */
export function partyAllowanceFor(
  guest: { maxPartySize: number },
  _event: { slug: string },
): number {
  return guest.maxPartySize;
}

function cleanNames(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Applies every party-size invariant and returns a row that is safe to write.
 *
 * Declining always normalizes to a party of zero with no attendee names,
 * regardless of what the client sent - so a guest who fills in the form,
 * changes their mind and unticks "attending" does not leave a stale count
 * behind.
 */
export function normalizeRsvp(
  intent: RsvpIntent,
  allowance: number,
  eventLabel: string,
): Result<NormalizedRsvp, ServiceError> {
  if (!intent.attending) {
    return ok({
      eventSlug: intent.eventSlug,
      attending: false,
      partyCount: 0,
      attendeeNames: null,
    });
  }

  if (!Number.isInteger(intent.partyCount)) {
    return serviceError(
      'validation',
      `Party size for ${eventLabel} must be a whole number.`,
      'partyCount',
    );
  }

  if (intent.partyCount < 1) {
    return serviceError(
      'validation',
      `Party size for ${eventLabel} must be at least 1 when attending. ` +
        'To decline, set attending to false instead.',
      'partyCount',
    );
  }

  if (intent.partyCount > allowance) {
    return serviceError(
      'validation',
      `Your invitation to ${eventLabel} covers up to ${allowance} ` +
        `${allowance === 1 ? 'person' : 'people'}, but ${intent.partyCount} were requested. ` +
        'Please contact us directly if you need more.',
      'partyCount',
    );
  }

  return ok({
    eventSlug: intent.eventSlug,
    attending: true,
    partyCount: intent.partyCount,
    attendeeNames: cleanNames(intent.attendeeNames),
  });
}

/**
 * Message handling for the RSVP payload.
 *   undefined -> leave any existing message untouched
 *   ""        -> the guest cleared the field; delete the row
 *   text      -> upsert
 */
export type MessageAction =
  | { kind: 'ignore' }
  | { kind: 'delete' }
  | { kind: 'upsert'; body: string };

export function messageAction(message: string | null | undefined): MessageAction {
  if (message === undefined || message === null) return { kind: 'ignore' };
  const trimmed = message.trim();
  return trimmed === '' ? { kind: 'delete' } : { kind: 'upsert', body: trimmed };
}
