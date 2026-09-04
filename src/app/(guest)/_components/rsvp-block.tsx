import type { RsvpContact } from '@/lib/domain/config';
import { renderTemplate } from '@/lib/domain/template';
import type { CopyBundle } from '@/lib/copy';

/*
 * What sits in the RSVP region printed on the card.
 *
 * The reply date and the numbers to telephone - the same block the printed
 * card carries, and what beat 8 of the storyboard reveals. The form is in the
 * readable section below; this region is under a fifth of the card's height
 * and could not hold one.
 *
 * The numbers are tel: links. Half the guests reading this are on the phone
 * they would be dialling from.
 */

type Props = {
  copy: CopyBundle;
  /** Already formatted in the wedding's timezone. */
  deadline: string;
  contacts: readonly RsvpContact[];
};

export function RsvpBlock({ copy, deadline, contacts }: Props) {
  return (
    <>
      <span className="slot-heading">{copy.card.slotHeading}</span>
      <span>{renderTemplate(copy.card.slotBy, { date: deadline })}</span>

      {contacts.map((contact) => (
        <span key={`${contact.name}-${contact.phone}`}>
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
            {contact.name} {contact.phone}
          </a>
          {contact.side && ` (${contact.side})`}
        </span>
      ))}

      <a href="#rsvp">{copy.card.slotLink}</a>
    </>
  );
}
