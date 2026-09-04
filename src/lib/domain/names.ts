/**
 * PERMANENT. Pure, dependency-free, and unit tested.
 *
 * The guest's name is set in a display serif inside a fixed-width card, so a
 * long one breaks the layout rather than wrapping gracefully. The rule is a
 * warning, never a block: "The Fernando Family" is the family's call to make,
 * not the software's.
 */

/**
 * Where a name starts being a layout risk.
 *
 * Counted in code points rather than UTF-16 units, so a Sinhala name is not
 * penalised for surrogate pairs. Neither measures rendered width - that
 * depends on the face and the glyphs - which is exactly why this warns
 * instead of refusing.
 */
export const DISPLAY_NAME_SOFT_LIMIT = 28;

export function displayNameLength(name: string): number {
  return [...name].length;
}

export function isDisplayNameLong(name: string): boolean {
  return displayNameLength(name) > DISPLAY_NAME_SOFT_LIMIT;
}

/**
 * What the card renders. The single definition of the fallback rule; the
 * services mapper is its only caller, so nothing above the boundary decides
 * this for itself.
 */
export function resolveCardName(displayName: string, fallback: string | null): string {
  const trimmed = fallback?.trim();
  return trimmed ? trimmed : displayName;
}

/**
 * How much to shrink the envelope name so a long one fits its line.
 *
 * clamp() alone cannot do this: it scales with the container and knows
 * nothing about how many characters it has been asked to fit, so a
 * forty-character household overflows at exactly the size a short one looks
 * right at. This is the length half of the answer; the CSS multiplies it by a
 * clamp() that handles the viewport half.
 *
 * Floored at 0.55 - past that the name is too small to read on a phone, and
 * the honest fix is a shorter display_name_fallback, which admin already
 * warns about above DISPLAY_NAME_SOFT_LIMIT.
 */
export const ENVELOPE_COMFORTABLE_LENGTH = 18;
export const ENVELOPE_MIN_SCALE = 0.55;

export function envelopeNameScale(name: string): number {
  const length = displayNameLength(name);
  if (length <= ENVELOPE_COMFORTABLE_LENGTH) return 1;
  return Math.max(ENVELOPE_MIN_SCALE, ENVELOPE_COMFORTABLE_LENGTH / length);
}
