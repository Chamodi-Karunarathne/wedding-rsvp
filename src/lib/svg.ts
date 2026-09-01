import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
// Relative, with the extension: this module is unit tested under plain
// `node --test`, which does not resolve the @/ alias.
import { cardAssetNames } from './domain/card-assets.ts';

/**
 * PERMANENT. Server-side inlining of the card artwork.
 *
 * SERVER ONLY. It reads from disk, so importing it from a Client Component
 * fails the build - which is the guard, rather than a runtime check.
 *
 * The artwork has to be inlined rather than referenced with <img>, because
 * the intro sequence animates elements INSIDE these files: the seal halves,
 * the floral clusters, the text lines. Nothing reaches into an <img>.
 *
 * No SVGR and no bundler configuration. These are five files read at request
 * time and cached; a build-time transform would be more machinery than the
 * problem needs, and would put the artwork behind a rebuild every time it is
 * re-exported.
 */

const CARD_DIR = join(process.cwd(), 'public', 'card');

/** The root viewBox, and everything between <svg> and </svg>. */
type ParsedSvg = { viewBox: string; inner: string };

/**
 * Module scope, so each file is read and parsed once per server process.
 *
 * Deliberately bypassed in development: the artwork is actively being
 * re-exported from Illustrator, and a cache that survives the file changing
 * would have you restarting the dev server to see a new export.
 */
const cache = new Map<string, ParsedSvg>();
const cacheable = process.env.NODE_ENV === 'production';

const ROOT_TAG = /^\s*<svg\b([^>]*)>/i;
const VIEW_BOX = /\bviewBox="([^"]+)"/i;

function parse(name: string, source: string): ParsedSvg {
  const root = ROOT_TAG.exec(source);
  if (!root) {
    throw new Error(`public/card/${name}.svg does not start with an <svg> element.`);
  }

  const viewBox = VIEW_BOX.exec(root[1] ?? '')?.[1];
  if (!viewBox) {
    throw new Error(
      `public/card/${name}.svg has no viewBox. Without one it cannot be scaled, and the ` +
        'card layers cannot be stacked. Re-export it with the artboard bounds intact.',
    );
  }

  const close = source.lastIndexOf('</svg>');
  if (close === -1) {
    throw new Error(`public/card/${name}.svg has no closing </svg>.`);
  }

  return { viewBox, inner: source.slice(root[0].length, close) };
}

/**
 * Reads one card asset by bare name - "monogram", not "monogram.svg".
 *
 * The name is checked against manifest.json rather than the filesystem, so a
 * typo fails with the list of what does exist, and so that an asset nobody
 * declared cannot quietly become load-bearing.
 */
export function readCardSvg(name: string): ParsedSvg {
  const cached = cache.get(name);
  if (cached) return cached;

  const file = `${name}.svg`;
  const known = cardAssetNames();

  if (!known.includes(file)) {
    throw new Error(
      `"${file}" is not listed in public/card/manifest.json. ` +
        `Known assets: ${known.length === 0 ? '(none yet)' : known.join(', ')}.`,
    );
  }

  let source: string;
  try {
    source = readFileSync(join(CARD_DIR, file), 'utf8');
  } catch (error) {
    throw new Error(
      `Could not read public/card/${file}: ${error instanceof Error ? error.message : error}. ` +
        'It is in the manifest, so `pnpm build` should have caught this first.',
    );
  }

  const parsed = parse(name, source);
  if (cacheable) cache.set(name, parsed);
  return parsed;
}

export type InlineSvgProps = {
  /** Bare asset name: "monogram", "card-base", "envelope". */
  name: string;
  className?: string;
  /**
   * Decorative by default. The card is a faithful reproduction of the printed
   * piece and is marked aria-hidden as a whole; the readable content is the
   * HTML section below it, which is what a screen reader announces.
   */
  'aria-hidden'?: boolean;
  /**
   * Defaults to "none" so a layer fills its box exactly. Every layer of the
   * card stack sits at inset:0 and shares one viewBox, so letterboxing any of
   * them would break the alignment they depend on.
   */
  preserveAspectRatio?: string;
};

/**
 * Injects one card asset as a real inline <svg>.
 *
 * The markup is our own artwork, read from disk at build/deploy time and
 * never from a request, so dangerouslySetInnerHTML carries no user input
 * here. Rebuilding the root element rather than string-patching the file's
 * own tag is what makes className, aria-hidden and preserveAspectRatio
 * ordinary props instead of regex surgery.
 */
export function InlineSvg({
  name,
  className,
  'aria-hidden': ariaHidden = true,
  preserveAspectRatio = 'none',
}: InlineSvgProps): ReactElement {
  const { viewBox, inner } = readCardSvg(name);

  return createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox,
    preserveAspectRatio,
    className,
    'aria-hidden': ariaHidden || undefined,
    focusable: 'false',
    'data-svg': name,
    dangerouslySetInnerHTML: { __html: inner },
  });
}
