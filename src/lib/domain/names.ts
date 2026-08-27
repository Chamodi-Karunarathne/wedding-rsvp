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
