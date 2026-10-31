/**
 * AES encryption with the browser's Web Crypto. Two text formats: a password-based AES-256-GCM format, and one
 * that matches `openssl enc -aes-256-cbc -pbkdf2 -iter 10000 -md sha256 -base64`, so either side can decrypt.
 */

export type AesFormat = 'gcm' | 'openssl';

export const AES_FORMATS: { value: AesFormat; label: string; hint: string }[] = [
  { value: 'gcm', label: 'AES-256-GCM (recommended)', hint: 'Detects tampering. Output: Base64 of salt, IV and ciphertext. PBKDF2-SHA256, 600,000 rounds.' },
  { value: 'openssl', label: 'OpenSSL compatible (AES-256-CBC)', hint: 'Same as openssl enc -aes-256-cbc -pbkdf2 -iter 10000 -md sha256 -base64.' },
];

const GCM_ITERATIONS = 600_000;
const OPENSSL_ITERATIONS = 10_000;
const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, bits: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, bits));
}

const OPENSSL_MAGIC = encoder.encode('Salted__');

export async function encrypt(plaintext: string, password: string, format: AesFormat): Promise<string> {
  const data = encoder.encode(plaintext);
  if (format === 'gcm') {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', (await pbkdf2(password, salt, GCM_ITERATIONS, 256)) as BufferSource, 'AES-GCM', false, ['encrypt']);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    return toBase64(concat(salt, iv, cipher));
  }
  const salt = crypto.getRandomValues(new Uint8Array(8));
  // OpenSSL takes 48 bytes from PBKDF2: a 32-byte key, then a 16-byte IV.
  const material = await pbkdf2(password, salt, OPENSSL_ITERATIONS, 48 * 8);
  const key = await crypto.subtle.importKey('raw', material.slice(0, 32) as BufferSource, 'AES-CBC', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: material.slice(32) }, key, data));
  return toBase64(concat(OPENSSL_MAGIC, salt, cipher));
}

export type DecryptResult = { ok: true; text: string } | { ok: false; error: string };

export async function decrypt(base64: string, password: string, format: AesFormat): Promise<DecryptResult> {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(base64.trim());
  } catch {
    return { ok: false, error: 'The encrypted text is not valid Base64.' };
  }
  try {
    if (format === 'gcm') {
      if (bytes.length < 16 + 12 + 16) return { ok: false, error: 'This is too short to be text encrypted in this format.' };
      const key = await crypto.subtle.importKey('raw', (await pbkdf2(password, bytes.slice(0, 16), GCM_ITERATIONS, 256)) as BufferSource, 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28));
      return { ok: true, text: new TextDecoder().decode(plain) };
    }
    if (!OPENSSL_MAGIC.every((b, i) => bytes[i] === b)) return { ok: false, error: 'OpenSSL output starts with “U2FsdGVkX1” (Salted__). Use -salt and -base64.' };
    const material = await pbkdf2(password, bytes.slice(8, 16), OPENSSL_ITERATIONS, 48 * 8);
    const key = await crypto.subtle.importKey('raw', material.slice(0, 32) as BufferSource, 'AES-CBC', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: material.slice(32) }, key, bytes.slice(16));
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(plain) };
  } catch {
    return { ok: false, error: 'Could not decrypt. The password is wrong, the text was changed, or another format was used.' };
  }
}
