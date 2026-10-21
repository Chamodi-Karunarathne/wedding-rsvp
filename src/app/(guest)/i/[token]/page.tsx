import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { copyFor } from '@/lib/copy';
import { formatDate, formatEventDateTime } from '@/lib/format';
import { hasAdminSession } from '@/lib/api/guard';
import { scriptOf } from '@/lib/domain/script';
import { renderTemplate } from '@/lib/domain/template';
import { loadInvitation } from '@/lib/services/invitation';
import { recordOpen } from '@/lib/services/opens';
import { Monogram } from '../../_components/stationery';
import { Card } from '../../_components/card';
import { Envelope } from '../../_components/envelope';
import { Intro } from '../../_components/intro';
import { RespondButton, RespondFlow } from '../../_components/respond';

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
  const { guest, site } = invitation;

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
        {/* The opening and closing share the commissioned monogram asset. */}
        <div className="intro-piece intro-monogram" data-intro="monogram">
          <Monogram />
        </div>

        {/* Sealed only here: beat 3 is the only thing that ever breaks it. */}
        <div className="intro-piece intro-envelope" data-intro="envelope">
          <Envelope name={guest.cardName} sealed />
        </div>
        <div className="intro-piece intro-closing" data-intro="closing">
          <img className="intro-closing-floral" data-corner="upper" src="/card/rose-corner-upper.1e4c20dbac.webp" alt="" width={512} height={512} />
          <img className="intro-closing-floral" data-corner="lower" src="/card/rose-corner-lower.6277f50c09.webp" alt="" width={512} height={512} />
          <Monogram />
          <p className="intro-farewell" data-intro-reveal="">{copy.intro.farewell}</p>
          <span className="intro-rule" data-intro-reveal="" />
        </div>
      </Intro>

      {/*
        With no JavaScript a <dialog> is display:none, which would leave a
        guest holding an invitation with no way to read the details or reply.
        The dialog's contents are ordinary server-rendered HTML, so this lays
        the same markup out inline instead and hides the button that would
        have opened it. The form cannot submit without script - the telephone
        numbers inside it are the answer, and they are in there too.
      */}
      <noscript>
        <style>{`
          .respond-btn { display: none }
          .sheet {
            display: block;
            position: static;
            width: 100%;
            max-width: 34rem;
            margin: 2rem auto 0;
          }
          .sheet-form, .sheet-actions, .sheet-close { display: none }
          .sheet-inner { max-height: none }
          .sheet-scroll { overflow: visible }
        `}</style>
      </noscript>

      <main>
        {/*
          The card is the invitation. Everything that used to be set out in a
          readable column beneath it - when, where, dress code, the reply form,
          the numbers to telephone - is now inside the dialog the card's one
          button opens, so the page under the card is empty and the card is not
          competing with a transcript of itself.
        */}
        <RespondFlow
          token={guest.token}
          eventSlug={primarySlug}
          maxPartySize={guest.maxPartySize}
          existing={
            primaryRsvp
              ? {
                  attending: primaryRsvp.attending,
                  partyCount: primaryRsvp.partyCount,
                  attendeeNames: primaryRsvp.attendeeNames,
                }
              : null
          }
          existingMessage={invitation.message}
          copy={copy}
          monogram={<Monogram />}
          details={{
            when: primaryEvent ? formatEventDateTime(primaryEvent.startsAt, site.timezone) : '',
            venueName: primaryEvent?.venueName ?? '',
            venueAddress: primaryEvent?.venueAddress ?? '',
            dressCode: primaryEvent?.dressCode ?? null,
            mapUrl: primaryEvent?.mapUrl ?? null,
            deadline: formatDate(invitation.rsvpDeadline, site.timezone),
            deadlinePassed: invitation.rsvpDeadlinePassed,
            contacts: site.rsvpContacts,
          }}
        >
          {/*
            The card alone.

            The envelope belongs to the opening sequence and stops existing
            once the card is out of it - beat 4 slides the card out as the
            envelope falls away, and an envelope still sitting beside the card
            afterwards undoes that: it reads as a second, unopened invitation
            rather than as the one this card came from. The guest's name is on
            the envelope during the sequence, and in the sheet after it.
          */}
          <div className="invitation-hero">
            <div data-intro="card">
              <Card
                brideName={site.brideName}
                groomName={site.groomName}
                date={primaryEvent ? new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(primaryEvent.startsAt) : ''}
                time={primaryEvent ? new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(primaryEvent.startsAt) : ''}
                eventName={primaryEvent?.name ?? ''}
                venueName={primaryEvent?.venueName ?? ''}
                venueAddress={primaryEvent?.venueAddress ?? ''}
                replyBy={new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone, day: 'numeric', month: 'long' }).format(invitation.rsvpDeadline)}
                contacts={site.rsvpContacts}
              >
                <RespondButton />
              </Card>
            </div>
            <div className="invitation-dedication">
              <p>{copy.invitation.inviteesLabel}</p>
              <p data-script={scriptOf(guest.cardName)}>{guest.cardName}</p>
            </div>
          </div>
        </RespondFlow>

        {/*
          What a screen reader gets in place of the artwork, which is
          aria-hidden in full. Visually hidden rather than deleted: the card is
          five hundred vector paths and announces nothing, and the personal
          note is the one thing on this page written to this household alone.
        */}
        <div className="sr-only">
          <h2>{copy.card.readableHeading}</h2>
          <p>{copy.invitation.lead}</p>
          <p>
            {site.brideName} &amp; {site.groomName}
          </p>
          <p>{copy.invitation.youAreInvited}</p>
          <p>{copy.invitation.inviteesLabel}</p>
          <p>{guest.displayName}</p>
        </div>
      </main>
    </>
  );
}
