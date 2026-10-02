import type { CSSProperties, ReactNode } from 'react';
import { CARD_ASPECT_RATIO, CARD_LAYERS, CARD_VIEWBOX, RSVP_SLOT, layerTransform } from '@/lib/card/layers';
import { scriptOf } from '@/lib/domain/script';
import { readCardSvg } from '@/lib/svg';
import manifest from '../../../../public/card/manifest.json';

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
  contacts: { name: string; phone: string; side: string }[];
};

const normalize = (value: string) => value.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu, '');

/** The supplied print outlines, with live text if the configured details change. */
export function Card({ children, brideName, groomName, date, time, eventName, venueName, venueAddress, replyBy, contacts }: Props) {
  const artwork = readCardSvg('card-text').inner;
  const printed = manifest.printedContent;
  const line = (number: string) => artwork.match(new RegExp('<path\\b[^>]*id="[^"]*line-' + number + '[^"]*"[^>]*/>'))?.[0] ?? '';
  const names = artwork.match(/<g id="card-text__line-07-names">[\s\S]*?<\/g>/)?.[0] ?? '';
  const originalNames = normalize(brideName) === normalize(printed.brideName) && normalize(groomName) === normalize(printed.groomName);
  // Avoid printing the same building twice when venue_name already includes it.
  const building = venueAddress.split(',')[0]?.trim();
  const cardVenue = building && venueName.endsWith(', ' + building) ? venueName.slice(0, -building.length - 2) : venueName;
  const details = [
    { id: '08', value: date, printed: printed.date, y: 205.9 },
    { id: '09', value: eventName + (time ? ' at ' + time : ''), printed: printed.eventName + ' at ' + printed.time, y: 220.8 },
    { id: '10', value: cardVenue, printed: printed.venueName, y: 237.2 },
    { id: '11', value: venueAddress, printed: printed.venueAddress, y: 253.6 },
  ];
  const nameWidth = Array.from((brideName + groomName).toUpperCase()).reduce((width, char) => width + (/\p{Mark}/u.test(char) ? 0 : /[MW]/.test(char) ? 1.5 : /[^\p{Script=Latin}\s'-]/u.test(char) ? 1.6 : 1), 0);
  const nameSize = Math.min(24, 490 / Math.max(nameWidth, 1));
  const ornament = readCardSvg('line');
  const ornamentPaths = ornament.inner.replace(/\s+id="[^"]*"/g, '');
  const heart = readCardSvg('heart');
  const reply = readCardSvg('rsvp by & contact');
  const contactText = (contact: Props['contacts'][number]) => contact.name + ' ' + contact.phone + (contact.side ? ' (' + contact.side + ')' : '');
  const originalReply = normalize(replyBy) === normalize(printed.replyBy) && normalize(contacts.map(contactText).join(' ')) === normalize(printed.contacts.map(contactText).join(' '));

  return (
    <div className="card-stage">
      <figure className="card" aria-hidden="true" style={{ aspectRatio: String(CARD_ASPECT_RATIO) }}>
        <svg className="card-art" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${CARD_VIEWBOX.width} ${CARD_VIEWBOX.height}`} focusable="false">
          {CARD_LAYERS.filter(layer => layer.name !== 'card-text').map(layer => (
            <g key={layer.name} data-layer={layer.name} transform={layerTransform(layer)} dangerouslySetInnerHTML={{ __html: readCardSvg(layer.name).inner }} />
          ))}
          <g data-layer="card-text" transform={layerTransform(CARD_LAYERS.find(layer => layer.name === 'card-text')!)}>
            {['01', '02', '03', '04', '05', '06'].map(id => <g key={id} data-intro-line="" dangerouslySetInnerHTML={{ __html: line(id) }} />)}
            <g className="card-names" data-intro-line="">
              {originalNames ? <g dangerouslySetInnerHTML={{ __html: names }} /> : (
                <foreignObject x="-15" y="128.46" width="332.51" height="42">
                  <div className="card-names-live" style={{ '--couple-size': `${nameSize}px` } as CSSProperties}>
                    <span data-script={scriptOf(brideName)}>{brideName}</span>
                    <svg className="card-ampersand" viewBox={readCardSvg('&').viewBox} dangerouslySetInnerHTML={{ __html: readCardSvg('&').inner }} />
                    <span data-script={scriptOf(groomName)}>{groomName}</span>
                  </div>
                </foreignObject>
              )}
            </g>
            <g data-intro="details">
              {details.map(detail => normalize(detail.value) === normalize(detail.printed)
                ? <g key={detail.id} dangerouslySetInnerHTML={{ __html: line(detail.id) }} />
                : <text key={detail.id} x="151.25" y={detail.y} textAnchor="middle" className="card-live-detail" data-script={scriptOf(detail.value)} fontSize={Math.min(9, 460 / Math.max(detail.value.length, 1))}>{detail.value.toUpperCase()}</text>)}
              <g dangerouslySetInnerHTML={{ __html: line('12') }} />
            </g>
          </g>
          <g data-intro="details">
            <svg x="166.02" y="306" width="94.16" height="5.54" viewBox={ornament.viewBox} dangerouslySetInnerHTML={{ __html: ornamentPaths }} />
            <svg x="166.02" y="390" width="94.16" height="5.54" viewBox={ornament.viewBox} dangerouslySetInnerHTML={{ __html: ornamentPaths }} />
            <svg x="207.86" y="444" width="10.47" height="8.23" viewBox={heart.viewBox} dangerouslySetInnerHTML={{ __html: heart.inner }} />
          </g>
          {/* Crop only the printed RSVP word. The three lines below it are untouched. */}
          <g data-intro="reply-print">
            {originalReply ? <svg x="135.08" y="480" width="156.05" height="40.53" viewBox="0 10 156.05 40.53" overflow="hidden" dangerouslySetInnerHTML={{ __html: reply.inner }} /> : (
              ['By ' + replyBy, ...contacts.map(contactText)].map((text, index) => <text key={index} x="213.1" y={491 + index * 14.5} textAnchor="middle" className="card-live-detail" fontSize={Math.min(9, 420 / Math.max(text.length, 1))}>{text.toUpperCase()}</text>)
            )}
          </g>
        </svg>
        <div className="card-sweep" data-intro="sweep" />
      </figure>
      <div className="rsvp-slot" style={{ '--slot-left': `${RSVP_SLOT.left}%`, '--slot-top': `${RSVP_SLOT.top}%`, '--slot-width': `${RSVP_SLOT.width}%`, '--slot-height': `${RSVP_SLOT.height}%` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
