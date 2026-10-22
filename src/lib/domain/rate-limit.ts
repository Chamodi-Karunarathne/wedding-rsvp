import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export type RateLimitPolicy = { scope: string; limit: number; windowSeconds: number };
export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };
export type RateLimitEntry = { policy: RateLimitPolicy; identifier: string };
export type RateLimitStore = {
  consume(policy: RateLimitPolicy, identifier: string): Promise<RateLimitDecision>;
  /** Spend every allowance atomically, or retain none of the attempted increments. */
  consumeAll(entries: readonly RateLimitEntry[]): Promise<RateLimitDecision>;
};

/** Global buckets also bound the number of new IP/token records an endpoint can create. */
export const PUBLIC_RATE_LIMITS = {
  loginGlobal: { scope: 'login-global', limit: 100, windowSeconds: 15 * 60 },
  loginIp: { scope: 'login-ip', limit: 10, windowSeconds: 15 * 60 },
  rsvpGlobal: { scope: 'rsvp-global', limit: 300, windowSeconds: 60 },
  rsvpIp: { scope: 'rsvp-ip', limit: 60, windowSeconds: 60 },
  rsvpToken: { scope: 'rsvp-token', limit: 10, windowSeconds: 10 * 60 },
  openGlobal: { scope: 'open-global', limit: 600, windowSeconds: 60 },
  openIp: { scope: 'open-ip', limit: 120, windowSeconds: 60 },
  openToken: { scope: 'open-token', limit: 30, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Persist neither a password, an invitation token, nor an IP address. */
export function hashRateLimitKey(scope: string, identifier: string): string {
  return createHash('sha256').update(scope).update('\0').update(identifier).digest('hex');
}

/**
 * Trust no forwarded address by default. Configure this only for a header
 * overwritten by the deployment's trusted ingress, with direct access blocked.
 * A chain such as X-Forwarded-For is deliberately not parsed: an unverified
 * position in that chain would let clients choose a fresh identity per attempt.
 */
export function clientRateLimitIdentity(headers: Headers, trustedHeader?: string): string {
  if (!trustedHeader || !/^[a-z0-9-]+$/i.test(trustedHeader)) return 'shared';
  const address = headers.get(trustedHeader)?.trim();
  if (!address || !isIP(address)) return 'shared';
  // Canonicalize IPv6 spelling so equivalent addresses share a counter.
  try {
    const canonical = isIP(address) === 6
      ? new URL(`http://[${address}]/`).hostname.toLowerCase()
      : address;
    return `ip:${canonical}`;
  } catch {
    // Node accepts zone-qualified IPv6 addresses which URL cannot normalize.
    return 'shared';
  }
}
