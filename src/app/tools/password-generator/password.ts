/** Passwords and secrets from the browser's secure random numbers, without the bias of a plain modulo. */

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out characters that are easy to confuse: I l 1 O 0 o. */
  noSimilar: boolean;
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const SIMILAR = /[Il1O0o]/g;

/** A random whole number from 0 to max - 1. */
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do value = crypto.getRandomValues(buffer)[0];
  while (value >= limit);
  return value % max;
}

export function pools(options: PasswordOptions): string[] {
  return (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((key) => options[key])
    .map((key) => (options.noSimilar ? SETS[key].replace(SIMILAR, '') : SETS[key]));
}

/** At least one character from every chosen set, then shuffled, so no set is left out by chance. */
export function generatePassword(options: PasswordOptions): string {
  const sets = pools(options);
  if (!sets.length) throw new Error('Choose at least one kind of character.');
  const all = sets.join('');
  const chars = sets.map((set) => set[randomBelow(set.length)]);
  while (chars.length < options.length) chars.push(all[randomBelow(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, options.length).join('');
}

export type SecretFormat = 'hex' | 'base64url' | 'base64';

/** A random secret of `bytes` bytes, for JWT signing keys, API keys and the like. */
export function generateSecret(bytes: number, format: SecretFormat): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  if (format === 'hex') return [...data].map((b) => b.toString(16).padStart(2, '0')).join('');
  const base64 = btoa(String.fromCharCode(...data));
  return format === 'base64' ? base64 : base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Entropy in bits for a random password of this length and character pool. */
export const entropyBits = (length: number, poolSize: number) => (poolSize > 1 ? Math.round(length * Math.log2(poolSize)) : 0);

export function strength(bits: number): { label: string; tone: 'danger' | 'warning' | 'success' } {
  if (bits < 50) return { label: 'Weak', tone: 'danger' };
  if (bits < 70) return { label: 'Fair', tone: 'warning' };
  if (bits < 100) return { label: 'Strong', tone: 'success' };
  return { label: 'Very strong', tone: 'success' };
}

/** Rough time to guess at ten billion tries per second (an offline attack on a fast hash). */
export function crackTime(bits: number): string {
  const seconds = 2 ** bits / 2 / 1e10;
  const units: [string, number][] = [['billion years', 3.15e16], ['million years', 3.15e13], ['years', 3.15e7], ['days', 86400], ['hours', 3600], ['minutes', 60]];
  for (const [unit, size] of units) if (seconds >= size) return `about ${Math.round(seconds / size).toLocaleString('en-US')} ${unit}`;
  return 'less than a minute';
}
