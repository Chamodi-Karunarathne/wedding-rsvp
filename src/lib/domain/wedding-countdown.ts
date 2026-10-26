export function countdownParts(targetMs: number, nowMs: number) {
  const totalSeconds = Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** A ceremony can have started while it is still the wedding day locally. */
export function weddingDayState(targetMs: number, nowMs: number, timeZone: string) {
  const calendar = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  if (calendar.format(targetMs) === calendar.format(nowMs)) return 'today';
  return nowMs < targetMs ? 'upcoming' : 'celebrated';
}
