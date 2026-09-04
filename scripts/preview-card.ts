import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  CARD_LAYERS,
  CARD_VIEWBOX,
  RSVP_REGION,
  layerTransform,
} from '../src/lib/card/layers.ts';

/**
 * Renders the composed card to a PNG so the layer offsets can be LOOKED at.
 *
 *   pnpm card:preview            -> card-preview.png
 *   pnpm card:preview --guides   -> with the RSVP region and centre line drawn
 *
 * The three layers were exported from three different artboards and do not
 * share a viewBox, so their offsets in src/lib/card/layers.ts were arrived at
 * by rendering this and looking at the result. When those numbers are nudged,
 * this is how to check the nudge without deploying anything - and it reads
 * the same module the page does, so the preview cannot drift from the page.
 */

const CARD_DIR = join('public', 'card');
const OUT = process.argv.find((a) => a.endsWith('.png')) ?? 'card-preview.png';
const guides = process.argv.includes('--guides');

function inner(name: string): string {
  const source = readFileSync(join(CARD_DIR, `${name}.svg`), 'utf8');
  const open = /^\s*<svg\b[^>]*>/i.exec(source);
  if (!open) throw new Error(`${name}.svg does not start with <svg>`);
  return source.slice(open[0].length, source.lastIndexOf('</svg>'));
}

const layers = CARD_LAYERS.map((layer) => {
  const transform = layerTransform(layer);
  return `<g${transform ? ` transform="${transform}"` : ''} data-layer="${layer.name}">${inner(
    layer.name,
  )}</g>`;
}).join('\n');

const overlay = guides
  ? `<rect x="${RSVP_REGION.x}" y="${RSVP_REGION.y}" width="${RSVP_REGION.width}"
       height="${RSVP_REGION.height}" fill="rgba(0,128,255,.18)" stroke="#0080ff"
       stroke-width="1"/>
     <line x1="${CARD_VIEWBOX.width / 2}" y1="0" x2="${CARD_VIEWBOX.width / 2}"
       y2="${CARD_VIEWBOX.height}" stroke="rgba(255,0,0,.35)" stroke-width="0.5"/>`
  : '';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_VIEWBOX.width} ${CARD_VIEWBOX.height}">
<rect width="${CARD_VIEWBOX.width}" height="${CARD_VIEWBOX.height}" fill="#fffdf8"/>
${layers}
${overlay}
</svg>`;

writeFileSync(OUT.replace(/\.png$/, '.svg'), svg, 'utf8');
await sharp(Buffer.from(svg), { density: 220 }).png().toFile(OUT);

console.log(`Wrote ${OUT} (and the .svg beside it).`);
for (const layer of CARD_LAYERS) {
  console.log(`  ${layer.name.padEnd(14)} ${layerTransform(layer) ?? 'no transform'}`);
}
