import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates the decorative botanical assets: corner sprays and the closing
 * frame.
 *
 * ORIGINAL ARTWORK, generated rather than downloaded. Stock floral art is
 * rarely licensed for something that is both published to five hundred people
 * and potentially printed, and provenance is almost impossible to verify after
 * the fact - so these are drawn from curves defined here, in the same gold and
 * blush the designer's card artwork already uses. If licensed artwork is
 * bought later, drop it into public/card/ under the same filenames and this
 * script becomes redundant.
 *
 * Generated rather than hand-written because a spray is a leaf shape repeated
 * along a curve at a computed angle and taper. Fifty hand-typed path
 * coordinates would be unreadable and unadjustable; the numbers that actually
 * matter - how far the stem bends, how quickly leaves shrink towards the tip -
 * are named constants below.
 */

const GOLD = '#b18906';
const GOLD_SOFT = '#d8b65a';
/*
 * Two blush tones, one per side of the stem. A single tone makes the spray
 * read flat; alternating them gives the leaves that fall behind the stem a
 * little more weight and the cluster reads as having depth.
 */
const BLUSH = '#f0cdc8';
const BLUSH_DEEP = '#e2ada6';

type Point = { x: number; y: number };

/** Cubic bezier position at t. */
function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Tangent angle in degrees at t, so a leaf sits along the stem. */
function bezierAngle(p0: Point, p1: Point, p2: Point, p3: Point, t: number): number {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy =
    3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * A leaf, drawn at the origin pointing along +x.
 *
 * Two quadratic curves meeting at the tip: the simplest shape that still reads
 * as a leaf rather than an ellipse, because the ends come to a point.
 *
 * The control points sit at the FULL requested width, not half of it. A
 * quadratic Bezier only reaches half its control offset at the midpoint, so
 * halving here made every leaf half as wide as asked and the sprays came out
 * as thin slivers - willow, not the fuller leaf the artwork wants.
 */
function leafPath(length: number, width: number): string {
  const l = r(length);
  const w = r(width);
  return `M0 0Q${r(length * 0.42)} ${-w} ${l} 0Q${r(length * 0.42)} ${w} 0 0Z`;
}

type SprayOptions = {
  stem: [Point, Point, Point, Point];
  /** Number of leaves down each side. */
  count: number;
  leafLength: number;
  leafWidth: number;
  /** Leaf size at the tip, as a fraction of the base size. */
  taper: number;
  /** Degrees the leaf sits off the stem tangent. */
  spread: number;
  /** Where along the stem the first leaf sits. */
  from: number;
  to: number;
};

function spray(options: SprayOptions, idPrefix: string): string {
  const [p0, p1, p2, p3] = options.stem;
  const parts: string[] = [];

  // The stem itself, as a stroked curve.
  parts.push(
    `<path fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round" d="M${r(p0.x)} ${r(p0.y)}C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}"/>`,
  );

  for (let i = 0; i < options.count; i += 1) {
    const t = options.from + ((options.to - options.from) * i) / Math.max(1, options.count - 1);
    const point = bezier(p0, p1, p2, p3, t);
    const angle = bezierAngle(p0, p1, p2, p3, t);

    // Leaves shrink towards the tip, which is what stops a spray reading as a
    // row of identical stamps.
    const scale = 1 - (1 - options.taper) * t;
    const length = options.leafLength * scale;
    const width = options.leafWidth * scale;

    for (const side of [-1, 1] as const) {
      // Alternate which side leads, so the two rows do not sit in pairs.
      const offset = side === 1 ? 0.5 : 0;
      const tt = Math.min(1, t + offset * ((options.to - options.from) / options.count));
      const at = bezier(p0, p1, p2, p3, tt);
      const a = bezierAngle(p0, p1, p2, p3, tt) + side * options.spread;

      parts.push(
        `<path fill="${side === 1 ? BLUSH : BLUSH_DEEP}" transform="translate(${r(at.x)} ${r(at.y)}) rotate(${r(a)})" d="${leafPath(length, width)}"/>`,
      );
      // A gold vein, thin enough to read as ink rather than an outline.
      parts.push(
        `<path fill="none" stroke="${GOLD_SOFT}" stroke-width="0.5" stroke-linecap="round" transform="translate(${r(at.x)} ${r(at.y)}) rotate(${r(a)})" d="M0 0H${r(length * 0.92)}"/>`,
      );
    }

    // A small gold bud every third node.
    if (i % 3 === 0) {
      parts.push(
        `<circle fill="${GOLD}" cx="${r(point.x)}" cy="${r(point.y)}" r="${r(2.2 * scale)}"/>`,
      );
    }
  }

  return `<g id="${idPrefix}">${parts.join('')}</g>`;
}

/* -------------------------------------------------------------------------- */
/* floral-corner.svg                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A corner spray, drawn for the top-left and flipped in CSS for the others.
 * Three stems of different lengths so the cluster has depth.
 */
function floralCorner(): string {
  const groups = [
    spray(
      {
        stem: [
          { x: 4, y: 22 },
          { x: 66, y: 34 },
          { x: 124, y: 86 },
          { x: 160, y: 170 },
        ],
        count: 9,
        leafLength: 40,
        leafWidth: 20,
        taper: 0.4,
        spread: 46,
        from: 0.06,
        to: 0.97,
      },
      'floral-corner__stem-long',
    ),
    spray(
      {
        stem: [
          { x: 8, y: 6 },
          { x: 76, y: 12 },
          { x: 128, y: 32 },
          { x: 170, y: 74 },
        ],
        count: 8,
        leafLength: 33,
        leafWidth: 16,
        taper: 0.42,
        spread: 40,
        from: 0.08,
        to: 0.96,
      },
      'floral-corner__stem-upper',
    ),
    spray(
      {
        stem: [
          { x: 6, y: 34 },
          { x: 30, y: 100 },
          { x: 50, y: 142 },
          { x: 84, y: 184 },
        ],
        count: 7,
        leafLength: 30,
        leafWidth: 14,
        taper: 0.45,
        spread: 44,
        from: 0.1,
        to: 0.96,
      },
      'floral-corner__stem-lower',
    ),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g id="floral-corner__floral-corner-root">${groups.join('')}</g></svg>`;
}

/* -------------------------------------------------------------------------- */
/* frame-ornament.svg                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The closing frame: a thin gold rule inset from the edge, with a small leaf
 * flourish at each corner. Beat 11 of the storyboard.
 *
 * Drawn as one rule plus four rotated corner groups rather than four separate
 * corner files, so the frame scales as a unit.
 */
function frameOrnament(): string {
  const W = 400;
  const H = 400;
  const inset = 22;

  const rule = `<rect fill="none" stroke="${GOLD}" stroke-width="1.4" x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}"/>`;
  const innerRule = `<rect fill="none" stroke="${GOLD_SOFT}" stroke-width="0.6" x="${inset + 6}" y="${inset + 6}" width="${W - (inset + 6) * 2}" height="${H - (inset + 6) * 2}"/>`;

  /*
   * A compact cluster sitting ON the corner, rather than a long stem tracing
   * it. The tracing version followed the rule so closely that the two read as
   * one rounded rectangle instead of a rectangle with a flourish at each
   * corner - the flourish has to leave the line to be seen as separate from it.
   */
  const corner = spray(
    {
      stem: [
        { x: inset - 4, y: inset + 40 },
        { x: inset + 10, y: inset + 22 },
        { x: inset + 22, y: inset + 10 },
        { x: inset + 40, y: inset - 4 },
      ],
      count: 5,
      leafLength: 26,
      leafWidth: 12,
      taper: 0.5,
      spread: 52,
      from: 0.06,
      to: 0.94,
    },
    'frame-ornament__corner',
  );

  const corners = [0, 90, 180, 270]
    .map(
      (deg, i) =>
        `<g id="frame-ornament__corner-${i}" transform="rotate(${deg} ${W / 2} ${H / 2})">${corner}</g>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g id="frame-ornament__frame-ornament-root">${rule}${innerRule}${corners}</g></svg>`;
}

/* -------------------------------------------------------------------------- */

/**
 * A single delicate stem, for accents that should not compete with the corner
 * sprays: beside the thank-you, and drifting behind the page.
 *
 * Each stem is its own group with an id, so the sequence can bring them in one
 * after another rather than fading the whole drawing at once.
 */
function floralSprig(): string {
  const groups = [
    spray(
      {
        stem: [
          { x: 10, y: 96 },
          { x: 58, y: 62 },
          { x: 118, y: 52 },
          { x: 188, y: 74 },
        ],
        count: 7,
        leafLength: 26,
        leafWidth: 12,
        taper: 0.42,
        spread: 44,
        from: 0.08,
        to: 0.96,
      },
      'floral-sprig__stem-a',
    ),
    spray(
      {
        stem: [
          { x: 14, y: 108 },
          { x: 62, y: 108 },
          { x: 118, y: 96 },
          { x: 172, y: 112 },
        ],
        count: 6,
        leafLength: 21,
        leafWidth: 9,
        taper: 0.45,
        spread: 38,
        from: 0.1,
        to: 0.95,
      },
      'floral-sprig__stem-b',
    ),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><g id="floral-sprig__floral-sprig-root">${groups.join('')}</g></svg>`;
}

const dir = join(process.cwd(), 'public', 'card');

/* -------------------------------------------------------------------------- */
/* floral-garland.svg                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A symmetric garland: one spray, and the same spray mirrored, meeting at the
 * centre under a small bud. Sits across the head of the reply sheet.
 *
 * Mirrored rather than drawn twice, so the two halves cannot drift out of
 * agreement when the curve is adjusted.
 */
function floralGarland(): string {
  const W = 600;
  const H = 120;

  const half = spray(
    {
      stem: [
        { x: 300, y: 96 },
        { x: 216, y: 104 },
        { x: 120, y: 74 },
        { x: 24, y: 20 },
      ],
      count: 8,
      leafLength: 30,
      leafWidth: 14,
      taper: 0.42,
      spread: 44,
      from: 0.06,
      to: 0.96,
    },
    'floral-garland__half',
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
    `<g id="floral-garland__floral-garland-root">` +
    `<g id="floral-garland__left">${half}</g>` +
    `<g id="floral-garland__right" transform="translate(${W} 0) scale(-1 1)">${half}</g>` +
    `<circle fill="${GOLD}" cx="300" cy="94" r="3.4"/>` +
    `</g></svg>`
  );
}

/* -------------------------------------------------------------------------- */
/* floral-bough.svg                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A tall arching branch for the page edges. Deliberately sparse and long: it
 * is scenery at low opacity behind the card, not something to be read.
 */
function floralBough(): string {
  const W = 320;
  const H = 900;

  const groups = [
    spray(
      {
        stem: [
          { x: 40, y: 10 },
          { x: 150, y: 220 },
          { x: 120, y: 560 },
          { x: 210, y: 880 },
        ],
        count: 14,
        leafLength: 44,
        leafWidth: 19,
        taper: 0.6,
        spread: 48,
        from: 0.04,
        to: 0.98,
      },
      'floral-bough__main',
    ),
    spray(
      {
        stem: [
          { x: 20, y: 120 },
          { x: 90, y: 300 },
          { x: 60, y: 500 },
          { x: 118, y: 700 },
        ],
        count: 9,
        leafLength: 30,
        leafWidth: 13,
        taper: 0.55,
        spread: 42,
        from: 0.06,
        to: 0.96,
      },
      'floral-bough__second',
    ),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g id="floral-bough__floral-bough-root">${groups.join('')}</g></svg>`;
}

const files: [string, string][] = [
  ['floral-corner.svg', floralCorner()],
  ['frame-ornament.svg', frameOrnament()],
  ['floral-sprig.svg', floralSprig()],
  ['floral-garland.svg', floralGarland()],
  ['floral-bough.svg', floralBough()],
];

for (const [name, contents] of files) {
  writeFileSync(join(dir, name), contents, 'utf8');
  console.log(`wrote public/card/${name} (${contents.length} bytes)`);
}

console.log('\nNow run `pnpm assets:optimize` to restamp the manifest version.');
