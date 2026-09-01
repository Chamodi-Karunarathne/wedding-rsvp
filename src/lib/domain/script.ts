/**
 * PERMANENT. Pure, dependency-free, and unit tested.
 *
 * Which font stack a guest's name needs.
 *
 * The envelope is set in Linux Libertine, which has no Sinhala coverage at
 * all: a Sinhala name in it renders as tofu boxes, and the guests most likely
 * to be addressed in Sinhala are the ones least likely to report it as a bug
 * rather than assume their own phone is broken.
 *
 * Detection is by codepoint, never by the `language` column. Those are
 * different questions - a household set to `si` may be addressed in English,
 * and an `en` household may have a Sinhala name - and only one of them can be
 * answered by looking at the string that is actually about to be rendered.
 */

export const SCRIPTS = ['latin', 'sinhala', 'other'] as const;
export type NameScript = (typeof SCRIPTS)[number];

/** Sinhala, including the numerals and punctuation in the block. */
function isSinhala(code: number): boolean {
  return code >= 0x0d80 && code <= 0x0dff;
}

/**
 * Characters the Latin subset is expected to carry: Basic Latin, Latin-1
 * Supplement, Latin Extended-A and B, spacing modifiers, combining
 * diacriticals, and General Punctuation. Everything a Sri Lankan name written
 * in the Latin alphabet needs, including the accented forms.
 */
function isLatin(code: number): boolean {
  return (
    (code >= 0x0020 && code <= 0x024f) ||
    (code >= 0x02b0 && code <= 0x036f) ||
    (code >= 0x2000 && code <= 0x206f)
  );
}

/**
 * The script a name should be set in.
 *
 * 'other' is not a failure: it means a script neither the Latin subset nor a
 * Sinhala face covers - Tamil, most obviously, which is spoken by a great
 * many people on this island. It resolves to the same fallback stack, whose
 * last entry is a generic serif for exactly this reason.
 *
 * Mixed names resolve to the non-Latin script present, because one tofu box
 * ruins the line regardless of how much of it rendered.
 */
export function scriptOf(name: string): NameScript {
  let sinhala = false;

  for (const character of name) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (isLatin(code)) continue;
    if (isSinhala(code)) {
      sinhala = true;
      continue;
    }
    return 'other';
  }

  return sinhala ? 'sinhala' : 'latin';
}

/** True when Linux Libertine alone would leave holes in the name. */
export function needsUnicodeFallback(name: string): boolean {
  return scriptOf(name) !== 'latin';
}
