import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { optimize } from 'svgo';

/**
 * Rewrites every SVG in public/card/ through SVGO, in place.
 *
 * Coordinate precision is the setting that matters here: Illustrator writes
 * paths at six or more decimal places, and on artwork of this kind rounding
 * to two removes a large fraction of the bytes while staying far below what
 * anyone can see at print or screen size.
 *
 * It also stamps manifest.json with a hash of the optimized contents. Card
 * assets are served with immutable cache headers, so that version is what a
 * re-export under the same filename has to change in order to reach anyone
 * who already loaded the old one.
 *
 * Safe to re-run: SVGO is idempotent on its own output.
 */

const CARD_DIR = join('public', 'card');
const MANIFEST_PATH = join(CARD_DIR, 'manifest.json');

/** Two decimal places, as agreed. Absolute, not relative to the viewBox. */
const FLOAT_PRECISION = 2;

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

  const result = optimize(original, {
    path,
    multipass: true,
    floatPrecision: FLOAT_PRECISION,
    plugins: [{ name: 'preset-default' }],
  });

  writeFileSync(path, result.data, 'utf8');

  const originalBytes = Buffer.byteLength(original, 'utf8');
  const optimizedBytes = Buffer.byteLength(result.data, 'utf8');
  before += originalBytes;
  after += optimizedBytes;

  hash.update(name);
  hash.update(result.data);

  const saved = originalBytes === 0 ? 0 : (1 - optimizedBytes / originalBytes) * 100;
  console.log(`  ${name}: ${kb(originalBytes)} -> ${kb(optimizedBytes)} (-${saved.toFixed(0)}%)`);
}

if (files.length > 0) {
  const saved = before === 0 ? 0 : (1 - after / before) * 100;
  console.log(`\n${files.length} file(s): ${kb(before)} -> ${kb(after)} (-${saved.toFixed(0)}%)`);
}

/* --- stamp the manifest ---------------------------------------------- */

if (!existsSync(MANIFEST_PATH)) {
  console.error(`\n${MANIFEST_PATH} is missing, so there is nothing to stamp.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  version?: string;
  assets?: string[];
};

const version = files.length === 0 ? 'empty' : hash.digest('hex').slice(0, 12);

if (manifest.version !== version) {
  manifest.version = version;
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Stamped manifest.json with version ${version}.`);
} else {
  console.log(`manifest.json already at version ${version}.`);
}

const listed = manifest.assets ?? [];
const unlisted = files.filter((name) => !listed.includes(name));

if (unlisted.length > 0) {
  console.log(
    `\n${unlisted.length} file(s) are not listed in manifest.json: ${unlisted.join(', ')}.\n` +
      'Add them to the "assets" array so the build fails if one ever goes missing.',
  );
}
