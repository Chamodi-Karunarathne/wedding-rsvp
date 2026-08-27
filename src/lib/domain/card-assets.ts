import manifest from '../../../public/card/manifest.json' with { type: 'json' };

/**
 * PERMANENT. How the card artwork is referenced.
 *
 * The files in public/card/ are served with a one-year immutable cache
 * header, which is only safe because these URLs carry the content hash that
 * `pnpm assets:optimize` stamps into manifest.json. Artwork arrives from
 * Illustrator iteratively and gets re-exported under the same filename; with
 * a bare path, the second export would never reach anyone who had loaded the
 * first. Same trap as the WhatsApp preview cache, different costume.
 *
 * Referencing an asset that is not in the manifest throws, so a typo fails
 * the moment the page renders rather than showing a guest an empty frame.
 */

const ASSETS: readonly string[] = manifest.assets;
const VERSION: string = manifest.version;

export function cardAssetNames(): readonly string[] {
  return ASSETS;
}

export function cardAsset(name: string): string {
  if (!ASSETS.includes(name)) {
    throw new Error(
      `"${name}" is not listed in public/card/manifest.json. ` +
        `Known assets: ${ASSETS.length === 0 ? '(none yet)' : ASSETS.join(', ')}. ` +
        'Add it to the manifest and run `pnpm assets:optimize`.',
    );
  }
  return `/card/${name}?v=${VERSION}`;
}
