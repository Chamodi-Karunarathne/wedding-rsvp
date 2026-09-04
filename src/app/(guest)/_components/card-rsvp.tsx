'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { CopyBundle } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';

/*
 * The RSVP, in the region printed on the card.
 *
 * Two buttons, because that is the whole question for most households. A
 * party of one answers in a single tap; anyone who may bring others gets a
 * count step, which is the one thing we cannot guess and the number the
 * caterer is waiting on.
 *
 * Answering opens the closing frame - the monogram and a line - which is the
 * last beat of the opening sequence reused as the thank-you. It is a fixed
 * overlay rather than a route so that nothing is lost if it is dismissed.
 *
 * It posts to /api/rsvp, the same permanent contract as the fuller form in
 * the readable section below, which stays the way to add names, leave a
 * message, or change an answer later.
 */

type Existing = { attending: boolean; partyCount: number } | null;

type Props = {
  token: string;
  eventSlug: string;
  maxPartySize: number;
  existing: Existing;
  copy: CopyBundle;
  /** Server-rendered, so the closing frame needs no extra fetch. */
  monogram: ReactNode;
};

type Step = 'ask' | 'counting' | 'sending' | 'answered' | 'error';

export function CardRsvp({
  token,
  eventSlug,
  maxPartySize,
  existing,
  copy,
  monogram,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(existing ? 'answered' : 'ask');
  const [answer, setAnswer] = useState<Existing>(existing);
  const [count, setCount] = useState(existing?.partyCount ?? maxPartySize);
  const [error, setError] = useState<string | null>(null);

  /** Whether the closing frame is up. Not the same as having answered: a
   *  returning guest has answered and should still see their card. */
  const [ending, setEnding] = useState(false);

  async function send(attending: boolean, partyCount: number) {
    setStep('sending');
    setError(null);

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          responses: [
            { eventSlug, attending, partyCount: attending ? partyCount : 0 },
          ],
        }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: { message?: string } }).error?.message ?? copy.rsvp.error)
            : copy.rsvp.error;
        setError(message);
        setStep('error');
        return;
      }

      setAnswer({ attending, partyCount: attending ? partyCount : 0 });
      setStep('answered');
      setEnding(true);

      // The fuller form in the readable section is server-rendered from the
      // same row. Without this it would still be showing the previous answer
      // until the guest reloaded, and the two would quietly disagree.
      router.refresh();
    } catch {
      setError(copy.rsvp.error);
      setStep('error');
    }
  }

  function accept() {
    // One guest has nothing to count. Everyone else is asked, because the
    // headcount is the number the caterer is waiting on.
    if (maxPartySize === 1) void send(true, 1);
    else setStep('counting');
  }

  return (
    <>
      <div className="slot-inner">
        {(step === 'ask' || step === 'error') && (
          <div className="slot-actions">
            <button type="button" className="slot-btn is-yes" onClick={accept}>
              {copy.card.accept}
            </button>
            <button type="button" className="slot-btn" onClick={() => void send(false, 0)}>
              {copy.card.decline}
            </button>
          </div>
        )}

        {step === 'counting' && (
          <div className="slot-count">
            <span className="slot-label">{copy.card.howMany}</span>
            <div className="slot-stepper">
              <button
                type="button"
                className="slot-step"
                onClick={() => setCount((n) => Math.max(1, n - 1))}
                aria-label="-"
              >
                &minus;
              </button>
              <output className="slot-number">{count}</output>
              <button
                type="button"
                className="slot-step"
                onClick={() => setCount((n) => Math.min(maxPartySize, n + 1))}
                aria-label="+"
              >
                +
              </button>
            </div>
            <div className="slot-actions">
              <button
                type="button"
                className="slot-btn is-yes"
                onClick={() => void send(true, count)}
              >
                {copy.card.confirm}
              </button>
              <button type="button" className="slot-btn" onClick={() => setStep('ask')}>
                {copy.card.back}
              </button>
            </div>
          </div>
        )}

        {step === 'sending' && <span className="slot-label">{copy.rsvp.submitting}</span>}

        {step === 'answered' && answer && (
          <div className="slot-answered">
            <span>
              {answer.attending
                ? renderTemplate(copy.card.savedAttending, { n: answer.partyCount })
                : copy.card.savedDeclined}
            </span>
            <button type="button" className="slot-btn" onClick={() => setStep('ask')}>
              {copy.card.change}
            </button>
          </div>
        )}

        {step === 'error' && error && <span className="slot-error">{error}</span>}
      </div>

      {/*
        The closing frame. Only ever raised by answering here - a returning
        guest lands on their card, not on a thank-you for something they did
        weeks ago.
      */}
      {ending && answer && (
        <div className="ending" role="dialog" aria-modal="true" aria-label={copy.thanks.heading}>
          <div className="ending-veil" />
          <div className="ending-content">
            <div className="ending-monogram">{monogram}</div>
            <p className="ending-line">
              {answer.attending ? copy.ending.accepted : copy.ending.declined}
            </p>
            <hr className="ending-rule" />
            <button type="button" className="ending-close" onClick={() => setEnding(false)}>
              {copy.ending.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
