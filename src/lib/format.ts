/**
 * PERMANENT. Date formatting, always in an explicit IANA zone.
 *
 * Never format a wedding date in the viewer's local zone: a guest in London
 * would be told the ceremony starts at 04:00.
 */

export function formatEventDateTime(date: Date, timeZone: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDate(date: Date, timeZone: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeShort(date: Date, timeZone: string, locale = 'en-GB', precision: 'minute' | 'second' = 'minute'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(precision === 'second' ? { second: '2-digit' as const } : {}),
    hour12: false,
  }).format(date);
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return wallClockAsUtc - instant.getTime();
}

/**
 * Turns a datetime-local value ("2026-11-01T00:00") into the instant it names
 * IN THE WEDDING'S TIMEZONE.
 *
 * Without this, `new Date("2026-11-01T00:00")` would be parsed in whatever zone
 * the server happens to run in - so phase boundaries set from the admin UI
 * would silently shift by hours once deployed.
 */
export function fromDateTimeLocalValue(value: string, timeZone: string): Date {
  const normalized = value.length === 16 ? `${value}:00` : value;
  const asIfUtc = new Date(`${normalized}Z`);
  if (Number.isNaN(asIfUtc.getTime())) return asIfUtc;
  return new Date(asIfUtc.getTime() - zoneOffsetMs(asIfUtc, timeZone));
}

/** For <input type="datetime-local">, which wants local wall time. */
export function toDateTimeLocalValue(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
