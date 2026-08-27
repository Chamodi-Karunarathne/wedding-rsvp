import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { copyFor } from '@/lib/copy';
import { formatEventDateTime } from '@/lib/format';
import { loadInvitation } from '@/lib/services/invitation';
import { recordOpen } from '@/lib/services/opens';
import type { InvitationView, SectionId } from '@/lib/services/types';
import { RsvpForm } from './rsvp-form';

/*
 * DISPOSABLE. This entire directory is expected to be deleted and rewritten
 * once the visual design is decided.
 *
 * It reads through lib/services only and never touches the data layer
 * directly, so deleting it breaks nothing underneath. Unstyled semantic HTML
 * with minimal Tailwind is the correct amount of effort here.
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

  return (
    <main>
      {/*
        Phase decides ORDER, never visibility. Every section renders in every
        phase - a guest opening this for the first time in late November must
        still see the invitation, and the RSVP form must always be reachable.
      */}
      {invitation.sections.map((id) => (
        <Section key={id} id={id} invitation={invitation} copy={copy} />
      ))}
    </main>
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
          <p>{copy.invitation.lead}</p>
          <h1 className="my-2 text-2xl font-semibold">
            {site.brideName} &amp; {site.groomName}
          </h1>
          <p>{copy.invitation.youAreInvited}</p>
          <p className="mt-4 text-sm text-gray-600">{copy.invitation.inviteesLabel}</p>
          <p className="text-lg break-words">{guest.displayName}</p>
          <p className="text-sm text-gray-600">
            {guest.maxPartySize === 1
              ? copy.invitation.partyOfOne
              : copy.invitation.partyOf(guest.maxPartySize)}
          </p>
        </section>
      );

    case 'note':
      if (!guest.personalNote) return null;
      return (
        <section className="mb-8 border-b pb-6">
          <h2 className="text-xl font-semibold">{copy.note.heading}</h2>
          <p className="mt-2 whitespace-pre-line">{guest.personalNote}</p>
        </section>
      );

    case 'events':
      return (
        <section className="mb-8 border-b pb-6">
          <h2 className="text-xl font-semibold">{copy.events.heading}</h2>
          {events.length === 0 ? (
            <p className="mt-2">{copy.events.noneHeading}</p>
          ) : (
            <ul className="mt-2 space-y-4">
              {events.map((event) => (
                <li key={event.slug}>
                  <h3 className="font-medium">{event.name}</h3>
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
                </li>
              ))}
            </ul>
          )}
        </section>
      );

    case 'rsvp':
      return (
        <section className="mb-8 border-b pb-6">
          <h2 className="text-xl font-semibold">{copy.rsvp.heading}</h2>
          <p className="mt-1">{copy.rsvp.intro}</p>

          <ul className="mt-2 text-sm text-gray-600">
            {events.map((event) => {
              const existing = rsvps[event.slug];
              return (
                <li key={event.slug}>
                  {event.name}:{' '}
                  {!existing
                    ? copy.rsvp.noResponseYet
                    : existing.attending
                      ? copy.rsvp.currentlyAttending(existing.partyCount)
                      : copy.rsvp.currentlyDeclined}
                </li>
              );
            })}
          </ul>

          <div className="mt-4">
            <RsvpForm
              token={guest.token}
              events={events}
              rsvps={rsvps}
              message={message}
              maxPartySize={guest.maxPartySize}
              copy={copy}
            />
          </div>
        </section>
      );

    case 'thanks':
      return (
        <section className="mb-8">
          <h2 className="text-xl font-semibold">{copy.thanks.heading}</h2>
          <p className="mt-2">{copy.thanks.body}</p>
        </section>
      );
  }
}
