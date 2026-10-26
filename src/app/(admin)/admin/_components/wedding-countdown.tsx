'use client';

import { useEffect, useState } from 'react';
import { RiCalendarLine, RiHeartLine, RiMapPinLine } from '@remixicon/react';
import { countdownParts, weddingDayState } from '@/lib/domain/wedding-countdown';

type Props = {
  startsAt: string;
  initialNow: number;
  timeZone: string;
  dateLabel: string;
  venueName: string;
  eventName: string;
};

export function WeddingCountdown({ startsAt, initialNow, timeZone, dateLabel, venueName, eventName }: Props) {
  // The first client render uses the same clock value as the server.
  const [now, setNow] = useState(initialNow);
  const target = Date.parse(startsAt);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const current = Date.now();
      setNow(current);
      if (current < target) timer = setTimeout(tick, 1000 - (current % 1000));
    }
    tick();
    return () => clearTimeout(timer);
  }, [target, initialNow]);
  const remaining = countdownParts(target, now);
  const state = weddingDayState(target, now, timeZone);
  const title = state === 'today' ? 'Today is the day.' : state === 'celebrated' ? 'A day to remember.' : 'One day closer.';
  const values = [
    ['Days', remaining.days], ['Hours', remaining.hours], ['Minutes', remaining.minutes], ['Seconds', remaining.seconds],
  ] as const;
  return (
    <section className="admin-wedding-countdown" aria-label="Wedding day countdown" data-state={state}>
      <div className="admin-countdown-intro">
        <span className="admin-countdown-mark" aria-hidden="true"><RiHeartLine size={24} /></span>
        <p className="admin-countdown-eyebrow">{state === 'celebrated' ? 'The beginning of forever' : 'Until the celebration'}</p>
        <h2>{title}</h2>
        <p className="admin-countdown-event">{eventName}</p>
        <div className="admin-countdown-details">
          <span><RiCalendarLine size={15} aria-hidden="true" /><time dateTime={startsAt}>{dateLabel}</time></span>
          {venueName && <span><RiMapPinLine size={15} aria-hidden="true" />{venueName}</span>}
        </div>
      </div>
      <div className="admin-countdown-clock">
        {state === 'celebrated' ? (
          <p className="admin-countdown-finished">Here’s to every chapter ahead.</p>
        ) : (
          <>
            {/* Live digits are available on demand, without a per-second announcement. */}
            <dl className="admin-countdown-digits" aria-live="off">
              {values.map(([label, value]) => (
                <div key={label} className="admin-countdown-unit">
                  <dt>{label}</dt>
                  <dd>{String(value).padStart(2, '0')}</dd>
                </div>
              ))}
            </dl>
            <p className="admin-countdown-caption">{remaining.totalSeconds > 0 ? 'Every moment brings us a little closer.' : 'The celebration has begun. Enjoy every moment.'}</p>
          </>
        )}
      </div>
    </section>
  );
}
