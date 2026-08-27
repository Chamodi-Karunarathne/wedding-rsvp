import type { Locale } from '@/lib/services/types';

/**
 * PERMANENT. Every guest-facing string in the application.
 *
 * Sinhala translation is explicitly out of scope for now, but the structure is
 * here so that adding it later means writing one more object below - not
 * hunting through JSX. Nothing user-visible should be hard-coded in a
 * component.
 */

export type CopyBundle = {
  invitation: {
    lead: string;
    youAreInvited: string;
    inviteesLabel: string;
    partyOfOne: string;
    partyOf: (n: number) => string;
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
    /** Used only if a second event is ever added, to tell them apart. */
    attendingQuestion: (eventName: string) => string;
    attendingQuestionSingle: string;
    yes: string;
    no: string;
    partyCountLabel: string;
    partyCountHelp: (max: number) => string;
    attendeeNamesLabel: string;
    attendeeNamesHelp: string;
    messageLabel: string;
    messageHelp: string;
    deadline: (date: string) => string;
    deadlinePassed: string;
    submit: string;
    submitting: string;
    saved: string;
    savedAt: (when: string) => string;
    changeAnytime: string;
    error: string;
    noResponseYet: string;
    currentlyAttending: (n: number) => string;
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
    partyOf: (n) => `Reserved for up to ${n} guests`,
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
    attendingQuestion: (eventName) => `Will you attend the ${eventName}?`,
    attendingQuestionSingle: 'Will you be joining us?',
    yes: 'Joyfully accepts',
    no: 'Regretfully declines',
    partyCountLabel: 'How many of you?',
    partyCountHelp: (max) =>
      max === 1 ? 'This invitation is for one guest.' : `Up to ${max} guests.`,
    attendeeNamesLabel: 'Who is coming?',
    attendeeNamesHelp: 'Optional. Helps us with place settings.',
    messageLabel: 'A message for us',
    messageHelp: 'Optional.',
    deadline: (date) => `Please let us know by ${date}.`,
    deadlinePassed:
      'Our reply date has passed, but please do still tell us - we would far rather hear ' +
      'from you late than not hear from you at all.',
    submit: 'Send response',
    submitting: 'Sending...',
    saved: 'Thank you - your response has been saved.',
    savedAt: (when) => `Last updated ${when}.`,
    changeAnytime: 'You can change your answer at any time by returning to this page.',
    error: 'Something went wrong. Please try again.',
    noResponseYet: 'No response recorded yet.',
    currentlyAttending: (n) => `Currently attending, party of ${n}.`,
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
