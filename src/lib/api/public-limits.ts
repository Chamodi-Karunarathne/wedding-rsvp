import {
  clientRateLimitIdentity,
  PUBLIC_RATE_LIMITS,
  type RateLimitEntry,
  type RateLimitStore,
} from '../domain/rate-limit.ts';
import { postgresRateLimitStore } from '../services/rate-limits.ts';

type Options = { store?: RateLimitStore; trustedIpHeader?: string; logError?: () => void };

function limitedResponse(status: 429 | 503, retryAfterSeconds: number): Response {
  const unavailable = status === 503;
  return Response.json(
    { ok: false, error: {
      code: unavailable ? 'unavailable' : 'rate_limited',
      message: unavailable
        ? 'Replies and sign-in are temporarily unavailable. Please try again shortly.'
        : 'Too many attempts. Please wait before trying again.',
    } },
    { status, headers: { 'retry-after': String(retryAfterSeconds), 'cache-control': 'no-store' } },
  );
}

async function consume(
  policies: RateLimitEntry[],
  options: Options,
): Promise<Response | null> {
  const store = options.store ?? postgresRateLimitStore;
  try {
    const first = policies[0]!;
    const decision = policies.length === 1
      ? await store.consume(first.policy, first.identifier)
      : await store.consumeAll(policies);
    return decision.allowed ? null : limitedResponse(429, decision.retryAfterSeconds);
  } catch {
    // Missing migration or unavailable database must never disable enforcement.
    // Do not log the error object: driver errors can contain parameters/URLs.
    (options.logError ?? (() => console.error('Public rate limiter unavailable; verify database and migration 0004.')))();
    return limitedResponse(503, 30);
  }
}

/** Run before reading a public request body, including malformed submissions. */
export async function limitPublicRequest(
  request: Request,
  endpoint: 'login' | 'rsvp',
  options: Options = {},
): Promise<Response | null> {
  const identity = clientRateLimitIdentity(
    request.headers,
    options.trustedIpHeader ?? process.env.RATE_LIMIT_TRUSTED_IP_HEADER,
  );
  const global = endpoint === 'login' ? PUBLIC_RATE_LIMITS.loginGlobal : PUBLIC_RATE_LIMITS.rsvpGlobal;
  const ip = endpoint === 'login' ? PUBLIC_RATE_LIMITS.loginIp : PUBLIC_RATE_LIMITS.rsvpIp;
  return consume([
    { policy: ip, identifier: identity },
    { policy: global, identifier: 'all' },
  ], options);
}

/** Only call after validating the token field; the IP gate has already run. */
export function limitRsvpToken(token: string, options: Options = {}): Promise<Response | null> {
  return consume([{ policy: PUBLIC_RATE_LIMITS.rsvpToken, identifier: token }], options);
}
