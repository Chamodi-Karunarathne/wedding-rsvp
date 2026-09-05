import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { copyFor } from '@/lib/copy';
import { renderTemplate } from '@/lib/domain/template';
import { formatDate, formatEventDateTime } from '@/lib/format';
import { hasAdminSession } from '@/lib/api/guard';
import { cardAsset } from '@/lib/domain/card-assets';
import { loadInvitation } from '@/lib/services/invitation';
import { recordOpen } from '@/lib/services/opens';
import { InlineSvg } from '@/lib/svg';
import type { InvitationView, SectionId } from '@/lib/services/types';
import { Card } from '../../_components/card';
import { Envelope } from '../../_components/envelope';
import { Intro } from '../../_components/intro';
import { CardRsvp } from '../../_components/card-rsvp';
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

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string; noanim?: string }>;
};

/**
 * The WhatsApp preview card is the image AND the line of text beside it, and
 * both are cached about as permanently. The title was inheriting "Wedding"
 * from the root layout, so every guest's preview read as a generic stub next
 * to artwork that had been thought about carefully.
 *
 * Deliberately says nothing a passer-by should not see: the couple, and that
 * it is an invitation. No guest name, no venue, no date - a forwarded
 * screenshot of a preview should not carry a household's details.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await loadInvitation(token);

  if (!result.ok) {
    return { title: 'Invitation', robots: { index: false, follow: false } };
  }

  const { site } = result.data;
  return {
    title: `${site.brideName} & ${site.groomName}`,
    description: 'You are invited. Tap to open your invitation and reply.',
    robots: { index: false, follow: false },
  };
}

export default async function InvitationPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const result = await loadInvitation(token);
  if (!result.ok) notFound();

  const invitation = result.data;

  /*
   * The only analytics write in the system.
   *
   * Skips link-preview crawlers, so WhatsApp fetching the URL to build its
   * preview does not count as an open - and skips anyone signed in to the
   * admin console, because someone checking what was sent is not the household
   * reading it. 'opened' versus 'sent' is what decides between resending a
   * link and telephoning, so it has to mean what it says.
   */
  const headerList = await headers();
  await recordOpen(invitation.guest.id, {
    userAgent: headerList.get('user-agent'),
    preview: query.preview === '1' || (await hasAdminSession()),
  });

  const copy = copyFor(invitation.guest.language);
  const { guest } = invitation;

  /*
   * The event the card's buttons answer for. There is one, but the page reads
   * it from the invitation rather than naming a slug, so a second event added
   * later is a data change and this keeps working for the first one.
   */
  const primaryEvent = invitation.events[0];
  const primarySlug = primaryEvent?.slug ?? '';
  const primaryRsvp = primarySlug ? invitation.rsvps[primarySlug] : undefined;

  return (
    <>
      {/*
        The three pieces the opening sequence moves. Server-rendered so they
        are ready the moment the timeline starts, inside an overlay that is
        `hidden` until script decides otherwise.
      */}
      <Intro token={guest.token} labels={{ skip: copy.intro.skip, replay: copy.intro.replay }}>
        <div className="intro-piece intro-monogram" data-intro="monogram">
          {/*
            The gold border of the storyboard's last frame. Marked
            data-intro-reveal so it arrives with the closing line and NOT with
            the opening beat - the mark opens the sequence bare and is framed
            only when it closes it.
          */}
          {/*
            An <img>, not an inlined SVG. Nothing animates inside the frame, so
            it has no reason to be inline - and as an inline SVG it inherited
            the monogram's clip-path wipe and its stacking context and refused
            to paint at all.
          */}
          <div className="intro-frame" data-intro-reveal aria-hidden="true">
            <img alt="" src={cardAsset('frame-ornament.svg')} width={400} height={400} />
          </div>
          <InlineSvg name="monogram" />
          <p className="intro-farewell" data-intro-reveal>
            {copy.intro.farewell}
          </p>
          <hr className="intro-rule" data-intro-reveal />
        </div>

        {/* Sealed only here: beat 3 is the only thing that ever breaks it. */}
        <div className="intro-piece intro-envelope" data-intro="envelope">
          <Envelope name={guest.cardName} sealed />
        </div>
      </Intro>

      <main>
        <div className="invitation-hero">
          {/* The guest's name, where a handwritten one goes. */}
          <Envelope name={guest.cardName} />

          {/* The card. Decorative in full; the readable version is below it. */}
          <div data-intro="card">
            <Card>
              <CardRsvp
                token={guest.token}
                eventSlug={primarySlug}
                maxPartySize={guest.maxPartySize}
                existing={
                  primaryRsvp
                    ? { attending: primaryRsvp.attending, partyCount: primaryRsvp.partyCount }
                    : null
                }
                copy={copy}
                monogram={<InlineSvg name="monogram" />}
              />
            </Card>
          </div>
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

          {invitation.site.rsvpContacts.length > 0 && (
            <div className="mt-3 text-sm">
              <h3 className="font-medium">{copy.card.contactsHeading}</h3>
              <ul className="contact-list mt-1">
                {invitation.site.rsvpContacts.map((contact) => (
                  <li key={`${contact.name}-${contact.phone}`}>
                    <a
                      className="underline"
                      href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                    >
                      {contact.name} {contact.phone}
                    </a>
                    {contact.side && ` (${contact.side})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rsvp-live mt-4">
            <RsvpForm
              /*
               * Keyed on the saved answer so that answering on the card
               * remounts this with the new value. A refresh alone would leave
               * its useState initialisers holding the old one.
               */
              key={
                events[0] ? (rsvps[events[0].slug]?.updatedAt?.toISOString() ?? 'unanswered') : 'none'
              }
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
