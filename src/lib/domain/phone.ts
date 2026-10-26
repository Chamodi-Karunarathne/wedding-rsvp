/**
 * PERMANENT. Phone normalization, used when saving guest details, for CSV
 * import de-duplication, and for building WhatsApp links.
 *
 * This matters more than it looks: the import key is (sort_name, phone), and
 * "077 123 4567", "+94 77 123 4567" and "0094771234567" are the same person.
 * Without normalization the import is not idempotent and re-running it
 * silently duplicates guests.
 */

const DEFAULT_COUNTRY_CODE = '94'; // Sri Lanka
export const PHONE_LIST_MAX_LENGTH = 500;

const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
const USABLE_PHONE = /^\+[1-9]\d{6,14}$/;

/**
 * Returns E.164-ish digits with a leading '+', or null for empty input.
 * Anything unrecognisable is returned as its own digits rather than dropped,
 * so two identical unrecognisable numbers still compare equal.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  if (hadPlus) return `+${digits}`;

  // 0094xxxxxxxxx -> international prefix
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;

  // 0771234567 -> local trunk prefix, 10 digits
  if (digits.startsWith('0') && digits.length === 10) {
    return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  // 771234567 -> bare subscriber number, 9 digits
  if (digits.length === 9) return `+${DEFAULT_COUNTRY_CODE}${digits}`;

  // Already carries the country code.
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 11) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

/** Normalize each comma-separated number independently, retaining first-use order. */
export function splitPhoneNumbers(raw: string | null | undefined): string[] {
  const phones = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const value = part.trim();
    if (!value || !PHONE_CHARACTERS.test(value)) continue;
    const phone = normalizePhone(value);
    if (phone && USABLE_PHONE.test(phone)) phones.add(phone);
  }
  return [...phones];
}

/** Canonical storage keeps compatibility with the existing nullable text column. */
export function normalizePhones(raw: string | null | undefined): string | null {
  const phones = splitPhoneNumbers(raw);
  return phones.length ? phones.join(', ') : null;
}

/** Empty is allowed, including WhatsApp invites that need a persistent warning. */
export function phoneListError(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  if (raw.length > PHONE_LIST_MAX_LENGTH) return `Phone numbers must contain at most ${PHONE_LIST_MAX_LENGTH} characters.`;
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (!value) continue;
    const phone = normalizePhone(value);
    if (value.length > 40 || !PHONE_CHARACTERS.test(value) || !phone || !USABLE_PHONE.test(phone)) {
      return 'Enter valid phone numbers separated by commas, for example 0771234567, +94771234568.';
    }
  }
  if ((normalizePhones(raw)?.length ?? 0) > PHONE_LIST_MAX_LENGTH) {
    return `Normalized phone numbers must contain at most ${PHONE_LIST_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * The de-duplication key for CSV import.
 *
 * A missing phone collapses to '' rather than staying null, because NULL never
 * equals NULL in SQL and two print-only guests with no phone would otherwise
 * never be recognised as the same row.
 */
export function importKey(sortName: string, phone: string | null | undefined): string {
  const name = sortName.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${name}\u0000${splitPhoneNumbers(phone).sort().join(',')}`;
}
