'use client';

import { useState } from 'react';
import type { CopyBundle } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';
import type { EventView, RsvpView } from '@/lib/services/types';

/*
 * DISPOSABLE. Deliberately plain. No design decisions are encoded here beyond
 * "the form works and is obvious".
 *
 * It posts to /api/rsvp, which is the permanent contract. A replacement guest
 * UI can be written against that endpoint without touching anything else.
 */

type Props = {
  token: string;
  events: EventView[];
  rsvps: Record<string, RsvpView>;
  message: string | null;
  maxPartySize: number;
  copy: CopyBundle;
};

type FieldState = {
  attending: boolean | null;
  partyCount: number;
  attendeeNames: string;
};

export function RsvpForm({ token, events, rsvps, message, maxPartySize, copy }: Props) {
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

  const update = (slug: string, patch: Partial<FieldState>) => {
    setFields((prev) => ({ ...prev, [slug]: { ...prev[slug]!, ...patch } }));
    setStatus('idle');
  };

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setStatus('sending');
    setErrorText(null);

    // Only send events the guest actually answered.
    const responses = events
      .filter((event) => fields[event.slug]?.attending !== null)
      .map((event) => {
        const field = fields[event.slug]!;
        return {
          eventSlug: event.slug,
          attending: field.attending === true,
          partyCount: field.attending === true ? field.partyCount : 0,
          attendeeNames: field.attendeeNames.trim() || null,
        };
      });

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
        setErrorText(errorMessage);
        setStatus('error');
        return;
      }

      setStatus('saved');
    } catch {
      setErrorText(copy.rsvp.error);
      setStatus('error');
    }
  }

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
                    onChange={(e) =>
                      update(event.slug, { partyCount: Number(e.target.value) })
                    }
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
            setStatus('idle');
          }}
          className="w-full border px-2 py-1"
        />
        <p className="text-sm text-gray-600">{copy.rsvp.messageHelp}</p>
      </div>

      <div>
        <button
          type="submit"
          disabled={status === 'sending'}
          className="border px-4 py-2 font-medium disabled:opacity-50"
        >
          {status === 'sending' ? copy.rsvp.submitting : copy.rsvp.submit}
        </button>
      </div>

      <p aria-live="polite" className="text-sm">
        {status === 'saved' && <span>{copy.rsvp.saved}</span>}
        {status === 'error' && <span className="text-red-700">{errorText}</span>}
      </p>

      <p className="text-sm text-gray-600">{copy.rsvp.changeAnytime}</p>
    </form>
  );
}
