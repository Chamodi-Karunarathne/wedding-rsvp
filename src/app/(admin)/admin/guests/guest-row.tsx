'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimeShort } from '@/lib/format';
import type { GuestListRow } from '@/lib/services/guests';
import type { EventView } from '@/lib/services/types';
import { GuestEditor } from './guest-editor';
import { Feedback, StatusBadge } from '../_components/ui';
import {
  CHANNEL_LABELS,
  INVITATION_LABELS,
  invitationStatus,
  SIDE_LABELS,
  SOURCE_LABELS,
} from '../_components/presentation';

export function GuestRow({
  row,
  events,
  timezone,
}: {
  row: GuestListRow;
  events: EventView[];
  timezone: string;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const state = invitationStatus(row);
  const invited = events.filter((event) => row.eventSlugs.includes(event.slug));
  return (
    <>
      <TableRow ref={rowRef} data-state={open ? 'selected' : undefined}>
        <TableCell data-label="Guest / Family">
          <span className="admin-name">{row.guest.displayName}</span>
          <span className="admin-row-subtext">{SIDE_LABELS[row.guest.side]}</span>
          {row.guest.phone && (
            <a className="admin-row-subtext" href={'tel:' + row.guest.phone}>
              {row.guest.phone}
            </a>
          )}
        </TableCell>
        <TableCell data-label="Invitation">
          <StatusBadge
            tone={state === 'responded' ? 'positive' : state === 'opened' ? 'warm' : 'neutral'}
          >
            {INVITATION_LABELS[state]}
          </StatusBadge>
          <span className="admin-row-subtext">
            {invited.length
              ? invited.map((event) => event.name).join(', ')
              : 'No celebration selected'}
          </span>
        </TableCell>
        <TableCell data-label="Response">
          {invited.map((event) => {
            const reply = row.rsvps.find((r) => r.eventSlug === event.slug);
            return (
              <div key={event.slug} className="mb-2">
                {events.length > 1 && <span className="admin-row-subtext">{event.name}</span>}
                {reply ? (
                  <>
                    <StatusBadge tone={reply.attending ? 'positive' : 'quiet'}>
                      {reply.attending
                        ? 'Coming · ' +
                          reply.partyCount +
                          (reply.partyCount === 1 ? ' guest' : ' guests')
                        : 'Unable to attend'}
                    </StatusBadge>
                    <span className="admin-row-subtext">{SOURCE_LABELS[reply.source]}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Waiting for reply</span>
                )}
              </div>
            );
          })}
          <span className="admin-row-subtext">{row.guest.maxPartySize} places reserved</span>
        </TableCell>
        <TableCell data-label="Actions">
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            aria-controls={'guest-details-' + row.guest.id}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close details' : 'View / edit'}
          </Button>
          {success && (
            <div className="mt-3">
              <Feedback success={success} />
            </div>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="admin-expanded">
          <TableCell colSpan={4}>
            <div id={'guest-details-' + row.guest.id} className="space-y-6">
              <GuestEditor
                events={events}
                guest={row.guest}
                invitedSlugs={row.eventSlugs}
                onDone={(message) => {
                  setOpen(false);
                  setSuccess(message);
                  requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: 'center' }));
                }}
              />
              <section className="space-y-3 border-t pt-5">
                <h3 className="font-semibold">Response and activity</h3>
                {row.rsvps.length === 0 ? (
                  <p className="text-muted-foreground">No reply has been recorded yet.</p>
                ) : (
                  row.rsvps.map((reply) => (
                    <div key={reply.eventSlug} className="space-y-1">
                      <p>
                        {events.length > 1 && (
                          <strong>
                            {events.find((event) => event.slug === reply.eventSlug)?.name}:{' '}
                          </strong>
                        )}
                        {reply.attending ? reply.partyCount + ' guests coming' : 'Unable to attend'}{' '}
                        · {SOURCE_LABELS[reply.source]}
                      </p>
                      {reply.attendeeNames && (
                        <p className="text-muted-foreground">{reply.attendeeNames}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Updated {formatDateTimeShort(new Date(reply.updatedAt), timezone)}
                        {reply.recordedBy ? ' · Recorded by ' + reply.recordedBy : ''}
                      </p>
                    </div>
                  ))
                )}
                {row.message && (
                  <p className="rounded-lg bg-white p-3">
                    <strong className="mb-1 block text-xs text-muted-foreground">
                      Message from your guest
                    </strong>
                    {row.message}
                  </p>
                )}
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">First opened</dt>
                    <dd>
                      {row.firstOpen
                        ? formatDateTimeShort(new Date(row.firstOpen), timezone)
                        : 'Not opened yet'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last opened</dt>
                    <dd>
                      {row.lastOpen
                        ? formatDateTimeShort(new Date(row.lastOpen), timezone)
                        : 'Not opened yet'}
                    </dd>
                  </div>
                </dl>
                {row.channels.map((channel) => (
                  <p key={channel.channel} className="text-sm text-muted-foreground">
                    {CHANNEL_LABELS[channel.channel]}:{' '}
                    {channel.status === 'pending'
                      ? 'Not sent'
                      : channel.status === 'sent'
                        ? 'Sent'
                        : 'Delivered'}
                    {channel.sentBy ? ' · Recorded by ' + channel.sentBy : ''}
                    {channel.sentAt
                      ? ' · ' + formatDateTimeShort(new Date(channel.sentAt), timezone)
                      : ''}
                  </p>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={'/admin/rsvps?guest=' + row.guest.id + '#record-reply'}
                    className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
                  >
                    Record a phone reply
                  </Link>
                  <Link
                    href={'/admin/send?q=' + encodeURIComponent(row.guest.displayName)}
                    className={buttonVariants({ variant: 'ghost', className: 'admin-button' })}
                  >
                    View invitation
                  </Link>
                </div>
              </section>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
