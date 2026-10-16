/**
 * Pure JWT helpers. Decoding only reads the token; it says nothing about whether
 * the signature is genuine. Nothing here sends the token anywhere.
 */
import { formatJson } from '../json-formatter/json-tools';

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Header and payload as indented JSON, with numbers and key order exactly as in the token. */
  headerText: string;
  payloadText: string;
  /** The three Base64URL parts as they appear in the token. */
  parts: { header: string; payload: string; signature: string };
}

export type DecodeResult = { ok: true; jwt: DecodedJwt } | { ok: false; message: string };

/** Removes spaces, line breaks and a leading "Bearer " copied from a header. */
export function cleanToken(input: string): string {
  return input.trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
}

/** Decodes Base64URL (or plain Base64) to bytes. Returns null when it is not valid. */
export function base64UrlToBytes(part: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9\-_+/]*={0,2}$/.test(part)) return null;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (base64.length % 4 === 1) return null;
  try {
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Decodes Base64URL (or plain Base64) to UTF-8 text. Returns null when it is not valid. */
export function base64UrlDecode(part: string): string | null {
  const bytes = base64UrlToBytes(part);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Encodes text or bytes as Base64URL without padding. */
export function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJsonPart(part: string, name: 'header' | 'payload'): { value: Record<string, unknown>; text: string } | string {
  const text = base64UrlDecode(part);
  if (text === null) return `The ${name} is not valid Base64URL text.`;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return `The ${name} decodes, but it is not JSON.`;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `The ${name} must be a JSON object.`;
  }
  const formatted = formatJson(text, 2);
  return { value: value as Record<string, unknown>, text: formatted.ok ? formatted.output : text };
}

export function decodeJwt(input: string): DecodeResult {
  const token = cleanToken(input);
  if (!token) return { ok: false, message: 'Paste a JWT to decode it.' };

  const parts = token.split('.');
  if (parts.length === 5) {
    return {
      ok: false,
      message: 'This is an encrypted token (JWE, five parts). Its contents cannot be read without the decryption key.',
    };
  }
  if (parts.length !== 3) {
    return {
      ok: false,
      message: `A JWT has three parts separated by dots (header.payload.signature). This text has ${parts.length}.`,
    };
  }

  const header = decodeJsonPart(parts[0], 'header');
  if (typeof header === 'string') return { ok: false, message: header };
  const payload = decodeJsonPart(parts[1], 'payload');
  if (typeof payload === 'string') return { ok: false, message: payload };
  // The signature is binary, so only its characters can be checked here.
  if (!/^[A-Za-z0-9\-_]*$/.test(parts[2])) {
    return { ok: false, message: 'The signature is not valid Base64URL.' };
  }

  return {
    ok: true,
    jwt: {
      header: header.value,
      payload: payload.value,
      headerText: header.text,
      payloadText: payload.text,
      parts: { header: parts[0], payload: parts[1], signature: parts[2] },
    },
  };
}

/** A time claim (iat, exp or nbf) turned into something people can read. */
export interface TimeClaim {
  name: 'iat' | 'nbf' | 'exp';
  label: string;
  seconds: number;
  date: Date;
  /** For example "in 2 hours" or "3 days ago". */
  relative: string;
}

const TIME_LABELS: Record<TimeClaim['name'], string> = {
  iat: 'Issued at',
  nbf: 'Not valid before',
  exp: 'Expires',
};

/** "in 2 hours", "3 days ago", "now". */
export function relativeTime(date: Date, now: Date): string {
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  // Round in each unit and move up once it reaches a whole next unit,
  // so 3,599.6 seconds reads "in 1 hour", not "in 60 minutes".
  const steps: [Intl.RelativeTimeFormatUnit, number, number][] = [
    ['second', 1, 60],
    ['minute', 60, 60],
    ['hour', 3600, 24],
    ['day', 86_400, 30],
    ['month', 30 * 86_400, 12],
  ];
  for (const [unit, size, limit] of steps) {
    const value = Math.round(seconds / size);
    if (Math.abs(value) < limit) return format.format(value, unit);
  }
  return format.format(Math.round(seconds / (365 * 86_400)), 'year');
}

/** Reads iat, nbf and exp when they are numbers (seconds since 1970, as the JWT standard says). */
export function timeClaims(payload: Record<string, unknown>, now: Date): TimeClaim[] {
  return (['iat', 'nbf', 'exp'] as const)
    .filter((name) => typeof payload[name] === 'number' && Number.isFinite(payload[name]))
    .map((name) => {
      const seconds = payload[name] as number;
      const date = new Date(seconds * 1000);
      return { name, label: TIME_LABELS[name], seconds, date, relative: relativeTime(date, now) };
    });
}

export type TokenTiming = 'expired' | 'not-yet-valid' | 'active' | 'no-expiry';

/** Whether the token is inside its time window. This does not check the signature. */
export function tokenTiming(payload: Record<string, unknown>, now: Date): TokenTiming {
  const nowSeconds = now.getTime() / 1000;
  const exp = typeof payload['exp'] === 'number' ? payload['exp'] : undefined;
  const nbf = typeof payload['nbf'] === 'number' ? payload['nbf'] : undefined;
  if (exp !== undefined && exp <= nowSeconds) return 'expired';
  if (nbf !== undefined && nbf > nowSeconds) return 'not-yet-valid';
  return exp === undefined ? 'no-expiry' : 'active';
}

/** Short explanations of the registered and common claims. */
export const CLAIM_INFO: Record<string, string> = {
  iss: 'Issuer: who created the token.',
  sub: 'Subject: who the token is about, usually a user ID.',
  aud: 'Audience: which service the token is meant for.',
  exp: 'Expiry time. The token must not be accepted after this.',
  nbf: 'Not before. The token must not be accepted before this.',
  iat: 'Issued at: when the token was created.',
  jti: 'Token ID: a unique ID, often used to stop a token being reused.',
  scope: 'Permissions granted to the token, separated by spaces.',
  scp: 'Permissions granted to the token.',
  azp: 'Authorised party: the app the token was issued to.',
  sid: 'Session ID.',
  name: 'Full name of the user.',
  email: 'Email address of the user.',
  roles: 'Roles assigned to the user.',
  alg: 'Signing algorithm.',
  typ: 'Token type, usually JWT.',
  kid: 'Key ID: which key was used to sign the token.',
};
