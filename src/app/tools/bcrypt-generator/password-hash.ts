/** bcrypt and Argon2id password hashes with hash-wasm, made and checked in the browser. */

export type HashKind = 'bcrypt' | 'argon2id';

export interface Argon2Options {
  /** Memory in KiB. */
  memory: number;
  iterations: number;
  parallelism: number;
}

/** OWASP's recommended minimum: 19 MiB, 2 passes, 1 lane. */
export const ARGON2_DEFAULTS: Argon2Options = { memory: 19456, iterations: 2, parallelism: 1 };

let lib: Promise<typeof import('hash-wasm')> | undefined;
const load = () => (lib ??= import('hash-wasm'));

export async function hashPassword(password: string, kind: HashKind, cost = 12, argon: Argon2Options = ARGON2_DEFAULTS): Promise<string> {
  const l = await load();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  if (kind === 'bcrypt') return l.bcrypt({ password, salt, costFactor: cost, outputType: 'encoded' });
  return l.argon2id({
    password,
    salt,
    memorySize: argon.memory,
    iterations: argon.iterations,
    parallelism: argon.parallelism,
    hashLength: 32,
    outputType: 'encoded',
  });
}

/** Which algorithm made a hash, from its prefix. */
export function kindOf(hash: string): HashKind | 'argon2' | null {
  const h = hash.trim();
  if (/^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(h)) return 'bcrypt';
  if (/^\$argon2id\$/.test(h)) return 'argon2id';
  if (/^\$argon2(i|d)\$/.test(h)) return 'argon2';
  return null;
}

/** What the settings inside a hash say, e.g. cost 12 or m=19456,t=2,p=1. */
export function describeHash(hash: string): string | null {
  const h = hash.trim();
  const bcrypt = /^\$(2[abxy])\$(\d{2})\$/.exec(h);
  if (bcrypt) return `bcrypt, version ${bcrypt[1]}, cost ${Number(bcrypt[2])} (${(2 ** Number(bcrypt[2])).toLocaleString('en-US')} rounds)`;
  const argon = /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(h);
  if (argon) return `${argon[1]}, version ${argon[2]}, memory ${Math.round(Number(argon[3]) / 1024)} MiB, ${argon[4]} passes, ${argon[5]} lanes`;
  return null;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const l = await load();
  const kind = kindOf(hash);
  if (kind === 'bcrypt') return l.bcryptVerify({ password, hash: hash.trim() });
  if (kind) return l.argon2Verify({ password, hash: hash.trim() });
  throw new Error('This is not a bcrypt ($2a$, $2b$, $2y$) or Argon2 ($argon2id$) hash.');
}
