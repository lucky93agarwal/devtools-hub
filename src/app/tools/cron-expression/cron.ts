/**
 * Standard cron expressions (5 fields, or 6 with seconds first) and their next run times.
 * Day of month and day of week follow Vixie cron: when both are restricted, either one matching is enough.
 */

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
}

const SECOND: FieldSpec = { name: 'second', min: 0, max: 59 };
const MINUTE: FieldSpec = { name: 'minute', min: 0, max: 59 };
const HOUR: FieldSpec = { name: 'hour', min: 0, max: 23 };
const DAY: FieldSpec = { name: 'day of month', min: 1, max: 31 };
const MONTH: FieldSpec = {
  name: 'month',
  min: 1,
  max: 12,
  names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
};
const WEEKDAY: FieldSpec = { name: 'day of week', min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] };

export interface Cron {
  seconds: Set<number> | null;
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  /** Whether day of month / day of week were * (or ?), for the Vixie OR rule. */
  anyDay: boolean;
  anyWeekday: boolean;
  /** The expression with macros expanded, as fields. */
  fields: string[];
}

export type CronResult = { ok: true; cron: Cron } | { ok: false; error: string };

function parseField(text: string, spec: FieldSpec): Set<number> {
  const values = new Set<number>();
  const value = (part: string) => {
    const index = spec.names?.indexOf(part.toUpperCase().slice(0, 3)) ?? -1;
    const n = index >= 0 && /^[a-z]{3}$/i.test(part) ? index + (spec === MONTH ? 1 : 0) : /^\d+$/.test(part) ? Number(part) : NaN;
    if (Number.isNaN(n) || n < spec.min || n > spec.max) {
      throw new Error(`“${part}” is not a valid ${spec.name} (${spec.min} to ${spec.max === 7 ? 6 : spec.max}).`);
    }
    return n;
  };
  for (const item of text.split(',')) {
    if (/[LW#]/i.test(item) && !/^[a-z]{3}$/i.test(item)) {
      throw new Error(`“${item}” uses L, W or #. These are Quartz extensions that standard cron does not support.`);
    }
    const [range, stepText] = item.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`“${item}” has an invalid step in the ${spec.name} field.`);
    let from: number;
    let to: number;
    if (range === '*' || range === '?') [from, to] = [spec.min, spec === WEEKDAY ? 6 : spec.max];
    else if (range.includes('-')) {
      const [a, b] = range.split('-');
      [from, to] = [value(a), value(b)];
      if (from > to) throw new Error(`“${range}” goes backwards in the ${spec.name} field.`);
    } else {
      from = value(range);
      // "5/15" means from 5 to the end in steps of 15.
      to = stepText === undefined ? from : spec === WEEKDAY ? 6 : spec.max;
    }
    for (let n = from; n <= to; n += step) values.add(spec === WEEKDAY && n === 7 ? 0 : n);
  }
  return values;
}

export function parseCron(expression: string): CronResult {
  const text = expression.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: '' };
  const expanded = MACROS[text.toLowerCase()] ?? text;
  if (expanded.startsWith('@')) return { ok: false, error: `${text} is not a known shortcut. Try @hourly, @daily, @weekly, @monthly or @yearly.` };
  const fields = expanded.split(' ');
  if (fields.length !== 5 && fields.length !== 6) {
    return { ok: false, error: `A cron expression has 5 fields (minute hour day month weekday), or 6 with seconds first. This one has ${fields.length}.` };
  }
  const withSeconds = fields.length === 6;
  const [sec, min, hour, day, month, weekday] = withSeconds ? fields : ['', ...fields];
  try {
    return {
      ok: true,
      cron: {
        seconds: withSeconds ? parseField(sec, SECOND) : null,
        minutes: parseField(min, MINUTE),
        hours: parseField(hour, HOUR),
        days: parseField(day, DAY),
        months: parseField(month, MONTH),
        weekdays: parseField(weekday, WEEKDAY),
        anyDay: day === '*' || day === '?',
        anyWeekday: weekday === '*' || weekday === '?',
        fields,
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Reads and writes date parts in UTC or in the browser's local time. */
function clock(utc: boolean) {
  return utc
    ? {
        get: (d: Date) => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCDay()],
        make: (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, mo, d, h, mi, s)),
      }
    : {
        get: (d: Date) => [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay()],
        make: (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo, d, h, mi, s),
      };
}

/** The next `count` run times after `from`, in UTC or local time. Stops looking after about five years. */
export function nextRuns(cron: Cron, from: Date, count: number, utc = false): Date[] {
  const { get, make } = clock(utc);
  const runs: Date[] = [];
  const unit = cron.seconds ? 1000 : 60000;
  let t = new Date(Math.floor(from.getTime() / unit) * unit + unit);
  const limit = from.getTime() + 5 * 366 * 86400000;
  const dayMatches = (day: number, weekday: number) => {
    const dom = cron.days.has(day);
    const dow = cron.weekdays.has(weekday);
    if (cron.anyDay && cron.anyWeekday) return true;
    if (cron.anyDay) return dow;
    if (cron.anyWeekday) return dom;
    return dom || dow;
  };
  while (runs.length < count && t.getTime() < limit) {
    const [y, mo, d, h, mi, s, wd] = get(t);
    if (!cron.months.has(mo + 1)) t = make(y, mo + 1, 1);
    else if (!dayMatches(d, wd)) t = make(y, mo, d + 1);
    else if (!cron.hours.has(h)) t = make(y, mo, d, h + 1);
    else if (!cron.minutes.has(mi)) t = make(y, mo, d, h, mi + 1);
    else if (cron.seconds && !cron.seconds.has(s)) t = make(y, mo, d, h, mi, s + 1);
    else {
      runs.push(t);
      t = new Date(t.getTime() + unit);
    }
  }
  return runs;
}

export const PRESETS = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Every day at midnight', expression: '0 0 * * *' },
  { label: 'Weekdays at 9:30', expression: '30 9 * * 1-5' },
  { label: 'Every Sunday at 2:00', expression: '0 2 * * 0' },
  { label: 'First of the month', expression: '0 0 1 * *' },
  { label: 'Every 15 s (with seconds)', expression: '*/15 * * * * *' },
];
