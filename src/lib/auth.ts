/**
 * PERMANENT. Admin authentication, for three people who share one password.
 *
 * No users table, no sessions table, no NextAuth. A signed, httpOnly cookie
 * carrying nothing but an expiry is enough, and there is no server-side state
 * to keep in sync.
 *
 * Uses Web Crypto throughout rather than node:crypto so the exact same code
 * runs in the proxy and in a route handler, on any runtime Next may use.
 */

export const SESSION_COOKIE = 'wedding_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const encoder = new TextEncoder();

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET is missing or too short (need >= 16 chars).');
  }
  return value;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Cookie value is `<expiryMs>.<hmac>`. Nothing secret is carried in it. */
export async function createSessionCookie(now = Date.now()): Promise<string> {
  const payload = String(now + SESSION_TTL_MS);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionCookie(
  value: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return false;

  const payload = value.slice(0, separator);
  const signature = fromBase64Url(value.slice(separator + 1));
  if (!signature) return false;

  // subtle.verify is constant-time, so a forged signature leaks no timing.
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(),
    signature as unknown as ArrayBuffer,
    encoder.encode(payload),
  );
  if (!valid) return false;

  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > now;
}

/**
 * Compares the submitted password against ADMIN_PASSWORD in constant time.
 *
 * Both sides are SHA-256'd first so the comparison is over two fixed-length
 * digests - otherwise the length of the real password leaks through the
 * comparison, and unequal lengths cannot be compared byte-wise at all.
 */
export async function verifyAdminPassword(submitted: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set.');

  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(submitted)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const left = new Uint8Array(a);
  const right = new Uint8Array(b);

  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}
