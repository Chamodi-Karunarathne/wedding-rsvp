/**
 * PERMANENT while the artwork is. Pure data, unit tested.
 *
 * Where each layer of the card sits.
 *
 * WHY OFFSETS EXIST AT ALL: the three layers were exported from three
 * different artboards, each trimmed to its own content, so they do not share
 * a viewBox and cannot simply be stacked at inset:0.
 *
 *   card-base    426.20 x 553.76   ratio 0.770
 *   card-florals 423.59 x 533.43   ratio 0.794
 *   card-text    302.51 x 304.04   ratio 0.995   <- nearly square
 *
 * Rather than write offset maths through the CSS, every layer is nested in
 * one SVG that uses card-base's coordinate system, and placed with a single
 * translate/scale declared here. The numbers were arrived at by rendering the
 * composite and looking at it, not derived from anything - so they are data,
 * in one file, where they can be nudged without reading any JSX.
 *
 * If the layers are ever re-exported onto a shared artboard, every entry
 * below becomes { x: 0, y: 0, scale: 1 } and nothing else changes.
 */

/** card-base's viewBox. The coordinate system everything else is placed in. */
export const CARD_VIEWBOX = { width: 426.2, height: 553.76 } as const;

/** For the figure's aspect-ratio, so the card never shifts layout as it loads. */
export const CARD_ASPECT_RATIO = CARD_VIEWBOX.width / CARD_VIEWBOX.height;

export type CardLayer = {
  /** Asset name, as InlineSvg takes it. */
  name: string;
  x: number;
  y: number;
  scale: number;
  /** Why this layer is placed where it is. */
  note: string;
};

/** Painted in order: base, then florals, then text on top. */
export const CARD_LAYERS: readonly CardLayer[] = [
  {
    name: 'card-base',
    x: 0,
    y: 0,
    scale: 1,
    note: 'The reference frame. Everything else is placed against this one.',
  },
  {
    name: 'card-florals',
    x: 1.3,
    y: 7,
    scale: 1,
    note: 'Original print-scale clusters, with the narrow paper margin in the photograph.',
  },
  {
    name: 'card-text',
    x: 61.85,
    y: 125,
    scale: 1,
    note: 'Printed text centred horizontally, starting 125 units below the paper edge.',
  },
];

/**
 * Where the RSVP sits on the card, in card-base coordinates.
 *
 * Replaces only the RSVP word at the top of the supplied contact block.
 * The button has a 44px transparent hit area centred on these printed bounds.
 */
export const RSVP_REGION = { x: 166.1, y: 466, width: 94, height: 16 } as const;

/**
 * The same region as CSS percentages.
 *
 * Derived, never written by hand, so the slot cannot drift from the region it
 * is supposed to describe. Percentages rather than pixels because the card
 * scales with the viewport and the slot has to hold its position at every
 * size.
 */
export const RSVP_SLOT = {
  left: (RSVP_REGION.x / CARD_VIEWBOX.width) * 100,
  top: (RSVP_REGION.y / CARD_VIEWBOX.height) * 100,
  width: (RSVP_REGION.width / CARD_VIEWBOX.width) * 100,
  height: (RSVP_REGION.height / CARD_VIEWBOX.height) * 100,
} as const;

/** `translate(x y) scale(s)`, or undefined when the layer needs no transform. */
export function layerTransform(layer: CardLayer): string | undefined {
  if (layer.x === 0 && layer.y === 0 && layer.scale === 1) return undefined;
  return `translate(${layer.x} ${layer.y}) scale(${layer.scale})`;
}
