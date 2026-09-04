'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PHASES, type Phase } from '@/lib/domain/phase';
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
};

const PHASE_FIELDS = [
  ['detailsOpenAt', 'Details open'],
  ['rsvpDeadline', 'Reply by'],
  ['dayOfStartAt', 'Day of'],
  ['thankYouAt', 'Thank you'],
] as const;

const SITE_FIELDS = [
  ['brideName', "Bride's name"],
  ['groomName', "Groom's name"],
  ['timezone', 'Timezone'],
] as const;

const PLACEHOLDERS = ['{{name}}', '{{url}}', '{{brideName}}', '{{groomName}}', '{{date}}', '{{rsvpBy}}'];

/**
 * Contacts are edited as text, one per line: `Name, Phone, Side`.
 *
 * A repeatable sub-form for at most four rows that change once a year would
 * be more code than the problem deserves, and this pastes straight out of a
 * message.
 */
function contactsToText(contacts: { name: string; phone: string; side: string }[]): string {
  return contacts.map((c) => [c.name, c.phone, c.side].filter(Boolean).join(', ')).join('\n');
}

function textToContacts(text: string): { name: string; phone: string; side: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 4)
    .map((line) => {
      const [name = '', phone = '', side = ''] = line.split(',').map((part) => part.trim());
      return { name, phone, side };
    })
    .filter((contact) => contact.name !== '' && contact.phone !== '');
}

/** No override chosen. Base UI needs a real value, not an empty string. */
const NO_OVERRIDE = 'derive';

export function ConfigForm({ phase, site, messaging, derivedPhase }: Props) {
  const router = useRouter();
  const [phaseForm, setPhaseForm] = useState(phase);
  const [siteForm, setSiteForm] = useState(site);
  const [contactsText, setContactsText] = useState(() => contactsToText(site.rsvpContacts));
  const [messagingForm, setMessagingForm] = useState(messaging);
  const [status, setStatus] = useState<Record<string, string>>({});

  async function save(key: 'phase' | 'site' | 'messaging', value: unknown) {
    setStatus((prev) => ({ ...prev, [key]: 'saving...' }));
    const result = await postJson('/api/admin/config', { key, value });
    setStatus((prev) => ({ ...prev, [key]: result.ok ? 'saved' : result.message }));
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Phase</CardTitle>
          <CardDescription>
            Derived from the clock this phase would be <strong>{derivedPhase}</strong>. An override
            forces a phase regardless of the dates &mdash; useful for checking the day-of layout,
            and easy to leave switched on by mistake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('phase', phaseForm);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {PHASE_FIELDS.map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    type="datetime-local"
                    value={phaseForm[field]}
                    onChange={(e) =>
                      setPhaseForm((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    required
                  />
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              The reply date is shown to guests and never enforced. A late answer is still accepted
              and saved; the form shows a gentle note rather than an error, and submitted_at
              already records who was late.
            </p>

            <div className="space-y-2">
              <Label htmlFor="phaseOverride">Override</Label>
              <Select
                value={phaseForm.phaseOverride ?? NO_OVERRIDE}
                onValueChange={(value) =>
                  setPhaseForm((prev) => ({
                    ...prev,
                    phaseOverride: value === NO_OVERRIDE ? null : (value as Phase),
                  }))
                }
              >
                <SelectTrigger id="phaseOverride" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OVERRIDE}>none (derive from dates)</SelectItem>
                  {PHASES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {phaseForm.phaseOverride && (
              <Alert variant="destructive">
                <AlertDescription>
                  Override is set. The site will ignore the dates above until this is cleared.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit">Save phase</Button>
              {status.phase && (
                <span className="text-sm text-muted-foreground">{status.phase}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site</CardTitle>
          <CardDescription>
            Timezone is an IANA name. Every guest-facing time is formatted in it, so a guest abroad
            sees the local time of the wedding rather than their own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('site', { ...siteForm, rsvpContacts: textToContacts(contactsText) });
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {SITE_FIELDS.map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    value={siteForm[field]}
                    onChange={(e) => setSiteForm((prev) => ({ ...prev, [field]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rsvpContacts">RSVP contacts</Label>
              <Textarea
                id="rsvpContacts"
                rows={3}
                value={contactsText}
                onChange={(e) => setContactsText(e.target.value)}
                placeholder="Masan, 077 5007091, Bride"
              />
              <p className="text-sm text-muted-foreground">
                One per line: name, phone, side. These are printed on the card and shown on the
                invitation as tel: links, so they are what a guest taps to call. Up to four.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit">Save site</Button>
              {status.site && <span className="text-sm text-muted-foreground">{status.site}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp template</CardTitle>
          <CardDescription>
            The name used is the card name, so a household with a shorter fallback set is addressed
            by it here too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('messaging', messagingForm);
            }}
            className="space-y-4"
          >
            <Textarea
              rows={8}
              value={messagingForm.whatsappTemplate}
              onChange={(e) => setMessagingForm({ whatsappTemplate: e.target.value })}
              className="font-mono text-xs"
              required
            />

            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Placeholders:</span>
              {PLACEHOLDERS.map((placeholder) => (
                <code
                  key={placeholder}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {placeholder}
                </code>
              ))}
            </p>

            <div className="flex items-center gap-3">
              <Button type="submit">Save template</Button>
              {status.messaging && (
                <span className="text-sm text-muted-foreground">{status.messaging}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
