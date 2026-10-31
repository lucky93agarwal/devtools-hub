/** UUID v4 and v7, ULID and NanoID from the browser's secure random numbers, and a UUID/ULID inspector. */

export type IdKind = 'uuid4' | 'uuid7' | 'ulid' | 'nanoid';

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

function formatUuid(bytes: Uint8Array): string {
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function uuidV4(): string {
  const bytes = random(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** UUID v7 (RFC 9562): 48 bits of Unix milliseconds, then random bits, so values sort by creation time. */
export function uuidV7(now = Date.now()): string {
  const bytes = random(16);
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 10 characters of time and 16 of randomness in Crockford Base32, 26 in all. */
export function ulid(now = Date.now()): string {
  let time = '';
  let ms = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[ms % 32] + time;
    ms = Math.floor(ms / 32);
  }
  // 80 random bits; 5 bits per character, using bytes evenly.
  return time + [...random(16)].map((b) => CROCKFORD[b % 32]).join('');
}

export const NANOID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/** NanoID: `size` characters from `alphabet`, without the bias of a plain modulo. */
export function nanoid(size = 21, alphabet = NANOID_ALPHABET): string {
  const chars = [...new Set(alphabet)];
  if (chars.length < 2) throw new Error('The alphabet needs at least 2 different characters.');
  const mask = (2 << Math.floor(Math.log2(chars.length - 1))) - 1;
  let id = '';
  while (id.length < size) {
    for (const byte of random(Math.ceil((1.6 * mask * size) / chars.length))) {
      const index = byte & mask;
      if (index < chars.length) id += chars[index];
      if (id.length === size) break;
    }
  }
  return id;
}

export interface UuidFormat {
  uppercase: boolean;
  hyphens: boolean;
  braces: boolean;
}

export function formatId(id: string, kind: IdKind, format: UuidFormat): string {
  if (kind !== 'uuid4' && kind !== 'uuid7') return id;
  let value = format.hyphens ? id : id.replace(/-/g, '');
  if (format.uppercase) value = value.toUpperCase();
  return format.braces ? `{${value}}` : value;
}

export function generate(kind: IdKind, count: number, nanoSize = 21, nanoAlphabet = NANOID_ALPHABET): string[] {
  const make = { uuid4: uuidV4, uuid7: () => uuidV7(), ulid: () => ulid(), nanoid: () => nanoid(nanoSize, nanoAlphabet) }[kind];
  return Array.from({ length: count }, make);
}

export interface Inspection {
  kind: string;
  details: { label: string; value: string }[];
}

const VARIANTS = ['NCS (reserved)', 'RFC 9562', 'Microsoft (reserved)', 'Future (reserved)'];
/** 100-ns intervals between the Gregorian epoch (1582-10-15) and the Unix epoch. */
const GREGORIAN_OFFSET = 122192928000000000n;

/** Explains a UUID or ULID: version, variant and the time inside it. Null when it is neither. */
export function inspect(input: string): Inspection | null {
  const text = input.trim().replace(/^\{|\}$/g, '').replace(/^urn:uuid:/i, '');
  const ulidMatch = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.exec(text);
  if (ulidMatch) {
    let ms = 0;
    for (const c of text.slice(0, 10).toUpperCase()) ms = ms * 32 + CROCKFORD.indexOf(c);
    return { kind: 'ULID', details: [{ label: 'Created', value: new Date(ms).toISOString() }] };
  }
  const compact = text.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  if (/^0+$/.test(compact)) return { kind: 'Nil UUID', details: [{ label: 'Value', value: 'All bits are zero.' }] };
  if (/^f+$/.test(compact)) return { kind: 'Max UUID', details: [{ label: 'Value', value: 'All bits are one.' }] };
  const version = parseInt(compact[12], 16);
  const variantBits = parseInt(compact[16], 16);
  const variant = variantBits < 8 ? 0 : variantBits < 12 ? 1 : variantBits < 14 ? 2 : 3;
  const details = [
    { label: 'Version', value: `${version}${VERSION_NAMES[version] ? ` (${VERSION_NAMES[version]})` : ''}` },
    { label: 'Variant', value: VARIANTS[variant] },
  ];
  let ms: number | null = null;
  if (version === 7) ms = parseInt(compact.slice(0, 12), 16);
  if (version === 1 || version === 6) {
    const timeHex =
      version === 1
        ? compact.slice(13, 16) + compact.slice(8, 12) + compact.slice(0, 8)
        : compact.slice(0, 12) + compact.slice(13, 16);
    ms = Number((BigInt(`0x${timeHex}`) - GREGORIAN_OFFSET) / 10000n);
  }
  if (ms !== null && variant === 1) details.push({ label: 'Created', value: new Date(ms).toISOString() });
  if (version === 1 || version === 6) details.push({ label: 'Node', value: compact.slice(20).replace(/(..)(?!$)/g, '$1:') });
  return { kind: 'UUID', details };
}

const VERSION_NAMES: Record<number, string> = {
  1: 'time and node',
  2: 'DCE security',
  3: 'MD5 of a name',
  4: 'random',
  5: 'SHA-1 of a name',
  6: 'sortable time',
  7: 'Unix time, sortable',
  8: 'custom',
};
