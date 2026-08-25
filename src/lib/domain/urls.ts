/**
 * PERMANENT, and partly set in ink.
 *
 * The short-code URL built here is what the QR code on the printed invitation
 * encodes. Once cards are printed, this path shape and the origin behind it
 * can never change. Keep both the QR generator and the /c redirect reading
 * from this file so they cannot drift apart.
 */

/** Reads NEXT_PUBLIC_SITE_URL, without a trailing slash. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set. It is baked into every printed QR code, ' +
        'so it must be the final production origin before cards go to print.',
    );
  }
  return raw.replace(/\/+$/, '');
}

export function invitationPath(token: string): string {
  return `/i/${token}`;
}

export function shortCodePath(code: string): string {
  return `/c/${code}`;
}

export function qrPath(code: string): string {
  return `/api/qr/${code}.svg`;
}

export function invitationUrl(token: string, origin = siteOrigin()): string {
  return `${origin}${invitationPath(token)}`;
}

/**
 * THE PRINTED URL. This exact string is what a guest's QR code resolves to,
 * and it deliberately uses the short code rather than the token so that
 * scanning and typing lead to the same place.
 */
export function shortCodeUrl(code: string, origin = siteOrigin()): string {
  return `${origin}${shortCodePath(code)}`;
}

/** Absolute URL of the QR image itself, for the print export's mail merge. */
export function qrUrl(code: string, origin = siteOrigin()): string {
  return `${origin}${qrPath(code)}`;
}

/** wa.me deep link with the invitation message pre-filled. */
export function whatsappSendUrl(phoneE164: string, message: string): string {
  const number = phoneE164.replace(/[^\d]/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
