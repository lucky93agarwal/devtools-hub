/** Data sizes in decimal (kB = 1000) and binary (KiB = 1024) units, and how long a transfer takes. */

export const UNITS = [
  { id: 'b', label: 'bits', bytes: 1 / 8 },
  { id: 'B', label: 'bytes', bytes: 1 },
  { id: 'kB', label: 'kB (1000)', bytes: 1e3 },
  { id: 'KiB', label: 'KiB (1024)', bytes: 1024 },
  { id: 'MB', label: 'MB', bytes: 1e6 },
  { id: 'MiB', label: 'MiB', bytes: 1024 ** 2 },
  { id: 'GB', label: 'GB', bytes: 1e9 },
  { id: 'GiB', label: 'GiB', bytes: 1024 ** 3 },
  { id: 'TB', label: 'TB', bytes: 1e12 },
  { id: 'TiB', label: 'TiB', bytes: 1024 ** 4 },
] as const;

export type UnitId = (typeof UNITS)[number]['id'];

export const toBytes = (value: number, unit: UnitId) => value * UNITS.find((u) => u.id === unit)!.bytes;

export function allUnits(bytes: number): { id: UnitId; label: string; value: string }[] {
  return UNITS.map((u) => ({ id: u.id, label: u.label, value: format(bytes / u.bytes) }));
}

function format(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6) return n.toExponential(4);
  return Number(n.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Seconds to move `bytes` at `megabitsPerSecond`, as internet speeds are quoted (Mbps = 1,000,000 bits/s). */
export const transferSeconds = (bytes: number, megabitsPerSecond: number) => (megabitsPerSecond > 0 ? (bytes * 8) / (megabitsPerSecond * 1e6) : Infinity);

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  const units: [string, number][] = [['d', 86400], ['h', 3600], ['min', 60], ['s', 1]];
  const parts: string[] = [];
  let rest = Math.round(seconds);
  for (const [label, size] of units) {
    if (rest >= size) {
      parts.push(`${Math.floor(rest / size)} ${label}`);
      rest %= size;
    }
  }
  return parts.slice(0, 2).join(' ');
}

/** Reads "1.5 GB", "700MiB" or "200 kb" (small b means bits). */
export function parseSize(text: string): { value: number; unit: UnitId } | null {
  const m = /^\s*([\d.,]+)\s*([kKmMgGtT]?i?[bB]|bits?|bytes?)?\s*$/.exec(text);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(value)) return null;
  const raw = m[2] ?? 'B';
  if (/^bits?$/.test(raw)) return { value, unit: 'b' };
  if (/^bytes?$/.test(raw)) return { value, unit: 'B' };
  const prefix = raw[0].toUpperCase();
  const binary = raw.length === 3;
  const bits = raw.endsWith('b') && raw !== 'B';
  if (prefix === 'B') return { value, unit: 'B' };
  const id = (prefix === 'K' ? (binary ? 'KiB' : 'kB') : `${prefix}${binary ? 'iB' : 'B'}`) as UnitId;
  return bits ? { value: value / 8, unit: id } : { value, unit: id };
}
