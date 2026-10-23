import Link from 'next/link';
import {
  RiArrowRightLine,
  RiMailLine,
  RiPhoneLine,
  RiGroupLine,
  RiSettings3Line,
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
  const days = event ? Math.ceil((event.startsAt.getTime() - now.getTime()) / 86400000) : null;
  const notSent = guests.filter((row) => invitationStatus(row) === 'not_sent').length;
  const waiting = guests.filter((row) => matchesReply(row, 'waiting')).length;
  const actions = [
    {
      label: 'Send invitations',
      hint: 'Prepare personal WhatsApp messages',
      href: '/admin/send',
      icon: RiMailLine,
    },
    {
      label: 'Record a phone reply',
      hint: 'Save an answer from a family member',
      href: '/admin/rsvps#record-reply',
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
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Overview"
        title={'Wedding of ' + config.site.brideName + ' & ' + config.site.groomName}
        description={
          event
            ? formatDate(event.startsAt, config.site.timezone) + ' · ' + event.venueName
            : 'Your invitations and replies, all in one place.'
        }
      >
        {days !== null && days >= 0 && (
          <span className="rounded-full border border-border bg-white px-4 py-2 text-sm">
            {days === 0 ? 'Today is the day' : days + ' days to go'}
          </span>
        )}
      </AdminPageHeader>

      <section aria-label="Wedding response totals" className="space-y-5">
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

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
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
            <CardTitle>What would you like to do?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {actions.map(({ label, hint, href, icon: Icon }) => (
              <Link
                href={href}
                key={href}
                className="flex min-h-16 items-center gap-3 rounded-xl p-2 hover:bg-muted"
              >
                <span className="rounded-lg bg-muted p-2.5 text-primary">
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
      <p className="text-sm text-muted-foreground">
        Replies requested by {formatDate(config.phase.rsvpDeadline, config.site.timezone)}. Late
        replies are still welcome.
      </p>
    </div>
  );
}
