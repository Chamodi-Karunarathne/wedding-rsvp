import type { Locale } from '@/lib/services/types';

/**
 * PERMANENT. Every guest-facing string in the application.
 *
 * Sinhala translation is explicitly out of scope for now, but the structure is
 * here so that adding it later means writing one more object below - not
 * hunting through JSX. Nothing user-visible should be hard-coded in a
 * component.
 *
 * EVERY VALUE IS A PLAIN STRING, and must stay one.
 *
 * The whole bundle is handed to RsvpForm, which is a Client Component, so it
 * crosses the server/client boundary and has to be serializable. A function
 * here - the obvious way to write "party of {n}" - throws at render with
 * "Functions cannot be passed directly to Client Components", and only for
 * the routes that actually reach the form. Strings with {{placeholders}},
 * filled by renderTemplate at the call site, instead. copy.test.ts fails if
 * a non-string ever creeps back in.
 */

export type CopyBundle = {
  invitation: {
    lead: string;
    youAreInvited: string;
    inviteesLabel: string;
    partyOfOne: string;
    /** {{n}} - the maximum party size. */
    partyOf: string;
  };
  events: {
    heading: string;
    when: string;
    where: string;
    dressCode: string;
    directions: string;
    noneHeading: string;
  };
  rsvp: {
    heading: string;
    intro: string;
    /** {{event}}. Used only if a second event is ever added, to tell them apart. */
    attendingQuestion: string;
    attendingQuestionSingle: string;
    yes: string;
    no: string;
    partyCountLabel: string;
    partyCountHelpOne: string;
    /** {{max}} - the maximum party size. */
    partyCountHelpMany: string;
    attendeeNamesLabel: string;
    attendeeNamesHelp: string;
    messageLabel: string;
    messageHelp: string;
    /** {{date}} - the reply date, already formatted in the wedding's zone. */
    deadline: string;
    deadlinePassed: string;
    submit: string;
    submitting: string;
    saved: string;
    /** {{when}} - when the answer was last saved. */
    savedAt: string;
    changeAnytime: string;
    error: string;
    noResponseYet: string;
    /** {{n}} - the party count on the current answer. */
    currentlyAttending: string;
    currentlyDeclined: string;
  };
  note: {
    heading: string;
  };
  thanks: {
    heading: string;
    body: string;
  };
  notFound: {
    heading: string;
    body: string;
  };
};

const en: CopyBundle = {
  invitation: {
    lead: 'Together with their families',
    youAreInvited: 'request the pleasure of your company',
    inviteesLabel: 'This invitation is for',
    partyOfOne: 'Reserved for you',
    partyOf: 'Reserved for up to {{n}} guests',
  },
  events: {
    heading: 'The day',
    when: 'When',
    where: 'Where',
    dressCode: 'Dress code',
    directions: 'Open in maps',
    noneHeading: 'Details to follow',
  },
  rsvp: {
    heading: 'Will you join us?',
    intro: 'Please let us know whether you can join us.',
    attendingQuestion: 'Will you attend the {{event}}?',
    attendingQuestionSingle: 'Will you be joining us?',
    yes: 'Joyfully accepts',
    no: 'Regretfully declines',
    partyCountLabel: 'How many of you?',
    partyCountHelpOne: 'This invitation is for one guest.',
    partyCountHelpMany: 'Up to {{max}} guests.',
    attendeeNamesLabel: 'Who is coming?',
    attendeeNamesHelp: 'Optional. Helps us with place settings.',
    messageLabel: 'A message for us',
    messageHelp: 'Optional.',
    deadline: 'Please let us know by {{date}}.',
    deadlinePassed:
      'Our reply date has passed, but please do still tell us - we would far rather hear ' +
      'from you late than not hear from you at all.',
    submit: 'Send response',
    submitting: 'Sending...',
    saved: 'Thank you - your response has been saved.',
    savedAt: 'Last updated {{when}}.',
    changeAnytime: 'You can change your answer at any time by returning to this page.',
    error: 'Something went wrong. Please try again.',
    noResponseYet: 'No response recorded yet.',
    currentlyAttending: 'Currently attending, party of {{n}}.',
    currentlyDeclined: 'Currently declined.',
  },
  note: {
    heading: 'A note for you',
  },
  thanks: {
    heading: 'Thank you',
    body: 'Thank you for celebrating with us. It meant everything to have you there.',
  },
  notFound: {
    heading: 'We could not find that invitation',
    body:
      'Please check the link you were sent. If it still does not work, do get in touch ' +
      'with us directly and we will send it again.',
  },
};

/** Only `en` is populated. Anything else falls back to it. */
const bundles: { en: CopyBundle } & Partial<Record<Locale, CopyBundle>> = { en };

export function copyFor(locale: Locale): CopyBundle {
  return bundles[locale] ?? bundles.en;
}
