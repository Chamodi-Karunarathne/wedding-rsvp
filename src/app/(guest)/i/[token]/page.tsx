import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { copyFor } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';
import { formatDate, formatEventDateTime } from '@/lib/format';
import { loadInvitation } from '@/lib/services/invitation';
import { recordOpen } from '@/lib/services/opens';
import { InlineSvg } from '@/lib/svg';
import type { InvitationView, SectionId } from '@/lib/services/types';
import { Card } from '../../_components/card';
import { Envelope } from '../../_components/envelope';
import { Intro } from '../../_components/intro';
import { RsvpForm } from './rsvp-form';

/*
 * DISPOSABLE. This entire directory is expected to be deleted and rewritten
 * if the design changes again. It reads through lib/services only and never
 * touches the data layer, so deleting it breaks nothing underneath.
 *
 * The page is complete and functional as server-rendered HTML. The intro
 * sequence is an overlay that starts hidden and is only ever revealed by
 * script - see _components/intro.tsx.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;

  const result = await loadInvitation(token);
  if (!result.ok) notFound();

  const invitation = result.data;

  // The only analytics write in the system. Skips link-preview crawlers, so
  // WhatsApp fetching the URL to build its preview does not count as an open.
  const headerList = await headers();
  await recordOpen(invitation.guest.id, headerList.get('user-agent'));

  const copy = copyFor(invitation.guest.language);
  const { guest } = invitation;

  return (
    <>
      {/*
        The three pieces the opening sequence moves. Server-rendered so they
        are ready the moment the timeline starts, inside an overlay that is
        `hidden` until script decides otherwise.
      */}
      <Intro token={guest.token} labels={{ skip: copy.intro.skip, replay: copy.intro.replay }}>
        <div className="intro-piece" data-intro="monogram">
          <InlineSvg name="monogram" />
        </div>
        <div className="intro-piece" data-intro="envelope">
          <Envelope name={guest.cardName} />
        </div>
        <div className="intro-piece intro-seal" data-intro="seal">
          <InlineSvg name="seal" />
        </div>
      </Intro>

      <main>
        {/* The envelope, with the guest's name where a handwritten one goes. */}
        <div className="mb-8">
          <Envelope name={guest.cardName} />
        </div>

        {/* The card. Decorative in full; the readable version is below it. */}
        <div className="mb-10" data-intro="card">
          <Card>
            <span>{copy.card.slotPrompt}</span>
            <a href="#rsvp">{copy.card.slotLink}</a>
          </Card>
        </div>

        {/*
          Phase decides ORDER, never visibility. Every section renders in every
          phase - a guest opening this for the first time in late November must
          still see the invitation, and the RSVP form must always be reachable.
        */}
        <div className="legible">
          {invitation.sections.map((id) => (
            <Section key={id} id={id} invitation={invitation} copy={copy} />
          ))}
        </div>
      </main>
    </>
  );
}

function Section({
  id,
  invitation,
  copy,
}: {
  id: SectionId;
  invitation: InvitationView;
  copy: ReturnType<typeof copyFor>;
}) {
  const { guest, events, rsvps, site, message } = invitation;

  switch (id) {
    case 'invitation':
      return (
        <section className="mb-8 border-b pb-6">
          {/*
            This is what a screen reader announces instead of card-text.svg,
            and what anyone reads who cannot make out copperplate at card
            scale - which on a phone lands around six pixels.
          */}
          <h2 className="sr-only">{copy.card.readableHeading}</h2>
          <p>{copy.invitation.lead}</p>
          <p className="names my-2">
            {site.brideName} &amp; {site.groomName}
          </p>
          <p>{copy.invitation.youAreInvited}</p>
          <p className="mt-4 text-sm opacity-70">{copy.invitation.inviteesLabel}</p>
          <p className="text-lg wrap-break-word">{guest.displayName}</p>
          <p className="text-sm opacity-70">
            {guest.maxPartySize === 1
              ? copy.invitation.partyOfOne
              : renderTemplate(copy.invitation.partyOf, { n: guest.maxPartySize })}
          </p>
        </section>
      );

    case 'note':
      if (!guest.personalNote) return null;
      return (
        <section className="mb-8 border-b pb-6">
          <h2>{copy.note.heading}</h2>
          <p className="mt-2 whitespace-pre-line">{guest.personalNote}</p>
        </section>
      );

    case 'events': {
      // There is one event, so no list chrome and no name heading - the page
      // is already about it. The map stays rather than picking events[0], so
      // that adding a second event stays a data change.
      const named = events.length > 1;

      return (
        <section className="mb-8 border-b pb-6">
          <h2>{copy.events.heading}</h2>
          {events.length === 0 ? (
            <p className="mt-2">{copy.events.noneHeading}</p>
          ) : (
            <div className="mt-2 space-y-4">
              {events.map((event) => (
                <div key={event.slug}>
                  {named && <h3 className="font-medium">{event.name}</h3>}
                  <dl className="text-sm">
                    <dt className="font-medium">{copy.events.when}</dt>
                    <dd>{formatEventDateTime(event.startsAt, site.timezone)}</dd>
                    <dt className="mt-1 font-medium">{copy.events.where}</dt>
                    <dd>
                      {event.venueName}
                      <br />
                      {event.venueAddress}
                    </dd>
                    {event.dressCode && (
                      <>
                        <dt className="mt-1 font-medium">{copy.events.dressCode}</dt>
                        <dd>{event.dressCode}</dd>
                      </>
                    )}
                  </dl>
                  {event.mapUrl && (
                    <p className="mt-1 text-sm">
                      <a
                        href={event.mapUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {copy.events.directions}
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case 'rsvp':
      return (
        <section id="rsvp" className="mb-8 scroll-mt-6 border-b pb-6">
          <h2>{copy.rsvp.heading}</h2>
          <p className="mt-1">{copy.rsvp.intro}</p>

          {/*
            The reply date is shown, never enforced. After it passes this
            softens rather than closing the form - a late answer still saves.
          */}
          <p className="mt-1 text-sm opacity-70">
            {invitation.rsvpDeadlinePassed
              ? copy.rsvp.deadlinePassed
              : renderTemplate(copy.rsvp.deadline, {
                  date: formatDate(invitation.rsvpDeadline, site.timezone),
                })}
          </p>

          {/*
            No JavaScript means the form below cannot send anything, so it is
            hidden rather than left there to be filled in and swallowed. The
            saved answer above still renders - it is server-rendered - and
            phone responses are a first-class path now.
          */}
          <noscript>
            <style>{`.rsvp-live{display:none}`}</style>
            <p className="mt-3 text-sm opacity-70">{copy.rsvp.noScript}</p>
          </noscript>

          <div className="rsvp-live mt-4">
            <RsvpForm
              token={guest.token}
              events={events}
              rsvps={rsvps}
              message={message}
              maxPartySize={guest.maxPartySize}
              timezone={site.timezone}
              copy={copy}
            />
          </div>
        </section>
      );

    case 'thanks':
      return (
        <section className="mb-8">
          <h2>{copy.thanks.heading}</h2>
          <p className="mt-2">{copy.thanks.body}</p>
        </section>
      );
  }
}
