'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CopyBundle } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';

/*
 * DISPOSABLE. The card's one control, the dialog it opens, and what replaces
 * the card once a reply has been sent.
 *
 * The card carries a single button. Everything else - when, where, dress code,
 * the reply itself, the numbers to telephone - lives in the dialog, so the
 * page under the card is empty and the card is the whole invitation.
 *
 * PROGRESSIVE ENHANCEMENT. The dialog's contents are ordinary server-rendered
 * HTML inside a <dialog>. With no JavaScript a <dialog> is display:none, which
 * would leave a guest with an invitation and no way to read it or answer it -
 * so guest.css has a <noscript> rule that lays the same markup out inline
 * instead. Nothing here is the only copy of anything.
 */

export type ResponseDetails = {
  when: string;
  venueName: string;
  venueAddress: string;
  dressCode: string | null;
  mapUrl: string | null;
  deadline: string;
  deadlinePassed: boolean;
  contacts: { name: string; phone: string; side: string }[];
};

export type SavedAnswer = {
  attending: boolean;
  partyCount: number;
  attendeeNames: string | null;
} | null;

/**
 * How the card's button reaches the dialog.
 *
 * Context rather than a prop, because the button sits inside <Card>, whose
 * artwork is read from disk on the server. Threading a callback down to it
 * would make the whole card a Client Component and send the artwork through
 * the serialization boundary as props.
 */
type RespondControl = {
  open: () => void;
  label: string;
};
const RespondContext = createContext<RespondControl | null>(null);

/** Only the RSVP word is interactive; saved status lives inside the dialog. */
export function RespondButton() {
  const control = useContext(RespondContext);
  // Rendered by the server inside <Card> before the provider mounts on the
  // client; nothing is better than a button that cannot open anything.
  if (!control) return null;

  return (
    <div className="respond">
      <button
        type="button"
        className="respond-btn"
        aria-haspopup="dialog"
        onClick={control.open}
      >
        <span>{control.label}</span>
      </button>
    </div>
  );
}

type Props = {
  token: string;
  eventSlug: string;
  maxPartySize: number;
  existing: SavedAnswer;
  existingMessage: string | null;
  copy: CopyBundle;
  details: ResponseDetails;
  /** Server-rendered, so the closing panel needs no extra request. */
  monogram: ReactNode;
  /** The envelope and the card. */
  children: ReactNode;
};

export function RespondFlow({
  token,
  eventSlug,
  maxPartySize,
  existing,
  existingMessage,
  copy,
  details,
  monogram,
  children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  const [answer, setAnswer] = useState<SavedAnswer>(existing);
  /**
   * Whether a reply was sent in THIS visit.
   *
   * The card is replaced by the thank-you only after the act of replying, not
   * merely because an answer exists. A household returning a week later should
   * land on their invitation, not on a thank-you for something they have
   * already forgotten doing.
   */
  const [justReplied, setJustReplied] = useState(false);

  const [attending, setAttending] = useState<boolean | null>(existing?.attending ?? null);
  const [partyCount, setPartyCount] = useState(
    existing?.attending ? Math.min(existing.partyCount, maxPartySize) : maxPartySize,
  );
  const [names, setNames] = useState(existing?.attendeeNames ?? '');
  const [note, setNote] = useState(existingMessage ?? '');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    const dialog = dialogRef.current;
    if (!dialog) return;
    // showModal gives the focus trap, the backdrop and Escape for nothing.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.documentElement.classList.add('dialog-open');
  }

  function close() {
    dialogRef.current?.close();
  }

  // Nothing behind the dialog should scroll while it is up.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const sync = () => document.documentElement.classList.toggle('dialog-open', dialog.open);
    sync();

    dialog.addEventListener('close', sync);
    return () => {
      dialog.removeEventListener('close', sync);
      document.documentElement.classList.remove('dialog-open');
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (attending === null || sending) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          responses: [
            {
              eventSlug,
              attending,
              partyCount: attending ? partyCount : 0,
              // Sent only when attending. Absent leaves whatever is stored
              // alone; the API draws that distinction deliberately.
              ...(attending ? { attendeeNames: names.trim() || null } : {}),
            },
          ],
          message: note,
        }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: { message?: string } }).error?.message ?? copy.rsvp.error)
            : copy.rsvp.error;
        setError(message);
        setSending(false);
        return;
      }

      setAnswer({
        attending,
        partyCount: attending ? partyCount : 0,
        attendeeNames: attending ? names.trim() || null : null,
      });
      setSending(false);
      setJustReplied(true);
      close();
    } catch {
      setError(copy.rsvp.error);
      setSending(false);
    }
  }

  useEffect(() => {
    if (justReplied) closingRef.current?.focus({ preventScroll: true });
  }, [justReplied]);

  function returnToInvitation() {
    setJustReplied(false);
    requestAnimationFrame(() => stageRef.current?.querySelector<HTMLButtonElement>('.respond-btn')?.focus({ preventScroll: true }));
  }

  const partyHelp =
    maxPartySize === 1
      ? copy.rsvp.partyCountHelpOne
      : renderTemplate(copy.rsvp.partyCountHelpMany, { max: maxPartySize });

  return (
    <RespondContext.Provider
      value={{
        open,
        label: answer ? copy.card.respondAgain : copy.card.respond,
      }}
    >
      {/*
        data-replied fades the card out and the closing panel in. A class on a
        wrapper rather than unmounting the card: the artwork is server-rendered
        and remounting it to answer a question would throw it all away.
      */}
      <div ref={stageRef} className="stage" data-replied={justReplied ? 'true' : 'false'}>
        <div className="stage-card">{children}</div>

        {justReplied && answer && (
          <div ref={closingRef} className="closing" role="status" tabIndex={-1}>
            {/*
              Decoration, so aria-hidden and out of the flow: this panel is a
              status message and should announce as one line, not as two
              drawings and a line.
            */}
            <div className="sprig" data-side="left" aria-hidden="true">
              <img alt="" src="/card/rose-corner-lower.6277f50c09.webp" width={512} height={512} />
            </div>
            <div className="sprig" data-side="right" aria-hidden="true">
              <img alt="" src="/card/rose-corner-upper.1e4c20dbac.webp" width={512} height={512} />
            </div>

            {/*
              The gold frame of the storyboard's last panel. It belongs HERE
              rather than in the sequence: this is the end of the exchange, and
              the sequence's job is to hand over an invitation, not to say
              goodbye before it has been read.
            */}
            <div className="closing-frame" aria-hidden="true" />

            <div className="closing-monogram">{monogram}</div>
            <h2 className="closing-heading">{copy.thanks.heading}</h2>
            <p className="closing-line">
              {answer.attending ? copy.thanks.attendingBody : copy.thanks.declinedBody}
            </p>
            <hr className="closing-rule" />
            {/* The farewell, at the actual end of the flow. */}
            <p className="closing-farewell">{answer.attending ? copy.intro.farewell : copy.thanks.declinedFarewell}</p>
            <p>
              <button type="button" className="btn-quiet" onClick={returnToInvitation}>
                {copy.thanks.change}
              </button>
            </p>
          </div>
        )}
      </div>

      <dialog ref={dialogRef} className="sheet" aria-labelledby="sheet-title" aria-describedby="sheet-deadline">
        <div className="sheet-inner">
          <header className="sheet-header">
            <div className="sheet-garland" aria-hidden="true">
              <img alt="" src="/card/rose-corner-upper.1e4c20dbac.webp" width={512} height={512} />
            </div>
            <button type="button" className="sheet-close" aria-label={copy.dialog.closeLabel} onClick={close}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
            <p className="sheet-kicker">{copy.dialog.replyHeading}</p>
            <h2 id="sheet-title" className="sheet-title">{copy.dialog.title}</h2>
            <p id="sheet-deadline" className="sheet-deadline">
              {details.deadlinePassed ? copy.rsvp.deadlinePassed : renderTemplate(copy.dialog.replyBy, { date: details.deadline })}
            </p>
          </header>

          <div className="sheet-scroll">
            {answer && <p className="sheet-standing">{answer.attending ? renderTemplate(copy.rsvp.savedAttending, { n: answer.partyCount }) : copy.rsvp.savedDeclined}</p>}
            <details className="sheet-disclosure sheet-event">
              <summary>
                <span><span className="sheet-disclosure-label">{copy.dialog.detailsHeading}</span><span className="sheet-event-preview">{details.when}</span></span>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5" /></svg>
              </summary>
              <dl className="sheet-details">
                <div>
                  <dt>{copy.events.where}</dt>
                  <dd>{details.venueName}<span className="sheet-address">{details.venueAddress}</span>
                    {details.mapUrl && (
                      <a className="map-link" href={details.mapUrl} target="_blank" rel="noreferrer noopener">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                        {copy.events.directions}
                      </a>
                    )}
                  </dd>
                </div>
                {details.dressCode && <div><dt>{copy.events.dressCode}</dt><dd>{details.dressCode}</dd></div>}
              </dl>
            </details>

            <form id="reply-form" onSubmit={submit} className="sheet-form" aria-busy={sending}>
              <fieldset className="sheet-fields" disabled={sending}>
                <legend className="sr-only">{copy.dialog.replyHeading}</legend>
                <fieldset className="choice">
                  <legend>{copy.rsvp.attendingQuestionSingle}</legend>
                  {[true, false].map(value => (
                    <label key={String(value)} className="choice-btn" data-selected={attending === value ? 'true' : 'false'}>
                      <input className="choice-input" type="radio" name="attendance" value={String(value)} checked={attending === value} required onChange={() => setAttending(value)} />
                      <span className="choice-indicator" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg></span>
                      <span>{value ? copy.rsvp.yes : copy.rsvp.no}</span>
                    </label>
                  ))}
                </fieldset>

                {attending === true && (
                  <div className="attending-fields">
                    <div className="field party-field">
                      <label htmlFor="party">{copy.rsvp.partyCountLabel}</label>
                      <div className="party-stepper">
                        <button type="button" aria-label={copy.rsvp.fewerPlaces} disabled={Number.isFinite(partyCount) && partyCount <= 1} onClick={() => setPartyCount(Math.min(maxPartySize, Math.max(1, (Number.isFinite(partyCount) ? partyCount : 2) - 1)))}>−</button>
                        <input id="party" type="number" inputMode="numeric" min={1} max={maxPartySize} step={1} required aria-describedby="party-help" value={Number.isNaN(partyCount) ? '' : partyCount} onChange={e => setPartyCount(Number.isNaN(e.currentTarget.valueAsNumber) ? NaN : Math.min(maxPartySize, Math.max(1, Math.trunc(e.currentTarget.valueAsNumber))))} />
                        <button type="button" aria-label={copy.rsvp.morePlaces} disabled={Number.isFinite(partyCount) && partyCount >= maxPartySize} onClick={() => setPartyCount(Math.max(1, Math.min(maxPartySize, (Number.isFinite(partyCount) ? partyCount : 0) + 1)))}>+</button>
                      </div>
                      <p id="party-help" className="sheet-muted">{partyHelp}</p>
                    </div>
                    <div className="field">
                      <label htmlFor="names">{copy.rsvp.attendeeNamesLabel}<span className="field-optional">{copy.dialog.optional}</span></label>
                      <input id="names" type="text" autoComplete="off" autoCapitalize="words" aria-describedby="names-help" placeholder={copy.rsvp.attendeeNamesPlaceholder} value={names} onChange={e => setNames(e.target.value)} />
                      <p id="names-help" className="sheet-muted">{copy.rsvp.attendeeNamesHelp}</p>
                    </div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="note">{copy.rsvp.messageLabel}<span className="field-optional">{copy.dialog.optional}</span></label>
                  <textarea id="note" rows={3} placeholder={copy.rsvp.messageHelp} value={note} onChange={e => setNote(e.target.value)} />
                </div>
              </fieldset>
            </form>

            {details.contacts.length > 0 && (
              <details className="sheet-disclosure sheet-contacts">
                <summary><span>{copy.card.contactsHeading}</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5" /></svg></summary>
                <ul className="contact-list">
                  {details.contacts.map(contact => (
                    <li key={`${contact.name}-${contact.phone}`}>
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}><span>{contact.name}{contact.side && <small>{contact.side}</small>}</span><span>{contact.phone}</span></a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <noscript><p className="sheet-muted">{copy.rsvp.noScript}</p></noscript>
          </div>

          <footer className="sheet-actions">
            {error && <p role="alert" className="sheet-error">{error}</p>}
            <button type="submit" form="reply-form" className="btn-primary" disabled={sending || attending === null}>
              {sending && <span className="sheet-spinner" aria-hidden="true" />}
              {sending ? copy.rsvp.submitting : answer ? copy.rsvp.saveChanges : copy.rsvp.submit}
            </button>
            <p className="sheet-action-hint" aria-live="polite">{attending === null ? copy.dialog.chooseResponse : copy.rsvp.changeAnytime}</p>
          </footer>
        </div>
      </dialog>

    </RespondContext.Provider>
  );
}
