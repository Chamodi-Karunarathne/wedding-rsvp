import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Build gate for the card artwork. Runs before `next build`.
 *
 * Two failures it exists to prevent, both of which are silent otherwise:
 * an asset the design references that never arrived, and a 4 MB Illustrator
 * export nobody ran through SVGO. Neither shows up in a type check, and the
 * first one a guest would notice is an empty rectangle on their invitation.
 */

const CARD_DIR = join('public', 'card');
const MANIFEST_PATH = join(CARD_DIR, 'manifest.json');

/** Per file, after optimization. An SVG this size is a traced bitmap. */
const MAX_BYTES = 150 * 1024;

type Manifest = { version?: string; assets?: unknown };

function fail(message: string): never {
  console.error(`\nCard assets: ${message}\n`);
  process.exit(1);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (!existsSync(MANIFEST_PATH)) {
  fail(
    `${MANIFEST_PATH} is missing.\n` +
      'It lists the artwork the card design expects. Restore it from git, or create it with\n' +
      '{ "version": "empty", "assets": [] } if there is genuinely no artwork yet.',
  );
}

let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
} catch (error) {
  fail(`${MANIFEST_PATH} is not valid JSON: ${error instanceof Error ? error.message : error}`);
}

const assets = manifest.assets;
if (!Array.isArray(assets) || assets.some((entry) => typeof entry !== 'string')) {
  fail(`${MANIFEST_PATH} needs an "assets" array of filenames, for example ["frame.svg"].`);
}

const listed = assets as string[];
const problems: string[] = [];

for (const name of listed) {
  const path = join(CARD_DIR, name);

  if (!existsSync(path)) {
    problems.push(
      `  ${name} is listed in manifest.json but not in ${CARD_DIR}.\n` +
        `    Either the export has not arrived yet, or the filename differs.`,
    );
    continue;
  }

  const bytes = statSync(path).size;
  if (bytes > MAX_BYTES) {
    problems.push(
      `  ${name} is ${kb(bytes)}, over the ${kb(MAX_BYTES)} ceiling.\n` +
        `    Run \`pnpm assets:optimize\`. If it is still too big afterwards the export\n` +
        `    probably contains a traced bitmap or an unflattened effect.`,
    );
  }
}

if (problems.length > 0) {
  fail(`${problems.length} problem(s) with the card artwork:\n\n${problems.join('\n')}`);
}

// Present but unlisted: not a failure, but it will not be checked and it has
// no cache-busting version behind it.
const onDisk = existsSync(CARD_DIR)
  ? readdirSync(CARD_DIR).filter((name) => name.toLowerCase().endsWith('.svg'))
  : [];
const unlisted = onDisk.filter((name) => !listed.includes(name));

if (unlisted.length > 0) {
  console.warn(
    `Card assets: ${unlisted.length} file(s) in ${CARD_DIR} are not listed in manifest.json ` +
      `(${unlisted.join(', ')}). Add them so the build checks for them.`,
  );
}

console.log(
  listed.length === 0
    ? 'Card assets: none expected yet (manifest.json lists no assets).'
    : `Card assets: ${listed.length} file(s) present and under ${kb(MAX_BYTES)}.`,
);
