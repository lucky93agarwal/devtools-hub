/**
 * Creating test tokens with Web Crypto. Keys made here live only in this page,
 * so tokens signed with them are for testing, never for real systems.
 */
import { findJsonError, minifyJson } from '../json-formatter/json-tools';
import { parseTree, printTree } from '../json-formatter/json-tree';
import { base64UrlEncode } from './jwt-tools';
import { ALGORITHMS, AlgorithmInfo, secretBytes } from './jwt-verify';

/** Algorithms offered when creating a token. */
export const SIGNING_ALGORITHMS = ['HS256', 'HS384', 'HS512', 'RS256', 'PS256', 'ES256', 'ES384'] as const;
export type SigningAlgorithm = (typeof SIGNING_ALGORITHMS)[number];

export type SigningKey =
  | { kind: 'secret'; text: string; isBase64: boolean }
  /** A key pair made in this page; the public key is shown so the token can be checked elsewhere. */
  | { kind: 'pair'; privateKey: CryptoKey };

export type SignResult = { ok: true; token: string } | { ok: false; message: string };

function keyParams(info: AlgorithmInfo) {
  if (info.family === 'ecdsa') return { name: 'ECDSA', namedCurve: info.curve! };
  return {
    name: info.family === 'pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
    hash: info.hash,
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  };
}

/** Makes a new key pair for an RS, PS or ES algorithm, with the public key as PEM and JWK. */
export async function generateKeyPair(
  alg: SigningAlgorithm,
): Promise<{ privateKey: CryptoKey; publicPem: string; publicJwk: JsonWebKey }> {
  const info = ALGORITHMS[alg];
  if (info.family === 'hmac') throw new Error(`${alg} uses a shared secret, not a key pair.`);
  const pair = (await crypto.subtle.generateKey(keyParams(info), true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  let base64 = '';
  for (const byte of spki) base64 += String.fromCharCode(byte);
  const lines = btoa(base64).match(/.{1,64}/g)!.join('\n');
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicPem: `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`,
    publicJwk: { kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y },
  };
}

/** A random secret long enough for the algorithm, as Base64URL text. */
export function randomSecret(alg: SigningAlgorithm): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ALGORITHMS[alg].bytes));
  return base64UrlEncode(bytes);
}

function describeJsonError(text: string, part: 'Header' | 'Payload'): string {
  const error = findJsonError(text);
  return error
    ? `${part} is not valid JSON. Line ${error.line}, column ${error.column}: ${error.message}`
    : `${part} is not valid JSON.`;
}

/**
 * Builds and signs a token. The header's alg is set to the chosen algorithm.
 * The payload is minified without changing numbers, key order or escapes.
 */
export async function signJwt(
  alg: SigningAlgorithm,
  headerText: string,
  payloadText: string,
  key: SigningKey,
): Promise<SignResult> {
  const info = ALGORITHMS[alg];

  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch {
    return { ok: false, message: describeJsonError(headerText, 'Header') };
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    return { ok: false, message: 'Header must be a JSON object, for example {"typ": "JWT"}.' };
  }

  const payload = minifyJson(payloadText);
  if (!payload.ok) return { ok: false, message: describeJsonError(payloadText, 'Payload') };
  if (!payload.output.startsWith('{')) {
    return { ok: false, message: 'Payload must be a JSON object, for example {"sub": "user-1"}.' };
  }

  const encodedHeader = base64UrlEncode(JSON.stringify({ ...header, alg }));
  const signingInput = `${encodedHeader}.${base64UrlEncode(payload.output)}`;
  const data = new TextEncoder().encode(signingInput);

  let signature: ArrayBuffer;
  if (key.kind === 'secret') {
    if (info.family !== 'hmac') return { ok: false, message: `${alg} needs a key pair, not a secret.` };
    if (!key.text) return { ok: false, message: 'Enter a secret, or generate a random one.' };
    const bytes = secretBytes(key.text, key.isBase64);
    if (!bytes) return { ok: false, message: 'The secret is not valid Base64.' };
    const hmac = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: info.hash }, false, ['sign']);
    signature = await crypto.subtle.sign('HMAC', hmac, data);
  } else {
    if (info.family === 'hmac') return { ok: false, message: `${alg} uses a shared secret, not a key pair.` };
    const algorithm =
      info.family === 'rsa'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : info.family === 'pss'
          ? { name: 'RSA-PSS', saltLength: info.bytes }
          : { name: 'ECDSA', hash: info.hash };
    signature = await crypto.subtle.sign(algorithm, key.privateKey, data);
  }
  return { ok: true, token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}` };
}

/**
 * Sets (or with null removes) one top-level claim in payload JSON text without
 * touching anything else, so large numbers and key order stay as typed.
 * Returns null when the text is not a JSON object.
 */
export function setClaim(payloadText: string, name: string, value: number | string | null): string | null {
  try {
    if (!payloadText.trim().startsWith('{')) return null;
    JSON.parse(payloadText);
  } catch {
    return null;
  }
  const tree = parseTree(payloadText);
  if (tree.kind !== 'object') return null;
  const rawKey = JSON.stringify(name);
  const members = tree.members.filter((member) => JSON.parse(member.rawKey) !== name);
  if (value !== null) {
    const index = tree.members.findIndex((member) => JSON.parse(member.rawKey) === name);
    const member = { rawKey, value: { kind: 'raw' as const, text: JSON.stringify(value) } };
    if (index === -1) members.push(member);
    else members.splice(index, 0, member);
  }
  return printTree({ kind: 'object', members }, '  ');
}
