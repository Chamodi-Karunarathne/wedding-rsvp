import type { CSSProperties, ReactNode } from 'react';
import { CARD_ASPECT_RATIO, CARD_LAYERS, CARD_VIEWBOX, RSVP_SLOT, layerTransform } from '@/lib/card/layers';
import { scriptOf } from '@/lib/domain/script';
import { readCardSvg } from '@/lib/svg';

type Props = {
  children: ReactNode;
  brideName: string;
  groomName: string;
  date: string;
  time: string;
  eventName: string;
  venueName: string;
  venueAddress: string;
  replyBy: string;
};

export function Card({ children, brideName, groomName, date, time, eventName, venueName, venueAddress, replyBy }: Props) {
  // Retain the commissioned family wording; configurable names and event
  // details below are live text rather than the old outlined SVG lettering.
  const hostLines = readCardSvg('card-text').inner.match(/<path\b[^>]*id="[^"]*line-0[1-6][^"]*"[^>]*\/>/g) ?? [];

  return (
    <div className="card-stage">
      <figure className="card" aria-hidden="true" style={{ aspectRatio: String(CARD_ASPECT_RATIO) }}>
        <svg className="card-art" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${CARD_VIEWBOX.width} ${CARD_VIEWBOX.height}`} focusable="false">
          {CARD_LAYERS.filter((layer) => layer.name !== 'card-text').map((layer) => (
            <g key={layer.name} data-layer={layer.name} transform={layerTransform(layer)} dangerouslySetInnerHTML={{ __html: readCardSvg(layer.name).inner }} />
          ))}
        </svg>
        <div className="card-wording" data-layer="card-text">
          <svg className="card-hosts" viewBox="0 -2 302.51 124" focusable="false">
            {hostLines.map((line, index) => <g key={index} data-intro-line="" dangerouslySetInnerHTML={{ __html: line }} />)}
          </svg>
          <div className="card-names" style={{ '--couple-size': `${Math.min(10.4, 100 / Math.max(Array.from(brideName).length, Array.from(groomName).length, 1))}cqw` } as CSSProperties}>
            <span data-intro-line="" data-script={scriptOf(brideName)}>{brideName}</span>
            <span className="card-ampersand" data-intro-line="">&amp;</span>
            <span data-intro-line="" data-script={scriptOf(groomName)}>{groomName}</span>
          </div>
          <div className="card-event" data-intro="details">
            <p className="card-date">{date}</p>
            <p>{eventName}{time && <> · {time}</>}</p>
            <span className="card-small-rule" />
            <p className="card-venue">{venueName}</p>
            <p className="card-address">{venueAddress}</p>
          </div>
        </div>
        <div className="card-sweep" data-intro="sweep" />
      </figure>
      {/* Controls remain outside the decorative, aria-hidden figure. */}
      <div className="rsvp-slot" style={{ '--slot-left': `${RSVP_SLOT.left}%`, '--slot-top': `${RSVP_SLOT.top}%`, '--slot-width': `${RSVP_SLOT.width}%`, '--slot-height': `${RSVP_SLOT.height}%` } as CSSProperties}>
        <p className="card-reply-date">{replyBy}</p>
        {children}
      </div>
    </div>
  );
}
