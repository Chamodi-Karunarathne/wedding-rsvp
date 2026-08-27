/**
 * PERMANENT, and partly set in ink.
 *
 * Nothing is printed any more - the cards do not reference the site - but the
 * origin is still permanent in practice: it is baked into every link already
 * sent over WhatsApp, and a message that has been delivered cannot be
 * reissued. Treat NEXT_PUBLIC_SITE_URL as unchangeable from the first send.
 */

/**
 * Strips trailing slashes. Applied to EVERY origin, not just the one read
 * from the environment: callers such as the send list pass an origin in, and
 * a trailing slash there would put "example.com//i/TOKEN" into a message.
 */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/** Reads NEXT_PUBLIC_SITE_URL, without a trailing slash. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set. It is baked into every invitation link ' +
        'sent over WhatsApp, so it must be the final production origin before ' +
        'the first message goes out.',
    );
  }
  return normalizeOrigin(raw);
}

export function invitationPath(token: string): string {
  return `/i/${token}`;
}

/** THE SENT URL. This exact string is what reaches a guest's phone. */
export function invitationUrl(token: string, origin = siteOrigin()): string {
  return `${normalizeOrigin(origin)}${invitationPath(token)}`;
}

/** wa.me deep link with the invitation message pre-filled. */
export function whatsappSendUrl(phoneE164: string, message: string): string {
  const number = phoneE164.replace(/[^\d]/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
