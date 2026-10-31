/** Unix timestamps in any unit, dates in any IANA time zone, and the conversions between them. */

export type Unit = 's' | 'ms' | 'us' | 'ns';

export const UNIT_LABELS: Record<Unit, string> = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };

export type ParsedTime = { ok: true; ms: number; unit: Unit | 'date' } | { ok: false; error: string };

/** Larger values than this are out of range for JavaScript dates (±100 million days). */
const MAX_MS = 8.64e15;

/**
 * Reads a Unix timestamp, guessing the unit from its size as most tools do (10 digits = seconds,
 * 13 = milliseconds, 16 = microseconds, 19 = nanoseconds), or a date string such as ISO 8601.
 */
export function parseTime(input: string, unit: Unit | 'auto' = 'auto'): ParsedTime {
  const text = input.trim().replace(/[_,\s]/g, '');
  if (!text) return { ok: false, error: '' };
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const value = Number(text);
    const digits = text.replace(/^-/, '').split('.')[0].length;
    const chosen: Unit = unit !== 'auto' ? unit : digits <= 11 ? 's' : digits <= 14 ? 'ms' : digits <= 17 ? 'us' : 'ns';
    const ms = { s: value * 1000, ms: value, us: value / 1000, ns: value / 1e6 }[chosen];
    if (Math.abs(ms) > MAX_MS) return { ok: false, error: 'This number is too large to be a date.' };
    return { ok: true, ms, unit: chosen };
  }
  const ms = Date.parse(input.trim());
  if (Number.isNaN(ms)) return { ok: false, error: 'Enter a Unix timestamp such as 1730000000, or a date such as 2026-10-31T12:00:00Z.' };
  return { ok: true, ms, unit: 'date' };
}

/** Wall-clock parts of an instant in a time zone. */
function zoneParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of a time zone from UTC at an instant, in minutes (India is +330). */
export function zoneOffset(ms: number, timeZone: string): number {
  const p = zoneParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export const formatOffset = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

/** ISO 8601 with the zone's offset, e.g. 2026-10-31T17:30:00.000+05:30. */
export function isoInZone(ms: number, timeZone: string): string {
  const p = zoneParts(ms, timeZone);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  const millis = pad(((ms % 1000) + 1000) % 1000, 3);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${millis}${formatOffset(zoneOffset(ms, timeZone))}`;
}

export function readable(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(ms));
}

/** "3 hours ago" or "in 2 days". */
export function relative(ms: number, now: number): string {
  const seconds = Math.round((ms - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

/**
 * The instant at which a wall-clock time (as typed in a datetime-local box) happens in a time zone.
 * Clocks that skip forward have no such time; the result then lands just after the gap.
 */
export function wallTimeToMs(local: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi, s = '0', frac = '0'] = m.slice(1);
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, Number(frac.padEnd(3, '0')));
  // Two passes settle the offset, also near a daylight-saving change.
  let ms = asUtc - zoneOffset(asUtc, timeZone) * 60000;
  ms = asUtc - zoneOffset(ms, timeZone) * 60000;
  return ms;
}

/** The wall-clock time of an instant in a zone, in the format a datetime-local box wants. */
export function msToWallTime(ms: number, timeZone: string): string {
  return isoInZone(ms, timeZone).slice(0, 19);
}

/** Old names that Chrome's time zone list still uses, and the names people know today. */
const RENAMED: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Pacific/Enderbury': 'Pacific/Kanton',
};

/** A zone under its current IANA name; both names work with Intl. */
export const currentZoneName = (zone: string) => RENAMED[zone] ?? zone;

export function timeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf('timeZone').map(currentZoneName).filter((z) => z !== 'UTC');
    return ['UTC', ...[...new Set(zones)].sort()];
  } catch {
    return ['UTC'];
  }
}
