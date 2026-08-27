import { customAlphabet } from 'nanoid';

/**
 * PERMANENT. Invitation token generation.
 *
 * Every invitation is delivered digitally, so the token is the only
 * identifier a guest ever holds. It appears in links and is never typed by
 * hand - there was once a hand-typed short code for printed cards, removed
 * when the cards stopped referencing the site at all.
 */

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
