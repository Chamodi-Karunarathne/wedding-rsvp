'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CopyBundle } from '@/lib/copy';
import { cardAsset } from '@/lib/domain/card-assets';
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
type RespondControl = { open: () => void; label: string };
const RespondContext = createContext<RespondControl | null>(null);

/** The single control printed on the card. */
export function RespondButton() {
  const control = useContext(RespondContext);
  // Rendered by the server inside <Card> before the provider mounts on the
  // client; a disabled button is better than a missing one.
  if (!control) return null;

  return (
    <button type="button" className="respond-btn" onClick={control.open}>
      {control.label}
    </button>
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
    existing?.attending ? existing.partyCount : maxPartySize,
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
    if (attending === null) return;

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

  const partyHelp =
    maxPartySize === 1
      ? copy.rsvp.partyCountHelpOne
      : renderTemplate(copy.rsvp.partyCountHelpMany, { max: maxPartySize });

  return (
    <RespondContext.Provider
      value={{ open, label: answer ? copy.card.respondAgain : copy.card.respond }}
    >
      {/*
        data-replied fades the card out and the closing panel in. A class on a
        wrapper rather than unmounting the card: the artwork is server-rendered
        and remounting it to answer a question would throw it all away.
      */}
      <div className="stage" data-replied={justReplied ? 'true' : 'false'}>
        <div className="stage-card">{children}</div>

        {justReplied && answer && (
          <div className="closing" role="status">
            {/*
              Decoration, so aria-hidden and out of the flow: this panel is a
              status message and should announce as one line, not as two
              drawings and a line.
            */}
            <div className="sprig" data-side="left" aria-hidden="true">
              <img alt="" src={cardAsset('floral-sprig.svg')} width={200} height={160} />
            </div>
            <div className="sprig" data-side="right" aria-hidden="true">
              <img alt="" src={cardAsset('floral-sprig.svg')} width={200} height={160} />
            </div>

            <div className="closing-monogram">{monogram}</div>
            <h2 className="closing-heading">{copy.thanks.heading}</h2>
            <p className="closing-line">
              {answer.attending ? copy.thanks.attendingBody : copy.thanks.declinedBody}
            </p>
            <hr className="closing-rule" />
            <p>
              <button type="button" className="link-button" onClick={() => setJustReplied(false)}>
                {copy.thanks.change}
              </button>
            </p>
          </div>
        )}
      </div>

      <dialog ref={dialogRef} className="sheet" aria-labelledby="sheet-title">
        <div className="sheet-inner">
          <h2 id="sheet-title" className="sheet-title">
            {copy.dialog.title}
          </h2>

          <section className="sheet-section">
            <h3 className="sheet-heading">{copy.dialog.detailsHeading}</h3>
            <dl className="sheet-details">
              <dt>{copy.events.when}</dt>
              <dd>{details.when}</dd>
              <dt>{copy.events.where}</dt>
              <dd>
                {details.venueName}
                <br />
                {details.venueAddress}
                {details.mapUrl && (
                  <>
                    <br />
                    <a href={details.mapUrl} target="_blank" rel="noreferrer noopener">
                      {copy.events.directions}
                    </a>
                  </>
                )}
              </dd>
              {details.dressCode && (
                <>
                  <dt>{copy.events.dressCode}</dt>
                  <dd>{details.dressCode}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="sheet-section">
            <h3 className="sheet-heading">{copy.dialog.replyHeading}</h3>
            <p className="sheet-muted">
              {details.deadlinePassed
                ? copy.rsvp.deadlinePassed
                : renderTemplate(copy.rsvp.deadline, { date: details.deadline })}
            </p>

            <form onSubmit={submit} className="sheet-form">
              <div className="choice">
                <button
                  type="button"
                  className="choice-btn"
                  data-selected={attending === true ? 'true' : 'false'}
                  onClick={() => setAttending(true)}
                >
                  {copy.rsvp.yes}
                </button>
                <button
                  type="button"
                  className="choice-btn"
                  data-selected={attending === false ? 'true' : 'false'}
                  onClick={() => setAttending(false)}
                >
                  {copy.rsvp.no}
                </button>
              </div>

              {attending === true && (
                <>
                  {maxPartySize > 1 && (
                    <div className="field">
                      <label htmlFor="party">{copy.rsvp.partyCountLabel}</label>
                      <input
                        id="party"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={maxPartySize}
                        value={partyCount}
                        onChange={(e) => setPartyCount(Number(e.target.value))}
                      />
                      <p className="sheet-muted">{partyHelp}</p>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="names">{copy.rsvp.attendeeNamesLabel}</label>
                    <input
                      id="names"
                      type="text"
                      value={names}
                      onChange={(e) => setNames(e.target.value)}
                    />
                    <p className="sheet-muted">{copy.rsvp.attendeeNamesHelp}</p>
                  </div>
                </>
              )}

              <div className="field">
                <label htmlFor="note">{copy.rsvp.messageLabel}</label>
                <textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="sheet-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={sending || attending === null}
                >
                  {sending ? copy.rsvp.submitting : copy.rsvp.submit}
                </button>
                <button type="button" className="link-button" onClick={close}>
                  {copy.dialog.close}
                </button>
              </div>

              <p aria-live="polite" className="sheet-error">
                {error}
              </p>
            </form>
          </section>

          {details.contacts.length > 0 && (
            <section className="sheet-section">
              <h3 className="sheet-heading">{copy.card.contactsHeading}</h3>
              <ul className="contact-list">
                {details.contacts.map((contact) => (
                  <li key={`${contact.name}-${contact.phone}`}>
                    <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                      {contact.name} {contact.phone}
                    </a>
                    {contact.side && ` (${contact.side})`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </dialog>

    </RespondContext.Provider>
  );
}
