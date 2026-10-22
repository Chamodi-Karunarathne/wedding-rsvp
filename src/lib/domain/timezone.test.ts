import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTimeZone, timeZoneSchema } from './timezone.ts';
import { DEFAULT_SITE_SETTINGS, readSiteSettings, siteSettingsSchema } from './config.ts';

describe('time zone validation', () => {
  it('accepts supported zones and rejects typos, offsets and empty values', () => {
    for (const zone of ['Asia/Colombo', 'Europe/London', 'UTC', 'America/New_York']) {
      assert.equal(isTimeZone(zone), true, zone);
    }
    for (const zone of ['Colombo', 'Asia/Colmbo', '', '+05:30', '../Colombo']) {
      assert.equal(timeZoneSchema.safeParse(zone).success, false, zone);
    }
    assert.equal(timeZoneSchema.parse(' Asia/Colombo '), 'Asia/Colombo');
  });

  it('rejects a bad setting on write and recovers historical data without losing names or contacts', () => {
    const stored = {
      brideName: 'A', groomName: 'B', timezone: 'Colombo',
      rsvpContacts: [{ name: 'Family', phone: '+94770000000', side: 'Bride' }],
    };
    assert.equal(siteSettingsSchema.safeParse(stored).success, false);
    const recovered = readSiteSettings(stored);
    assert.equal(recovered.timezone, 'Asia/Colombo');
    assert.equal(recovered.brideName, 'A');
    assert.deepEqual(recovered.rsvpContacts, stored.rsvpContacts);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: recovered.timezone }));
  });

  it('keeps the established fallback for missing or otherwise invalid settings', () => {
    assert.deepEqual(readSiteSettings(undefined), DEFAULT_SITE_SETTINGS);
    assert.deepEqual(readSiteSettings({ timezone: 'Colombo' }), DEFAULT_SITE_SETTINGS);
  });
});
