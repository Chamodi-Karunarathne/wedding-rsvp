'use client';

import { useState } from 'react';
import type { CopyBundle } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';
import { formatDateTimeShort } from '@/lib/format';
import type { EventView, RsvpView } from '@/lib/services/types';

/*
 * DISPOSABLE. Deliberately plain: no design decisions are encoded here beyond
 * "the form works and is obvious". The visual treatment arrives with the card.
 *
 * It posts to /api/rsvp, which is the permanent contract, so a replacement
 * guest UI can be written against that endpoint without touching anything
 * underneath. The payload keeps the `responses` array even though there is
 * one event; the array is the contract, not the shape of today's wedding.
 */

type Props = {
  token: string;
  events: EventView[];
  rsvps: Record<string, RsvpView>;
  message: string | null;
  maxPartySize: number;
  timezone: string;
  copy: CopyBundle;
};

type FieldState = {
  attending: boolean | null;
  partyCount: number;
  attendeeNames: string;
};

/**
 * What we currently believe the answer to be.
 *
 * `updatedAt: null` means "sent, not yet acknowledged" - the optimistic case.
 * It is what suppresses the timestamp while a save is in flight, rather than
 * showing a time the server has not agreed to yet.
 */
type Answer = {
  attending: boolean;
  partyCount: number;
  updatedAt: Date | null;
};

type Answers = Record<string, Answer>;

function toAnswers(rsvps: Record<string, RsvpView>): Answers {
  return Object.fromEntries(
    Object.entries(rsvps).map(([slug, rsvp]) => [
      slug,
      { attending: rsvp.attending, partyCount: rsvp.partyCount, updatedAt: rsvp.updatedAt },
    ]),
  );
}

export function RsvpForm({
  token,
  events,
  rsvps,
  message,
  maxPartySize,
  timezone,
  copy,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(() => toAnswers(rsvps));

  // A guest who has already replied lands on their answer, not on a blank
  // form asking a question they have answered. Everyone else lands on the
  // form, because for them there is nothing to summarise.
  const [editing, setEditing] = useState(() => Object.keys(rsvps).length === 0);

  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const initial: Record<string, FieldState> = {};
    for (const event of events) {
      const existing = rsvps[event.slug];
      initial[event.slug] = {
        attending: existing ? existing.attending : null,
        partyCount: existing && existing.attending ? existing.partyCount : 1,
        attendeeNames: existing?.attendeeNames ?? '',
      };
    }
    return initial;
  });

  const [messageText, setMessageText] = useState(message ?? '');
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  const answered = Object.keys(answers).length > 0;

  const update = (slug: string, patch: Partial<FieldState>) => {
    setFields((prev) => ({ ...prev, [slug]: { ...prev[slug]!, ...patch } }));
    if (status !== 'sending') setStatus('idle');
  };

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();

    // Only send events the guest actually answered.
    const answeredEvents = events.filter((event) => fields[event.slug]?.attending !== null);

    const responses = answeredEvents.map((event) => {
      const field = fields[event.slug]!;
      return {
        eventSlug: event.slug,
        attending: field.attending === true,
        partyCount: field.attending === true ? field.partyCount : 0,
        attendeeNames: field.attendeeNames.trim() || null,
      };
    });

    /*
     * Optimistic: show the new answer immediately and close the form, then
     * put the old one back if the request fails. On a Colombo phone over
     * mobile data this is the difference between a form that feels answered
     * and one that feels broken - and the failure path is the honest half of
     * it, so a guest is never left believing an answer that did not save.
     */
    const previousAnswers = answers;
    const previousEditing = editing;

    setAnswers((prev) => {
      const next = { ...prev };
      for (const response of responses) {
        next[response.eventSlug] = {
          attending: response.attending,
          partyCount: response.partyCount,
          updatedAt: null,
        };
      }
      return next;
    });
    setEditing(false);
    setStatus('sending');
    setErrorText(null);

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, responses, message: messageText }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: { message?: string } }).error?.message ?? copy.rsvp.error)
            : copy.rsvp.error;

        setAnswers(previousAnswers);
        setEditing(previousEditing || true);
        setErrorText(errorMessage);
        setStatus('error');
        return;
      }

      // Confirmed. Stamp the answers so the panel can show a real time.
      const now = new Date();
      setAnswers((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([slug, answer]) => [
            slug,
            answer.updatedAt === null ? { ...answer, updatedAt: now } : answer,
          ]),
        ),
      );
      setStatus('saved');
    } catch {
      setAnswers(previousAnswers);
      setEditing(true);
      setErrorText(copy.rsvp.error);
      setStatus('error');
    }
  }

  /* --- the saved-answer panel ------------------------------------------ */

  function summaryLine(event: EventView): string {
    const answer = answers[event.slug];
    if (!answer) return copy.rsvp.noResponseYet;

    const sentence = !answer.attending
      ? copy.rsvp.savedDeclined
      : answer.partyCount === 1
        ? copy.rsvp.savedAttendingOne
        : renderTemplate(copy.rsvp.savedAttending, { n: answer.partyCount });

    return events.length > 1 ? `${event.name}: ${sentence}` : sentence;
  }

  const lastSaved = Object.values(answers)
    .map((answer) => answer.updatedAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!editing && answered) {
    return (
      <div className="space-y-3">
        <div className="border p-3">
          <h3 className="font-medium">{copy.rsvp.savedHeading}</h3>
          <ul className="mt-1">
            {events.map((event) => (
              <li key={event.slug}>{summaryLine(event)}</li>
            ))}
          </ul>

          {lastSaved && (
            <p className="mt-1 text-sm text-gray-600">
              {renderTemplate(copy.rsvp.savedAt, {
                when: formatDateTimeShort(lastSaved, timezone),
              })}
            </p>
          )}

          <p aria-live="polite" className="mt-1 text-sm">
            {status === 'sending' && <span className="text-gray-600">{copy.rsvp.submitting}</span>}
            {status === 'saved' && <span>{copy.rsvp.saved}</span>}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setEditing(true);
          }}
          className="border px-4 py-2 font-medium"
        >
          {copy.rsvp.change}
        </button>

        <p className="text-sm text-gray-600">{copy.rsvp.changeAnytime}</p>
      </div>
    );
  }

  /* --- the form -------------------------------------------------------- */

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {events.map((event) => {
        const field = fields[event.slug]!;
        const groupName = `attending-${event.slug}`;

        return (
          <fieldset key={event.slug} className="border p-3">
            {/*
              Named only when there is more than one event to tell apart. The
              payload is unchanged either way: responses is always an array,
              and today it always carries exactly one entry.
            */}
            <legend className="font-medium">
              {events.length > 1
                ? renderTemplate(copy.rsvp.attendingQuestion, { event: event.name })
                : copy.rsvp.attendingQuestionSingle}
            </legend>

            <div className="mt-2 space-y-1">
              <label className="block">
                <input
                  type="radio"
                  name={groupName}
                  checked={field.attending === true}
                  onChange={() => update(event.slug, { attending: true })}
                />{' '}
                {copy.rsvp.yes}
              </label>
              <label className="block">
                <input
                  type="radio"
                  name={groupName}
                  checked={field.attending === false}
                  onChange={() => update(event.slug, { attending: false })}
                />{' '}
                {copy.rsvp.no}
              </label>
            </div>

            {field.attending === true && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block" htmlFor={`party-${event.slug}`}>
                    {copy.rsvp.partyCountLabel}
                  </label>
                  <input
                    id={`party-${event.slug}`}
                    type="number"
                    min={1}
                    max={maxPartySize}
                    value={field.partyCount}
                    onChange={(e) => update(event.slug, { partyCount: Number(e.target.value) })}
                    className="border px-2 py-1"
                  />
                  <p className="text-sm text-gray-600">
                    {maxPartySize === 1
                      ? copy.rsvp.partyCountHelpOne
                      : renderTemplate(copy.rsvp.partyCountHelpMany, { max: maxPartySize })}
                  </p>
                </div>

                <div>
                  <label className="block" htmlFor={`names-${event.slug}`}>
                    {copy.rsvp.attendeeNamesLabel}
                  </label>
                  <input
                    id={`names-${event.slug}`}
                    type="text"
                    value={field.attendeeNames}
                    onChange={(e) => update(event.slug, { attendeeNames: e.target.value })}
                    className="w-full border px-2 py-1"
                  />
                  <p className="text-sm text-gray-600">{copy.rsvp.attendeeNamesHelp}</p>
                </div>
              </div>
            )}
          </fieldset>
        );
      })}

      <div>
        <label className="block" htmlFor="guest-message">
          {copy.rsvp.messageLabel}
        </label>
        <textarea
          id="guest-message"
          rows={3}
          value={messageText}
          onChange={(e) => {
            setMessageText(e.target.value);
            if (status !== 'sending') setStatus('idle');
          }}
          className="w-full border px-2 py-1"
        />
        <p className="text-sm text-gray-600">{copy.rsvp.messageHelp}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="border px-4 py-2 font-medium disabled:opacity-50"
        >
          {status === 'sending'
            ? copy.rsvp.submitting
            : answered
              ? copy.rsvp.saveChanges
              : copy.rsvp.submit}
        </button>

        {answered && (
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setErrorText(null);
              setEditing(false);
            }}
            className="border px-4 py-2"
          >
            {copy.rsvp.cancelChange}
          </button>
        )}
      </div>

      <p aria-live="polite" className="text-sm">
        {status === 'error' && <span className="text-red-700">{errorText}</span>}
      </p>

      <p className="text-sm text-gray-600">{copy.rsvp.changeAnytime}</p>
    </form>
  );
}
