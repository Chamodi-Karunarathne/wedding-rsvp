'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  site: { brideName: string; groomName: string; timezone: string };
  messaging: { whatsappTemplate: string };
  derivedPhase: Phase;
};

export function ConfigForm({ phase, site, messaging, derivedPhase }: Props) {
  const router = useRouter();
  const [phaseForm, setPhaseForm] = useState(phase);
  const [siteForm, setSiteForm] = useState(site);
  const [messagingForm, setMessagingForm] = useState(messaging);
  const [status, setStatus] = useState<Record<string, string>>({});

  async function save(key: 'phase' | 'site' | 'messaging', value: unknown) {
    setStatus((prev) => ({ ...prev, [key]: 'saving...' }));
    const result = await postJson('/api/admin/config', { key, value });
    setStatus((prev) => ({ ...prev, [key]: result.ok ? 'saved' : result.message }));
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-8 text-sm">
      <section>
        <h2 className="font-medium">Phase</h2>
        <p className="text-gray-600">
          Derived from the clock this phase would be <strong>{derivedPhase}</strong>. An override
          forces a phase regardless of the dates - useful for checking the day-of layout, and easy
          to leave switched on by mistake.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save('phase', phaseForm);
          }}
          className="mt-2 space-y-2 border p-3"
        >
          {(['detailsOpenAt', 'rsvpDeadline', 'dayOfStartAt', 'thankYouAt'] as const).map(
            (field) => (
              <label key={field} className="block">
                {field}
                <input
                  type="datetime-local"
                  value={phaseForm[field]}
                  onChange={(e) => setPhaseForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="ml-2 border px-2 py-1"
                  required
                />
              </label>
            ),
          )}

          <p className="text-gray-600">
            The reply date is shown to guests and never enforced. A late answer is still accepted
            and saved; the form shows a gentle note rather than an error, and submitted_at already
            records who was late.
          </p>

          <label className="block">
            Override
            <select
              value={phaseForm.phaseOverride ?? ''}
              onChange={(e) =>
                setPhaseForm((prev) => ({
                  ...prev,
                  phaseOverride: e.target.value === '' ? null : (e.target.value as Phase),
                }))
              }
              className="ml-2 border px-2 py-1"
            >
              <option value="">none (derive from dates)</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          {phaseForm.phaseOverride && (
            <p className="text-red-700">
              Override is set. The site will ignore the dates above until this is cleared.
            </p>
          )}

          <button type="submit" className="border px-3 py-1">
            Save phase
          </button>
          {status.phase && <span className="ml-2">{status.phase}</span>}
        </form>
      </section>

      <section>
        <h2 className="font-medium">Site</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save('site', siteForm);
          }}
          className="mt-2 space-y-2 border p-3"
        >
          {(['brideName', 'groomName', 'timezone'] as const).map((field) => (
            <label key={field} className="block">
              {field}
              <input
                value={siteForm[field]}
                onChange={(e) => setSiteForm((prev) => ({ ...prev, [field]: e.target.value }))}
                className="ml-2 border px-2 py-1"
                required
              />
            </label>
          ))}
          <p className="text-gray-600">
            Timezone is an IANA name. Every guest-facing time is formatted in it, so a guest abroad
            sees the local time of the wedding rather than their own.
          </p>
          <button type="submit" className="border px-3 py-1">
            Save site
          </button>
          {status.site && <span className="ml-2">{status.site}</span>}
        </form>
      </section>

      <section>
        <h2 className="font-medium">WhatsApp template</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save('messaging', messagingForm);
          }}
          className="mt-2 space-y-2 border p-3"
        >
          <textarea
            rows={4}
            value={messagingForm.whatsappTemplate}
            onChange={(e) => setMessagingForm({ whatsappTemplate: e.target.value })}
            className="w-full border px-2 py-1"
            required
          />
          <p className="text-gray-600">
            Placeholders: <code>{'{{name}}'}</code>, <code>{'{{url}}'}</code>,{' '}
            <code>{'{{brideName}}'}</code>, <code>{'{{groomName}}'}</code>,{' '}
            <code>{'{{date}}'}</code>, <code>{'{{rsvpBy}}'}</code>. The name used is the card
            name, so a household with a shorter fallback set is addressed by it here too.
          </p>
          <button type="submit" className="border px-3 py-1">
            Save template
          </button>
          {status.messaging && <span className="ml-2">{status.messaging}</span>}
        </form>
      </section>
    </div>
  );
}
