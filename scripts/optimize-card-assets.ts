import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { optimize } from 'svgo';

/**
 * Rewrites every SVG in public/card/ through SVGO, in place.
 *
 * Three things it is doing, in rough order of how much they matter:
 *
 * 1. Coordinate precision. Illustrator writes paths at six or more decimal
 *    places; rounding to two removes a large fraction of the bytes while
 *    staying far below what anyone can see at print or screen size.
 *
 * 2. Per-file id prefixing, which makes id collisions impossible by
 *    construction rather than by luck. Every export currently arrives with
 *    `id="Layer_2"` on the root, and card-text.svg alone carries 325 glyph
 *    ids of the form `font_2_37`. The moment two of these are inlined into
 *    one document those ids are in the same namespace, and the second one
 *    silently wins. Prefixing with the filename means they never can be.
 *
 * 3. Manifest maintenance. Anything new in the directory is added to
 *    manifest.json, and the manifest is stamped with a hash of the optimized
 *    contents. Card assets are served with immutable cache headers, so that
 *    version is what a re-export under the same filename has to change in
 *    order to reach anyone who already loaded the old one.
 *
 * Entries are never REMOVED from the manifest here. A file that vanishes
 * should fail the build, which is what scripts/check-card-assets.ts is for;
 * quietly dropping it from the list would be the one behaviour that defeats
 * the check entirely.
 *
 * Safe to re-run: SVGO is idempotent on its own output, and prefixing an
 * already-prefixed id is a no-op.
 */

const CARD_DIR = join('public', 'card');
const MANIFEST_PATH = join(CARD_DIR, 'manifest.json');

/** Two decimal places, as agreed. Absolute, not relative to the viewBox. */
const FLOAT_PRECISION = 2;

/**
 * The filename, reduced to characters that are legal in an id and in a CSS
 * selector. Illustrator will happily export "Artboard 1.svg", and a prefix
 * with a space in it produces ids nothing can reference.
 */
function idPrefix(file: string): string {
  return basename(file, '.svg').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Strips ids that nothing can possibly reference.
 *
 * card-text.svg arrives with 311 ids of the form `font_2_37`, one per glyph
 * outline, and the sequence only ever animates the twelve `line-*` groups.
 * They cost about 8 KB of markup and 311 attributes on a mid-range phone.
 *
 * ONLY runs when the file contains no internal references at all - no
 * `url(#...)`, no `href="#..."`, no `<use>`. A gradient, clip path or mask
 * would make this unsafe, so the check is the guard rather than a promise.
 */
function dropUnreferencedGlyphIds(svg: string): string {
  const references = /url\(#|href="#|<use/.test(svg);
  if (references) return svg;

  return svg.replace(/\s+id="[^"]*__font_[^"]*"/g, '');
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (!existsSync(CARD_DIR)) {
  console.log(`No ${CARD_DIR} directory. Nothing to optimize.`);
  process.exit(0);
}

const files = readdirSync(CARD_DIR)
  .filter((name) => name.toLowerCase().endsWith('.svg'))
  .sort();

if (files.length === 0) {
  console.log(`No SVGs in ${CARD_DIR} yet. Nothing to optimize.`);
}

let before = 0;
let after = 0;
const hash = createHash('sha256');

for (const name of files) {
  const path = join(CARD_DIR, name);
  const original = readFileSync(path, 'utf8');
  const prefix = idPrefix(name);

  const result = optimize(original, {
    path,
    multipass: true,
    floatPrecision: FLOAT_PRECISION,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // prefixIds does this instead, and does it without collisions.
            cleanupIds: false,
          },
          // NOTE: no removeViewBox override. SVGO 4 dropped removeViewBox
          // from preset-default, so the viewBox these files need for scaling
          // is already kept; overriding it here only produces a warning on
          // every pass. Verified in the output - all five keep their viewBox.
        },
      },
      // Sizing comes from the viewBox and whatever the page asks for.
      { name: 'removeDimensions' },
      // Strips the root id and the data-name breadcrumbs Illustrator leaves
      // on every group. Runs BEFORE prefixIds, so `Layer_2` disappears
      // rather than becoming `card-base__Layer_2`.
      { name: 'removeAttrs', params: { attrs: ['svg:id', '.*:data-name'] } },
      {
        name: 'prefixIds',
        params: {
          delim: '__',
          prefix,
          // These exports use presentation attributes and carry no classes at
          // all, so there is nothing to prefix. If a future export arrives
          // with Illustrator's `.cls-1` style block, turn this on: `.cls-1`
          // is the same name in every file it writes.
          prefixClassNames: false,
        },
      },
    ],
  });

  const cleaned = dropUnreferencedGlyphIds(result.data);
  writeFileSync(path, cleaned, 'utf8');

  const originalBytes = Buffer.byteLength(original, 'utf8');
  const optimizedBytes = Buffer.byteLength(cleaned, 'utf8');
  before += originalBytes;
  after += optimizedBytes;

  // Hash what was WRITTEN, not what SVGO returned: the glyph-id pass runs
  // after it, and a version that does not move when the bytes do is exactly
  // the stale-forever case the immutable cache headers make unrecoverable.
  hash.update(name);
  hash.update(cleaned);

  const saved = originalBytes === 0 ? 0 : (1 - optimizedBytes / originalBytes) * 100;
  console.log(`  ${name}: ${kb(originalBytes)} -> ${kb(optimizedBytes)} (-${saved.toFixed(0)}%)`);
}

if (files.length > 0) {
  const saved = before === 0 ? 0 : (1 - after / before) * 100;
  console.log(`\n${files.length} file(s): ${kb(before)} -> ${kb(after)} (-${saved.toFixed(0)}%)`);
}

/* --- manifest -------------------------------------------------------- */

if (!existsSync(MANIFEST_PATH)) {
  console.error(`\n${MANIFEST_PATH} is missing, so there is nothing to stamp.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  version?: string;
  assets?: string[];
};

const listed = manifest.assets ?? [];
const added = files.filter((name) => !listed.includes(name));
const version = files.length === 0 ? 'empty' : hash.digest('hex').slice(0, 12);

if (added.length > 0 || manifest.version !== version) {
  manifest.assets = [...listed, ...added].sort();
  manifest.version = version;
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (added.length > 0) {
    console.log(`\nAdded to manifest.json: ${added.join(', ')}`);
  }
  console.log(`Stamped manifest.json with version ${version}.`);
} else {
  console.log(`\nmanifest.json already lists all ${files.length} file(s) at version ${version}.`);
}

const missing = (manifest.assets ?? []).filter((name) => !files.includes(name));
if (missing.length > 0) {
  console.log(
    `\n${missing.length} file(s) are listed in manifest.json but not on disk: ` +
      `${missing.join(', ')}.\nLeft in place deliberately - \`pnpm build\` will fail on them ` +
      'until they arrive, or until you remove the entry by hand.',
  );
}
