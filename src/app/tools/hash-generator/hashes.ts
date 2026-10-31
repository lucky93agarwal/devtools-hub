/** Hashes and HMACs of text and files with hash-wasm, which is loaded only when needed. */
import type { IHasher } from 'hash-wasm';

type HashWasm = typeof import('hash-wasm');

export interface Algorithm {
  id: string;
  label: string;
  /** CRC32 is a checksum, not a cryptographic hash, so it has no HMAC. */
  hmac: boolean;
  create: (lib: HashWasm) => Promise<IHasher>;
}

export const ALGORITHMS: readonly Algorithm[] = [
  { id: 'md5', label: 'MD5', hmac: true, create: (l) => l.createMD5() },
  { id: 'sha1', label: 'SHA-1', hmac: true, create: (l) => l.createSHA1() },
  { id: 'sha224', label: 'SHA-224', hmac: true, create: (l) => l.createSHA224() },
  { id: 'sha256', label: 'SHA-256', hmac: true, create: (l) => l.createSHA256() },
  { id: 'sha384', label: 'SHA-384', hmac: true, create: (l) => l.createSHA384() },
  { id: 'sha512', label: 'SHA-512', hmac: true, create: (l) => l.createSHA512() },
  { id: 'sha3-256', label: 'SHA3-256', hmac: true, create: (l) => l.createSHA3(256) },
  { id: 'sha3-512', label: 'SHA3-512', hmac: true, create: (l) => l.createSHA3(512) },
  { id: 'crc32', label: 'CRC32', hmac: false, create: (l) => l.createCRC32() },
];

/** Hex digests by algorithm id. */
export type Digests = Record<string, string>;

let lib: Promise<HashWasm> | undefined;
const load = () => (lib ??= import('hash-wasm'));

/** Fresh hashers for every algorithm, keyed for HMAC when a key is given (CRC32 is then left out). */
async function hashers(key: string): Promise<[string, IHasher][]> {
  const l = await load();
  const list = key ? ALGORITHMS.filter((a) => a.hmac) : ALGORITHMS;
  return Promise.all(
    list.map(async (a) => {
      const hasher = key ? await l.createHMAC(a.create(l), key) : await a.create(l);
      hasher.init();
      return [a.id, hasher] as [string, IHasher];
    }),
  );
}

/** Hashes text (as UTF-8) with every algorithm. */
export async function hashText(text: string, key = ''): Promise<Digests> {
  const list = await hashers(key);
  return Object.fromEntries(list.map(([id, h]) => [id, h.update(text).digest('hex')]));
}

const CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Hashes a file with every algorithm in one pass, reading it in pieces so large files do not fill memory.
 * `onProgress` gets 0 to 1; `isCancelled` stops early and the promise resolves to null.
 */
export async function hashFile(
  file: Blob,
  key = '',
  onProgress: (done: number) => void = () => {},
  isCancelled: () => boolean = () => false,
): Promise<Digests | null> {
  const list = await hashers(key);
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    if (isCancelled()) return null;
    const chunk = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    for (const [, hasher] of list) hasher.update(chunk);
    onProgress(Math.min(1, (offset + chunk.length) / file.size));
  }
  return Object.fromEntries(list.map(([id, h]) => [id, h.digest('hex')]));
}

export type DigestFormat = 'hex' | 'HEX' | 'base64';

export function formatDigest(hex: string, format: DigestFormat): string {
  if (format === 'HEX') return hex.toUpperCase();
  if (format === 'hex') return hex;
  const bytes = hex.match(/../g)!.map((pair) => parseInt(pair, 16));
  return btoa(String.fromCharCode(...bytes));
}

/** The algorithm whose digest equals `expected`, given as hex in any case or as Base64; null when none does. */
export function findMatch(digests: Digests, expected: string): string | null {
  const text = expected.trim().replace(/\s+/g, '');
  if (!text) return null;
  for (const [id, hex] of Object.entries(digests)) {
    if (text.toLowerCase() === hex || text === formatDigest(hex, 'base64')) return id;
  }
  return null;
}
