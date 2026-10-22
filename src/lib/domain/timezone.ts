import { z } from 'zod';

export const DEFAULT_TIMEZONE = 'Asia/Colombo';

/** Check the runtime's IANA database, including supported aliases such as UTC. */
export function isTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().trim().min(1).max(64).refine(isTimeZone, {
  message: 'Enter a valid time zone, such as Asia/Colombo.',
});
