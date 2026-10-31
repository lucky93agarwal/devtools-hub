/** Differences between dates, adding time to a date, working days and ISO 8601 durations such as P1Y2M3DT4H. */

export interface Difference {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  weeks: number;
  workingDays: number;
  totalHours: number;
  /** b is earlier than a. */
  negative: boolean;
}

const DAY = 86400000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The date `months` later, on the same day of the month or the month's last day when it is shorter. */
function addMonths(date: Date, months: number): Date {
  const r = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  r.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()));
  return r;
}

/** Calendar difference of two dates (YYYY-MM-DD), counted in UTC so daylight saving does not shift it. */
export function difference(a: string, b: string): Difference | null {
  let start = new Date(`${a}T00:00:00Z`);
  let end = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const negative = end < start;
  if (negative) [start, end] = [end, start];
  // Whole months that fit, adding them the calendar way (31 Jan + 1 month = 28 Feb), then the days left over.
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (addMonths(start, months) > end) months--;
  const days = Math.round((utcDay(end) - utcDay(addMonths(start, months))) / DAY);
  const years = Math.floor(months / 12);
  months %= 12;
  const totalDays = Math.round((utcDay(end) - utcDay(start)) / DAY);
  // Monday to Friday, counting the start day but not the end day.
  let workingDays = Math.floor(totalDays / 7) * 5;
  for (let i = 0, d = new Date(start.getTime() + Math.floor(totalDays / 7) * 7 * DAY); i < totalDays % 7; i++, d = new Date(d.getTime() + DAY)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) workingDays++;
  }
  return { years, months, days, totalDays, weeks: Math.floor(totalDays / 7), workingDays, totalHours: totalDays * 24, negative };
}

export interface Duration {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const emptyDuration = (): Duration => ({ years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });

/** Adds (or with sign -1 subtracts) a duration to a date and time, calendar-aware: Jan 31 + 1 month is Feb 28/29. */
export function addDuration(start: Date, d: Duration, sign: 1 | -1 = 1): Date {
  const r = new Date(start.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCFullYear(r.getUTCFullYear() + sign * d.years);
  r.setUTCMonth(r.getUTCMonth() + sign * d.months);
  // Keep the day of the month, or the last day when the month is shorter.
  r.setUTCDate(Math.min(day, new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()));
  return new Date(r.getTime() + sign * (((d.weeks * 7 + d.days) * 24 + d.hours) * 3600 + d.minutes * 60 + d.seconds) * 1000);
}

export type DurationResult = { ok: true; duration: Duration } | { ok: false; error: string };

export function parseIsoDuration(text: string): DurationResult {
  const m = /^P(?!$)(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?=\d)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(text.trim());
  if (!m) return { ok: false, error: 'Write an ISO 8601 duration such as P1Y2M10DT2H30M, PT45S or P3W.' };
  const n = (i: number) => Number((m[i] ?? '0').replace(',', '.'));
  return { ok: true, duration: { years: n(1), months: n(2), weeks: n(3), days: n(4), hours: n(5), minutes: n(6), seconds: n(7) } };
}

export function formatIsoDuration(d: Duration): string {
  const date = `${d.years ? `${d.years}Y` : ''}${d.months ? `${d.months}M` : ''}${d.weeks ? `${d.weeks}W` : ''}${d.days ? `${d.days}D` : ''}`;
  const time = `${d.hours ? `${d.hours}H` : ''}${d.minutes ? `${d.minutes}M` : ''}${d.seconds ? `${d.seconds}S` : ''}`;
  return `P${date}${time ? `T${time}` : ''}` === 'P' ? 'PT0S' : `P${date}${time ? `T${time}` : ''}`;
}

export function describeDuration(d: Duration): string {
  const parts = Object.entries(d)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${v === 1 ? k.slice(0, -1) : k}`);
  return parts.length ? parts.join(', ') : 'no time';
}

/** Seconds in a duration, counting a month as 30 days and a year as 365 (as most APIs do). */
export const durationSeconds = (d: Duration) => (((d.years * 365 + d.months * 30 + d.weeks * 7 + d.days) * 24 + d.hours) * 60 + d.minutes) * 60 + d.seconds;
