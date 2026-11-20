/** Password hashing (PBKDF2-SHA256), random tokens and SHA-256, with the Web Crypto API. */

const encoder = new TextEncoder();
// Cloudflare Workers allow at most 100 000 PBKDF2 iterations.
const ITERATIONS = 100_000;

const toHex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(bits);
}

/** Stored as "pbkdf2:<iterations>:<salt hex>:<hash hex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return ['pbkdf2', ITERATIONS, toHex(salt), await derive(password, salt, ITERATIONS)].join(':');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split(':');
  if (scheme !== 'pbkdf2' || !salt || !hash) return false;
  const candidate = await derive(password, fromHex(salt), Number(iterations));
  // Compare in constant time.
  let diff = candidate.length ^ hash.length;
  for (let i = 0; i < Math.min(candidate.length, hash.length); i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/** A hash to check against when the email is unknown, so both cases take the same time. */
export const DUMMY_HASH = ['pbkdf2', ITERATIONS, '0'.repeat(32), '0'.repeat(64)].join(':');

/** A random URL-safe token (32 bytes). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}
