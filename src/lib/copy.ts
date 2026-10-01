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
    fewerPlaces: string;
    morePlaces: string;
    partyCountHelpOne: string;
    /** {{max}} - the maximum party size. */
    partyCountHelpMany: string;
    attendeeNamesLabel: string;
    attendeeNamesHelp: string;
    attendeeNamesPlaceholder: string;
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

    /* The saved-response panel a returning guest lands on. */
    savedHeading: string;
    /** {{n}} - how many are coming. */
    savedAttending: string;
    savedAttendingOne: string;
    savedDeclined: string;
    change: string;
    cancelChange: string;
    saveChanges: string;
    /** Shown only when the form cannot work, i.e. no JavaScript. */
    noScript: string;
  };
  note: {
    heading: string;
  };
  /* The card itself: the RSVP region printed on it, and the opening sequence. */
  card: {
    /* The two buttons in the RSVP region printed on the card. */
    accept: string;
    decline: string;
    /** Shown when the household may bring more than one. */
    howMany: string;
    confirm: string;
    back: string;
    /** {{n}} - the saved party count, on a card already answered. */
    savedAttending: string;
    savedDeclined: string;
    change: string;
    /** Announced in place of the artwork, which is aria-hidden. */
    readableHeading: string;
    /** Heading for the telephone contacts in the readable section. */
    contactsHeading: string;
    /** The single control on the card. Opens the details and reply dialog. */
    respond: string;
    respondAgain: string;
  };
  /**
   * The dialog the card's button opens: the details, and the reply.
   *
   * These are also what a guest with no JavaScript reads, because the dialog's
   * contents are rendered inline in that case rather than being unreachable.
   */
  dialog: {
    title: string;
    close: string;
    detailsHeading: string;
    replyHeading: string;
    closeLabel: string;
    replyBy: string;
    optional: string;
    chooseResponse: string;
  };
  /** The closing frame, shown the moment somebody answers. */
  ending: {
    accepted: string;
    declined: string;
    close: string;
  };
  intro: {
    skip: string;
    replay: string;
    /** The closing line, under the monogram. */
    farewell: string;
  };
  thanks: {
    heading: string;
    body: string;
    /** Shown in place of the card once a reply has just been sent. */
    attendingBody: string;
    declinedBody: string;
    declinedFarewell: string;
    change: string;
  };
  notFound: {
    heading: string;
    body: string;
  };
};

const en: CopyBundle = {
  /*
   * The register: warm, a little old-fashioned, and never chatty. This is a
   * Poruwa ceremony in Colombo and the card it echoes is set in copperplate;
   * the words on screen should sound like they belong on that card, not like
   * a form. So "Will you be at our side?" rather than "RSVP", and "With the
   * greatest regret" rather than "Decline".
   *
   * Two rules that are not style preferences:
   *   - Nothing said to somebody who has just declined may imply we expect to
   *     see them. Every declined line below is written separately for that
   *     reason, never shared with the accepted one.
   *   - Every value is a plain string. The whole bundle crosses into a Client
   *     Component, so a function here throws at render on exactly the routes
   *     that matter. copy.test.ts fails if one creeps back in.
   */
  invitation: {
    lead: 'Together with their families',
    youAreInvited: 'request the pleasure of your company',
    inviteesLabel: 'This invitation was written for',
    partyOfOne: 'A place has been kept for you',
    partyOf: 'Places have been kept for {{n}} of you',
  },
  events: {
    heading: 'The day itself',
    when: 'The hour',
    where: 'The place',
    dressCode: 'What to wear',
    directions: 'Find your way there',
    noneHeading: 'Still being written',
  },
  rsvp: {
    heading: 'Will you be at our side?',
    intro: 'Tell us, and we will keep your place.',
    attendingQuestion: 'Will you be with us for the {{event}}?',
    attendingQuestionSingle: 'Will you be at our side?',
    yes: 'With the greatest joy',
    no: 'With the greatest regret',
    partyCountLabel: 'How many places shall we keep?',
    fewerPlaces: 'One fewer guest',
    morePlaces: 'One more guest',
    partyCountHelpOne: 'This invitation was written for one.',
    partyCountHelpMany: 'Up to {{max}}, whenever you are ready to say.',
    attendeeNamesLabel: 'Who shall we be expecting?',
    attendeeNamesHelp: 'If you would like your names written at the table.',
    attendeeNamesPlaceholder: 'Names of those attending',
    messageLabel: 'A word for us',
    messageHelp: 'Only if you would like to.',
    deadline: 'We hope to hear from you by {{date}}.',
    deadlinePassed:
      'Our reply date has come and gone, but do still tell us - we would far rather hear ' +
      'from you late than never hear from you at all.',
    submit: 'Send it with our love',
    submitting: 'On its way...',
    saved: 'Safely received, with thanks.',
    savedAt: 'Last written {{when}}.',
    changeAnytime: 'You can change your reply at any time.',
    error: 'That did not quite arrive. Would you try once more?',
    noResponseYet: 'We have not heard from you yet.',
    currentlyAttending: 'Expecting {{n}} of you.',
    currentlyDeclined: 'You have told us you cannot come.',

    savedHeading: 'What we have written down',
    savedAttending: 'We are expecting {{n}} of you.',
    savedAttendingOne: 'We are expecting you.',
    savedDeclined: 'We know you cannot be there, and we understand.',
    change: 'Tell us otherwise',
    cancelChange: 'Leave it as it stands',
    saveChanges: 'Save your reply',
    noScript:
      'Sending a reply from here needs JavaScript. If you would rather not turn it on, ' +
      'telephone us and we will write your answer down ourselves.',
  },
  note: {
    heading: 'A word meant only for you',
  },
  card: {
    accept: 'With the greatest joy',
    decline: 'With the greatest regret',
    howMany: 'How many places?',
    confirm: 'Send it',
    back: 'A moment',
    savedAttending: 'Expecting {{n}} of you',
    savedDeclined: 'You will be missed',
    change: 'Tell us otherwise',
    readableHeading: 'Your invitation',
    contactsHeading: 'Or simply telephone us',
    respond: 'Open your invitation',
    respondAgain: 'Tell us otherwise',
  },
  dialog: {
    title: 'The day, and your place in it',
    close: 'Not just yet',
    detailsHeading: 'The day itself',
    replyHeading: 'Your reply',
    closeLabel: 'Close invitation details',
    replyBy: 'Kindly reply by {{date}}.',
    optional: 'Optional',
    chooseResponse: 'Choose your reply above to continue.',
  },
  ending: {
    accepted: 'We look forward to celebrating with you',
    // Never the accepted line. Somebody who has just told us they cannot
    // come should not be told we look forward to seeing them.
    declined: 'Thank you for telling us. You will be dearly missed.',
    close: 'Back to the invitation',
  },
  intro: {
    skip: 'Skip',
    replay: 'Watch it open again',
    farewell: 'We look forward to celebrating with you',
  },
  thanks: {
    heading: 'Thank you',
    body: 'Thank you for celebrating with us. It meant everything to have you there.',
    attendingBody:
      'Your place is kept, and your name is written down. We can hardly wait to see you there.',
    // Never the accepted line. Somebody who has just told us they cannot come
    // should not be told we can hardly wait to see them.
    declinedBody:
      'Thank you for telling us. You will be very much missed on the day, and thought of.',
    declinedFarewell: 'With love, and our warmest wishes',
    change: 'Tell us otherwise',
  },
  notFound: {
    heading: 'We cannot find that invitation',
    body:
      'Do check the link you were sent. If it still will not open, telephone us and we ' +
      'will send it along again.',
  },
};

/** Only `en` is populated. Anything else falls back to it. */
const bundles: { en: CopyBundle } & Partial<Record<Locale, CopyBundle>> = { en };

export function copyFor(locale: Locale): CopyBundle {
  return bundles[locale] ?? bundles.en;
}
