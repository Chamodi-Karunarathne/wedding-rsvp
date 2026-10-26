/**
 * PERMANENT and load-bearing for the one metric this site collects.
 *
 * When an invitation is sent over WhatsApp, Meta fetches the link immediately
 * to build the preview card. Recorded naively, that marks every guest as
 * having opened their invitation at the moment it was sent, and guest_opens
 * becomes worthless. Same for anything else that unfurls links.
 */

const CRAWLER_PATTERNS = [
  'facebookexternalhit',
  'facebookcatalog',
  'meta-externalagent',
  'twitterbot',
  'slackbot',
  'slack-imgproxy',
  'telegrambot',
  'discordbot',
  'linkedinbot',
  'skypeuripreview',
  'googlebot',
  'bingbot',
  'applebot',
  'embedly',
  'redditbot',
  'pinterest',
  'vercel-screenshot',
  'headlesschrome',
  'bot',
  'crawler',
  'spider',
  'preview',
] as const;

/** Messaging apps also add their name to real embedded browser user agents.
 * A browser engine does not excuse a known bot marker, but the app name alone
 * must not discard a guest's visible visit from that embedded browser. */
export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no UA at all is not a person with a browser
  const ua = userAgent.toLowerCase();
  if (CRAWLER_PATTERNS.some((pattern) => ua.includes(pattern))) return true;
  const messagingApp = ua.includes('whatsapp') || ua.includes('viber');
  const browserEngine = ua.includes('mozilla/5.0') &&
    (ua.includes('applewebkit/') || ua.includes('gecko/'));
  return messagingApp && !browserEngine;
}
