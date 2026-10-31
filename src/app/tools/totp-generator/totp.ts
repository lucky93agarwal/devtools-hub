/** TOTP and HOTP codes (RFC 6238 / RFC 4226), Base32 secrets and otpauth:// links, with Web Crypto. */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export const newSecret = () => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export type Algorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface TotpSettings {
  algorithm: Algorithm;
  digits: number;
  period: number;
}

export const DEFAULT_TOTP: TotpSettings = { algorithm: 'SHA-1', digits: 6, period: 30 };

/** HOTP: the code for one counter value. */
export async function hotp(secret: Uint8Array, counter: number, algorithm: Algorithm, digits: number): Promise<string> {
  const message = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = c % 256;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = mac[mac.length - 1] & 0xf;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export const totp = (secret: Uint8Array, unixSeconds: number, s: TotpSettings) => hotp(secret, Math.floor(unixSeconds / s.period), s.algorithm, s.digits);

export interface OtpAuth extends TotpSettings {
  secret: string;
  issuer: string;
  account: string;
}

export function parseOtpAuth(uri: string): OtpAuth | null {
  try {
    const url = new URL(uri.trim());
    if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') return null;
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const [labelIssuer, account] = label.includes(':') ? label.split(/:(.*)/) : ['', label];
    const algorithm = `SHA-${(url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace(/^SHA-?/, '')}` as Algorithm;
    return {
      secret: url.searchParams.get('secret') ?? '',
      issuer: url.searchParams.get('issuer') ?? labelIssuer,
      account: account.trim(),
      algorithm: ['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm) ? algorithm : 'SHA-1',
      digits: Number(url.searchParams.get('digits') ?? 6),
      period: Number(url.searchParams.get('period') ?? 30),
    };
  } catch {
    return null;
  }
}

export function buildOtpAuth(o: OtpAuth): string {
  const label = encodeURIComponent(o.issuer ? `${o.issuer}:${o.account}` : o.account);
  const params = new URLSearchParams({ secret: o.secret.replace(/\s+/g, '').toUpperCase() });
  if (o.issuer) params.set('issuer', o.issuer);
  if (o.algorithm !== 'SHA-1') params.set('algorithm', o.algorithm.replace('-', ''));
  if (o.digits !== 6) params.set('digits', String(o.digits));
  if (o.period !== 30) params.set('period', String(o.period));
  return `otpauth://totp/${label}?${params}`;
}
