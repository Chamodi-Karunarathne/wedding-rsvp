/**
 * PERMANENT and load-bearing for the one metric this site collects.
 *
 * When an invitation is sent over WhatsApp, Meta fetches the link immediately
 * to build the preview card. Recorded naively, that marks every guest as
 * having opened their invitation at the moment it was sent, and guest_opens
 * becomes worthless. Same for anything else that unfurls links.
 */

const CRAWLER_PATTERNS = [
  'whatsapp',
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
  'viber',
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

/** Conservative by design: a false positive loses one open, a false negative
 *  corrupts the metric for every guest at once. */
export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no UA at all is not a person with a browser
  const ua = userAgent.toLowerCase();
  return CRAWLER_PATTERNS.some((pattern) => ua.includes(pattern));
}
