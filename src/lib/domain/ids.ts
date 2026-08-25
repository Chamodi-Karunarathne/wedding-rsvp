import { customAlphabet } from 'nanoid';

/**
 * PERMANENT. Token and short-code generation.
 *
 * The short code is PRINTED ON PAPER and typed by hand, sometimes by someone
 * elderly, on a phone keyboard, from a card held at arm's length. Its alphabet
 * is chosen accordingly and must not change once cards are printed.
 */

/* -------------------------------------------------------------------------- */
/* token - appears in links, never typed                                      */
/* -------------------------------------------------------------------------- */

const TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const TOKEN_LENGTH = 10;

const nanoToken = customAlphabet(TOKEN_ALPHABET, TOKEN_LENGTH);

export function generateToken(): string {
  return nanoToken();
}

export function isValidToken(value: string): boolean {
  if (value.length !== TOKEN_LENGTH) return false;
  for (const ch of value) if (!TOKEN_ALPHABET.includes(ch)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* short code - printed on the card, typed by humans                          */
/* -------------------------------------------------------------------------- */

/**
 * 24 characters. Derived by removing, from A-Z0-9:
 *   - all vowels A E I O U, so a code can never spell a word
 *   - one of each confusable pair: 0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B
 *
 * 24^6 = 191,102,976, so 500 guests collide with vanishing probability - but
 * insertion still retries on unique violation rather than trusting the odds.
 */
export const SHORT_CODE_ALPHABET = '3479BCDFGHJKMNPQRSTVWXYZ';
export const SHORT_CODE_LENGTH = 6;

const nanoShortCode = customAlphabet(SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH);

export function generateShortCode(): string {
  return nanoShortCode();
}

/**
 * Characters a guest plausibly types that cannot be in a real code, mapped to
 * the single character they must have meant. Only unambiguous cases are here:
 * 'O' is deliberately absent because it could be Q, D or a misread 0.
 */
const CONFUSABLE_FIXUPS: Record<string, string> = {
  '2': 'Z',
  '5': 'S',
  '6': 'G',
  '8': 'B',
  U: 'V',
};

/**
 * Accepts what a human actually types - lowercase, spaces, a dash in the
 * middle, a lookalike character - and returns the canonical code.
 * Does not guarantee the result is well-formed; call isValidShortCode after.
 */
export function normalizeShortCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (ch < '0' || (ch > '9' && ch < 'A') || ch > 'Z') continue; // drop punctuation/space
    out += CONFUSABLE_FIXUPS[ch] ?? ch;
  }
  return out;
}

export function isValidShortCode(value: string): boolean {
  if (value.length !== SHORT_CODE_LENGTH) return false;
  for (const ch of value) if (!SHORT_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
