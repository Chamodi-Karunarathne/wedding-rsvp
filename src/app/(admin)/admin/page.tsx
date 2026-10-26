import Link from 'next/link';
import {
  RiArrowRightLine,
  RiMailLine,
  RiPhoneLine,
  RiGroupLine,
  RiSettings3Line,
  RiCalendarCheckLine,
} from '@remixicon/react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getConfig } from '@/lib/services/config';
import { summarizeGuests } from '@/lib/services/dashboard';
import { listGuests } from '@/lib/services/guests';
import { listEvents } from '@/lib/services/events';
import { formatDate } from '@/lib/format';
import { CountsBlock } from './_components/counts';
import { AdminPageHeader, EmptyState } from './_components/ui';
import { invitationStatus, matchesReply } from './_components/presentation';
import { WeddingCountdown } from './_components/wedding-countdown';
import './overview.css';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [config, guests, events] = await Promise.all([
    getConfig(),
    listGuests(),
    listEvents(),
  ]);
  const summary = summarizeGuests(guests, events);
  const event = summary.perEvent[0]?.event;
  const now = new Date();
  const notSent = guests.filter((row) => invitationStatus(row) === 'not_sent').length;
  const waiting = guests.filter((row) => matchesReply(row, 'waiting')).length;
  const actions = [
    {
      label: 'Send invitations',
      hint: 'Prepare personal messages for every channel',
      href: '/admin/send',
      icon: RiMailLine,
    },
    {
      label: 'Record a phone reply',
      hint: 'Save an answer from a family member',
      href: '/admin/rsvps',
      icon: RiPhoneLine,
    },
    {
      label: 'Find a guest',
      hint: 'Search or update your guest list',
      href: '/admin/guests',
      icon: RiGroupLine,
    },
    {
      label: 'Update wedding details',
      hint: 'Names, contacts and invitation wording',
      href: '/admin/config',
      icon: RiSettings3Line,
    },
  ];
  return (
    <div className="admin-overview space-y-7">
      <AdminPageHeader
        eyebrow="Overview"
        title={'Wedding of ' + config.site.brideName + ' & ' + config.site.groomName}
        description="Your invitations, replies and plans, all in one place."
      />

      {event && <WeddingCountdown startsAt={event.startsAt.toISOString()} initialNow={now.getTime()}
        timeZone={config.site.timezone} dateLabel={formatDate(event.startsAt, config.site.timezone)}
        venueName={event.venueName} eventName={event.name} />}

      <section aria-label="Wedding response totals" className="space-y-5">
        <div className="admin-overview-section-heading">
          <h2>Your guest list at a glance</h2>
          <p>Live totals from your invitations and replies</p>
        </div>
        {summary.perEvent.length > 0 ? (
          summary.perEvent.map((counts) => (
            <CountsBlock
              key={counts.event.slug}
              counts={counts}
              named={summary.perEvent.length > 1}
            />
          ))
        ) : (
          <Card>
            <EmptyState
              title="Your wedding details are being prepared"
              description="The person who set up the website can help add the celebration details."
            />
          </Card>
        )}
      </section>

      <div className="admin-overview-grid">
        <Card>
          <CardHeader>
            <CardTitle>Needs your attention</CardTitle>
          </CardHeader>
          <CardContent>
            {guests.length === 0 ? (
              <EmptyState
                title="Add your first guest"
                description="Start your guest list by adding a household or importing your family’s list."
              >
                <Link
                  href="/admin/guests"
                  className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
                >
                  Open guest list
                </Link>
              </EmptyState>
            ) : notSent === 0 && waiting === 0 ? (
              <EmptyState
                title="You're all caught up"
                description="Every invitation has progressed and every invited household has replied."
              />
            ) : (
              <>
                {notSent > 0 && (
                  <Link href="/admin/send?state=not_sent" className="admin-attention-link">
                    <span>
                      <strong>
                        {notSent} {notSent === 1 ? 'invitation needs' : 'invitations need'} sending
                      </strong>
                      <span className="admin-row-subtext">
                        View invitations with no sending record
                      </span>
                    </span>
                    <RiArrowRightLine className="size-5 shrink-0" aria-hidden="true" />
                  </Link>
                )}
                {waiting > 0 && (
                  <Link href="/admin/rsvps?status=waiting" className="admin-attention-link">
                    <span>
                      <strong>
                        {waiting} {waiting === 1 ? 'household is' : 'households are'} waiting to
                        reply
                      </strong>
                      <span className="admin-row-subtext">
                        See who you may want to follow up with
                      </span>
                    </span>
                    <RiArrowRightLine className="size-5 shrink-0" aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>A little planning</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {actions.map(({ label, hint, href, icon: Icon }) => (
              <Link
                href={href}
                key={href}
                className="admin-overview-action"
              >
                <span className="admin-overview-action-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="font-medium">{label}</strong>
                  <span className="admin-row-subtext">{hint}</span>
                </span>
                <RiArrowRightLine size={17} aria-hidden="true" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="admin-overview-reply-note">
        <RiCalendarCheckLine size={17} aria-hidden="true" className="shrink-0" />
        <span>
        Replies requested by {formatDate(config.phase.rsvpDeadline, config.site.timezone)}. Late
        replies are still welcome.
        </span>
      </p>
    </div>
  );
}
