import type { CSSProperties, ReactNode } from 'react';
import {
  CARD_ASPECT_RATIO,
  CARD_LAYERS,
  CARD_VIEWBOX,
  RSVP_SLOT,
  layerTransform,
} from '@/lib/card/layers';
import { readCardSvg } from '@/lib/svg';

/*
 * DISPOSABLE, like everything else in this route group.
 *
 * The card is ONE <svg> in card-base's coordinate system, with each layer
 * nested as a <g> carrying its own transform - not three stacked <svg>
 * elements at inset:0. The three exports do not share a viewBox, so stacking
 * them would need offset maths in the CSS; nesting them puts every layer in
 * one coordinate system where a single translate/scale from lib/card/layers
 * is enough.
 *
 * The <figure> is aria-hidden in full, and the RSVP slot is its SIBLING
 * rather than its child. That is deliberate: a form inside an aria-hidden
 * subtree is unreachable, so the two are positioned as neighbours and only
 * the artwork is hidden. What a screen reader gets instead of the artwork is
 * the readable section below.
 */

type Props = {
  /** The RSVP form. Positioned over the card, never inside the hidden figure. */
  children: ReactNode;
};

export function Card({ children }: Props) {
  return (
    <div className="card-stage">
      <figure
        className="card"
        aria-hidden="true"
        style={{ aspectRatio: String(CARD_ASPECT_RATIO) }}
      >
        <svg
          className="card-art"
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${CARD_VIEWBOX.width} ${CARD_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
        >
          {CARD_LAYERS.map((layer) => (
            <g
              key={layer.name}
              data-layer={layer.name}
              transform={layerTransform(layer)}
              // Our own artwork, read from disk. No request data reaches here.
              dangerouslySetInnerHTML={{ __html: readCardSvg(layer.name).inner }}
            />
          ))}
        </svg>

        {/*
          Beat 9. A gradient element translated across the card, never a
          filter: a filter over a card this size is a full repaint per frame.
          Invisible until the timeline touches it, and inert without one.

          INSIDE the figure, which is the card's exact box and clips its
          overflow. As a sibling of the figure its only bound was .card-stage,
          which is deliberately unclipped so the reply button can overhang -
          so the sweep travelled the full width of the page and read as a gold
          line sliding across the background either side of the card.
        */}
        <div className="card-sweep" data-intro="sweep" aria-hidden="true" />
      </figure>

      <div
        className="rsvp-slot"
        style={
          {
            '--slot-left': `${RSVP_SLOT.left}%`,
            '--slot-top': `${RSVP_SLOT.top}%`,
            '--slot-width': `${RSVP_SLOT.width}%`,
            '--slot-height': `${RSVP_SLOT.height}%`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
