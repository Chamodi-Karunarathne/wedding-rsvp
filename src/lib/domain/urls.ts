import { normalizePhone } from './phone.ts';

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
  let url: URL;
  try {
    url = new URL(origin.trim().replace(/\/+$/, ''));
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute HTTPS origin.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS origin without credentials, a path, query or fragment. HTTP is allowed only for local development.');
  }
  return url.origin;
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

/**
 * Open WhatsApp with the exact invitation message pre-filled.
 * The wa.me shortener can replace non-BMP emoji during its desktop redirect;
 * going directly to its destination preserves Unicode for both web and app handoff.
 */
export function whatsappSendUrl(phoneE164: string, message: string): string {
  const number = (normalizePhone(phoneE164) ?? '').replace(/[^\d]/g, '');
  return `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`;
}
