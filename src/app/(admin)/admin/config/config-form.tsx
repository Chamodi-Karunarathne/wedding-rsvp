'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PHASES, type Phase } from '@/lib/domain/phase';
import { renderTemplate } from '@/lib/domain/template';
import { PHASE_LABELS } from '../_components/presentation';
import { Feedback } from '../_components/ui';
import { postJson } from '../_components/api';

type Props = {
  phase: {
    detailsOpenAt: string;
    rsvpDeadline: string;
    dayOfStartAt: string;
    thankYouAt: string;
    phaseOverride: Phase | null;
  };
  site: {
    brideName: string;
    groomName: string;
    timezone: string;
    rsvpContacts: { name: string; phone: string; side: string }[];
  };
  messaging: { whatsappTemplate: string };
  derivedPhase: Phase;
  previewVars: { date: string; rsvpBy: string };
};
type Key = 'phase' | 'site' | 'messaging';
type State = { busy: boolean; error: string | null; success: string | null };
const automatic = 'automatic';
const scheduleFields = [
  [
    'detailsOpenAt',
    'Show wedding information from',
    'Venue and event information take the lead on the invitation.',
  ],
  [
    'dayOfStartAt',
    'Wedding-day view starts',
    'Directions and timing take the lead on the wedding day.',
  ],
  [
    'thankYouAt',
    'Thank-you view starts',
    'A thank-you message takes the lead after the celebration.',
  ],
] as const;
const inserts = [
  ['Guest name', '{{name}}'],
  ['Invitation link', '{{url}}'],
  ['Bride’s name', '{{brideName}}'],
  ['Groom’s name', '{{groomName}}'],
  ['Wedding date', '{{date}}'],
  ['Reply-by date', '{{rsvpBy}}'],
] as const;

export function ConfigForm({ phase, site, messaging, derivedPhase, previewVars }: Props) {
  const router = useRouter();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [phaseForm, setPhaseForm] = useState(phase);
  const [siteForm, setSiteForm] = useState(site);
  const [messagingForm, setMessagingForm] = useState(messaging);
  const [states, setStates] = useState<Record<Key, State>>({
    phase: { busy: false, error: null, success: null },
    site: { busy: false, error: null, success: null },
    messaging: { busy: false, error: null, success: null },
  });
  function changed(key: Key) {
    setStates((prev) => ({ ...prev, [key]: { ...prev[key], error: null, success: null } }));
  }
  async function save(key: Key, value: unknown) {
    if (
      key === 'phase' &&
      phaseForm.phaseOverride &&
      phaseForm.phaseOverride !== phase.phaseOverride &&
      !window.confirm(
        'Use a manual website stage?\n\nGuests will see the ' +
          PHASE_LABELS[phaseForm.phaseOverride] +
          ' view regardless of the schedule. Return to Automatic when you have finished testing.',
      )
    )
      return;
    setStates((prev) => ({ ...prev, [key]: { busy: true, error: null, success: null } }));
    const result = await postJson('/api/admin/config', { key, value });
    setStates((prev) => ({
      ...prev,
      [key]: {
        busy: false,
        error: result.ok ? null : result.message,
        success: result.ok
          ? key === 'messaging'
            ? 'Invitation message updated.'
            : key === 'site'
              ? 'Wedding details updated.'
              : 'Reply date and website schedule updated.'
          : null,
      },
    }));
    if (result.ok) router.refresh();
  }
  function contact(index: number, field: 'name' | 'phone' | 'side', value: string) {
    setSiteForm((prev) => ({
      ...prev,
      rsvpContacts: prev.rsvpContacts.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      ),
    }));
    changed('site');
  }
  function insert(value: string) {
    const start = messageRef.current?.selectionStart ?? messagingForm.whatsappTemplate.length;
    const end = messageRef.current?.selectionEnd ?? start;
    setMessagingForm({
      whatsappTemplate:
        messagingForm.whatsappTemplate.slice(0, start) +
        value +
        messagingForm.whatsappTemplate.slice(end),
    });
    changed('messaging');
    requestAnimationFrame(() => {
      messageRef.current?.focus();
      messageRef.current?.setSelectionRange(start + value.length, start + value.length);
    });
  }
  const preview = renderTemplate(messagingForm.whatsappTemplate, {
    ...previewVars,
    brideName: siteForm.brideName,
    groomName: siteForm.groomName,
    name: 'Your guest',
    url: '[their personal invitation link]',
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>The couple and reply contacts</CardTitle>
          <CardDescription>Names and telephone contacts shown to your guests.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save('site', siteForm);
            }}
            className="space-y-5"
          >
            <fieldset disabled={states.site.busy} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="brideName">Bride’s name</Label>
                  <Input
                    id="brideName"
                    value={siteForm.brideName}
                    onChange={(e) => {
                      setSiteForm((prev) => ({ ...prev, brideName: e.target.value }));
                      changed('site');
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="groomName">Groom’s name</Label>
                  <Input
                    id="groomName"
                    value={siteForm.groomName}
                    onChange={(e) => {
                      setSiteForm((prev) => ({ ...prev, groomName: e.target.value }));
                      changed('site');
                    }}
                    required
                  />
                </div>
              </div>
              <section className="space-y-4 border-t pt-5">
                <h3 className="font-semibold">Who can guests call to reply?</h3>
                {siteForm.rsvpContacts.map((entry, index) => (
                  <div key={index} className="space-y-4 rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Contact {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setSiteForm((prev) => ({
                            ...prev,
                            rsvpContacts: prev.rsvpContacts.filter((_, i) => i !== index),
                          }));
                          changed('site');
                        }}
                      >
                        Remove contact
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={'contact-name-' + index}>Name</Label>
                        <Input
                          id={'contact-name-' + index}
                          value={entry.name}
                          onChange={(e) => contact(index, 'name', e.target.value)}
                          maxLength={80}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={'contact-phone-' + index}>Phone number</Label>
                        <Input
                          id={'contact-phone-' + index}
                          type="tel"
                          value={entry.phone}
                          onChange={(e) => contact(index, 'phone', e.target.value)}
                          maxLength={40}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={'contact-side-' + index}>Label, if needed</Label>
                        <Input
                          id={'contact-side-' + index}
                          value={entry.side}
                          onChange={(e) => contact(index, 'side', e.target.value)}
                          maxLength={40}
                          placeholder="e.g. Bride or Groom"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {siteForm.rsvpContacts.length === 0 && (
                  <p className="text-muted-foreground">No telephone contacts added yet.</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={siteForm.rsvpContacts.length >= 4}
                  onClick={() => {
                    setSiteForm((prev) => ({
                      ...prev,
                      rsvpContacts: [...prev.rsvpContacts, { name: '', phone: '', side: '' }],
                    }));
                    changed('site');
                  }}
                >
                  Add a reply contact
                </Button>
                <p className="text-xs text-muted-foreground">
                  Up to four contacts. Guests can tap these phone numbers to call.
                </p>
              </section>
              <details className="admin-disclosure">
                <summary>Advanced settings · Local time</summary>
                <div className="admin-disclosure-body space-y-2">
                  <Label htmlFor="timezone">Wedding timezone</Label>
                  <Input
                    id="timezone"
                    value={siteForm.timezone}
                    onChange={(e) => {
                      setSiteForm((prev) => ({ ...prev, timezone: e.target.value }));
                      changed('site');
                    }}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Keeps the wedding time the same for guests abroad. Use a timezone name such as
                    Asia/Colombo. Ask the person who set up the website before changing this.
                  </p>
                </div>
              </details>
            </fieldset>
            <Feedback error={states.site.error} success={states.site.success} />
            <Button type="submit" disabled={states.site.busy}>
              {states.site.busy ? 'Saving details…' : 'Save wedding details'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Reply-by date</CardTitle>
          <CardDescription>
            The date guests are asked to reply. Late replies are still accepted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save('phase', phaseForm);
            }}
            className="space-y-5"
          >
            <fieldset disabled={states.phase.busy} className="space-y-5">
              <div className="max-w-md space-y-2">
                <Label htmlFor="rsvpDeadline">Please reply by</Label>
                <Input
                  id="rsvpDeadline"
                  type="datetime-local"
                  value={phaseForm.rsvpDeadline}
                  onChange={(e) => {
                    setPhaseForm((prev) => ({ ...prev, rsvpDeadline: e.target.value }));
                    changed('phase');
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Currently shown to guests: {previewVars.rsvpBy}. Dates and times use{' '}
                  {site.timezone.replaceAll('_', ' ')}.
                </p>
              </div>
              <details className="admin-disclosure" id="advanced-settings">
                <summary>Advanced settings · Website schedule</summary>
                <div className="admin-disclosure-body space-y-5">
                  <p className="text-sm text-muted-foreground">
                    The website changes emphasis automatically as the wedding approaches. Your
                    guests can still find their invitation, event information and reply form at
                    every stage.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="phaseOverride">Website stage</Label>
                    <select
                      id="phaseOverride"
                      className="admin-select"
                      value={phaseForm.phaseOverride ?? automatic}
                      onChange={(e) => {
                        setPhaseForm((prev) => ({
                          ...prev,
                          phaseOverride:
                            e.target.value === automatic ? null : (e.target.value as Phase),
                        }));
                        changed('phase');
                      }}
                    >
                      <option value={automatic}>Automatic — recommended</option>
                      {PHASES.map((value) => (
                        <option key={value} value={value}>
                          {PHASE_LABELS[value]} — manual
                        </option>
                      ))}
                    </select>
                    <p className="text-sm text-muted-foreground">
                      Automatic currently shows: {PHASE_LABELS[derivedPhase]}. Manual settings are
                      for testing or emergencies.
                    </p>
                  </div>
                  {phaseForm.phaseOverride && (
                    <p className="admin-error">
                      Manual mode is selected. The schedule below will be ignored until you choose
                      Automatic and save.
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {scheduleFields.map(([field, label, hint]) => (
                      <div className="space-y-2" key={field}>
                        <Label htmlFor={field}>{label}</Label>
                        <Input
                          id={field}
                          type="datetime-local"
                          value={phaseForm[field]}
                          onChange={(e) => {
                            setPhaseForm((prev) => ({ ...prev, [field]: e.target.value }));
                            changed('phase');
                          }}
                          required
                        />
                        <p className="text-xs text-muted-foreground">{hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </fieldset>
            <Feedback error={states.phase.error} success={states.phase.success} />
            <Button type="submit" disabled={states.phase.busy}>
              {states.phase.busy ? 'Saving dates…' : 'Save dates'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card id="invitation-message" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>WhatsApp invitation message</CardTitle>
          <CardDescription>
            The message you prepare when sending an invitation. Each guest’s name and link are
            filled in automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save('messaging', messagingForm);
            }}
            className="space-y-5"
          >
            <fieldset disabled={states.messaging.busy} className="space-y-4">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="whatsapp-message">Your message</Label>
                  <Textarea
                    ref={messageRef}
                    id="whatsapp-message"
                    rows={10}
                    value={messagingForm.whatsappTemplate}
                    onChange={(e) => {
                      setMessagingForm({ whatsappTemplate: e.target.value });
                      changed('messaging');
                    }}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Insert a personal detail at the cursor:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {inserts.map(([label, value]) => (
                      <Button
                        type="button"
                        variant="outline"
                        key={value}
                        onClick={() => insert(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
                      How automatic details work
                    </summary>
                    <p className="text-sm text-muted-foreground">
                      Keep the words inside double braces, such as {'{{name}}'} and {'{{url}}'},
                      where you want the guest’s name and link to appear. These are replaced in each
                      message.
                    </p>
                  </details>
                </div>
                <div className="space-y-3">
                  <p className="font-medium">Message preview</p>
                  <p className="whitespace-pre-wrap rounded-xl border border-border bg-[#f4f5ee] p-5">
                    {preview}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The preview uses the saved wedding and reply dates. Existing messages already
                    sent in WhatsApp stay as they are.
                  </p>
                </div>
              </div>
            </fieldset>
            <Feedback error={states.messaging.error} success={states.messaging.success} />
            <Button type="submit" disabled={states.messaging.busy}>
              {states.messaging.busy ? 'Saving message…' : 'Save invitation message'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
