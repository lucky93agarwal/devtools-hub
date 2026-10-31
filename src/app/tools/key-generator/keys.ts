/**
 * Key pairs for JWT and OAuth with Web Crypto: RSA, ECDSA and Ed25519, as PEM, JWK and a JWKS with an
 * RFC 7638 thumbprint as kid. Converts PEM keys (SPKI, PKCS#8 and PKCS#1 RSA) to JWK and back.
 */
import { oid, parseDer } from '../certificate-decoder/x509';

export type KeyAlg = 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'ES256' | 'ES384' | 'ES512' | 'EdDSA';

export const KEY_ALGS: { value: KeyAlg; label: string }[] = [
  { value: 'RS256', label: 'RS256 (RSA, most widely supported)' },
  { value: 'PS256', label: 'PS256 (RSA-PSS)' },
  { value: 'ES256', label: 'ES256 (ECDSA P-256, small and fast)' },
  { value: 'ES384', label: 'ES384 (ECDSA P-384)' },
  { value: 'ES512', label: 'ES512 (ECDSA P-521)' },
  { value: 'EdDSA', label: 'EdDSA (Ed25519)' },
];

type Params = RsaHashedImportParams | EcKeyImportParams | Algorithm;

function params(alg: KeyAlg): Params {
  if (alg.startsWith('RS')) return { name: 'RSASSA-PKCS1-v1_5', hash: `SHA-${alg.slice(2)}` };
  if (alg.startsWith('PS')) return { name: 'RSA-PSS', hash: `SHA-${alg.slice(2)}` };
  if (alg === 'EdDSA') return { name: 'Ed25519' };
  return { name: 'ECDSA', namedCurve: { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' }[alg as 'ES256'] };
}

const b64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const toPem = (der: Uint8Array, label: string) => `-----BEGIN ${label}-----\n${b64(der).replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${label}-----\n`;

/** RFC 7638 thumbprint: SHA-256 of the required members in order, Base64URL. Used as the key id (kid). */
export async function thumbprint(jwk: JsonWebKey): Promise<string> {
  const members: Record<string, string[]> = { RSA: ['e', 'kty', 'n'], EC: ['crv', 'kty', 'x', 'y'], OKP: ['crv', 'kty', 'x'] };
  const keys = members[jwk.kty ?? ''];
  if (!keys) throw new Error(`Unknown key type ${jwk.kty}.`);
  const json = `{${keys.map((k) => `"${k}":"${(jwk as Record<string, string>)[k]}"`).join(',')}}`;
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))));
}

/** A JWK with the key id, which the DOM type leaves out. */
export type Jwk = JsonWebKey & { kid?: string };

export interface KeyPair {
  publicPem: string;
  privatePem: string;
  publicJwk: Jwk;
  privateJwk: Jwk;
  jwks: string;
  kid: string;
}

export async function generateKeyPair(alg: KeyAlg, rsaBits = 2048): Promise<KeyPair> {
  const p = params(alg);
  const gen = p.name.startsWith('RSA') ? { ...p, modulusLength: rsaBits, publicExponent: new Uint8Array([1, 0, 1]) } : p;
  const pair = (await crypto.subtle.generateKey(gen as RsaHashedKeyGenParams, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const kid = await thumbprint(publicJwk);
  const tidy = (jwk: JsonWebKey): Jwk => {
    const { key_ops, ext, ...rest } = jwk;
    void key_ops;
    void ext;
    return { ...rest, alg, use: 'sig', kid };
  };
  const pub = tidy(publicJwk);
  return {
    publicPem: toPem(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)), 'PUBLIC KEY'),
    privatePem: toPem(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)), 'PRIVATE KEY'),
    publicJwk: pub,
    privateJwk: tidy(privateJwk),
    jwks: JSON.stringify({ keys: [pub] }, null, 2),
    kid,
  };
}

/** DER length and element encoding, to wrap PKCS#1 RSA keys in the standard containers. */
function tlv(tag: number, body: Uint8Array): Uint8Array {
  const len = body.length;
  const lenBytes = len < 128 ? [len] : len < 256 ? [0x81, len] : len < 65536 ? [0x82, len >> 8, len & 255] : [0x83, len >> 16, (len >> 8) & 255, len & 255];
  const out = new Uint8Array(1 + lenBytes.length + len);
  out.set([tag, ...lenBytes]);
  out.set(body, 1 + lenBytes.length);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const RSA_ALG_ID = tlv(0x30, concat(tlv(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])), new Uint8Array([0x05, 0x00])));

export type ConvertResult = { ok: true; text: string; kind: string } | { ok: false; error: string };

/** Which algorithm a SPKI or PKCS#8 key is for, from its algorithm identifier. */
function detect(der: Uint8Array, isPrivate: boolean): Params | null {
  const top = parseDer(der)[0];
  const algSeq = top.children[isPrivate ? 1 : 0];
  const id = oid(algSeq.children[0].value);
  if (id === '1.2.840.113549.1.1.1') return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  if (id === '1.2.840.113549.1.1.10') return { name: 'RSA-PSS', hash: 'SHA-256' };
  if (id === '1.3.101.112') return { name: 'Ed25519' };
  if (id === '1.2.840.10045.2.1') {
    const curve = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' }[oid(algSeq.children[1].value)];
    return curve ? { name: 'ECDSA', namedCurve: curve } : null;
  }
  return null;
}

export async function pemToJwk(pem: string): Promise<ConvertResult> {
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/.exec(pem);
  if (!m) return { ok: false, error: 'Paste a PEM key that starts with -----BEGIN … KEY-----.' };
  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, error: 'The Base64 inside the PEM is damaged.' };
  }
  let label = m[1];
  if (label === 'RSA PUBLIC KEY') {
    der = tlv(0x30, concat(RSA_ALG_ID, tlv(0x03, concat(new Uint8Array([0]), der))));
    label = 'PUBLIC KEY';
  } else if (label === 'RSA PRIVATE KEY') {
    der = tlv(0x30, concat(new Uint8Array([0x02, 0x01, 0x00]), RSA_ALG_ID, tlv(0x04, der)));
    label = 'PRIVATE KEY';
  } else if (label === 'EC PRIVATE KEY') {
    return { ok: false, error: 'This is an SEC1 EC key. Convert it first: openssl pkcs8 -topk8 -nocrypt -in key.pem' };
  } else if (label === 'CERTIFICATE') {
    return { ok: false, error: 'This is a certificate. Open it in the SSL Certificate Decoder, or extract its key with openssl x509 -pubkey -noout.' };
  }
  const isPrivate = label === 'PRIVATE KEY';
  if (!isPrivate && label !== 'PUBLIC KEY') return { ok: false, error: `“${label}” keys are not supported. Use PUBLIC KEY, PRIVATE KEY or RSA keys.` };
  try {
    const p = detect(der, isPrivate);
    if (!p) return { ok: false, error: 'This key type is not supported (RSA, EC P-256/384/521 and Ed25519 are).' };
    const key = await crypto.subtle.importKey(isPrivate ? 'pkcs8' : 'spki', der as BufferSource, p, true, isPrivate ? ['sign'] : ['verify']);
    const { key_ops, ext, alg, ...jwk } = await crypto.subtle.exportKey('jwk', key);
    void key_ops;
    void ext;
    void alg;
    const kid = await thumbprint(jwk);
    return { ok: true, text: JSON.stringify({ ...jwk, kid }, null, 2), kind: `${isPrivate ? 'Private' : 'Public'} ${p.name === 'ECDSA' ? `EC ${(p as EcKeyImportParams).namedCurve}` : p.name} key` };
  } catch (error) {
    return { ok: false, error: `The key could not be read: ${(error as Error).message}` };
  }
}

export async function jwkToPem(text: string): Promise<ConvertResult> {
  let jwk: JsonWebKey & { kid?: string };
  try {
    jwk = JSON.parse(text);
    if ('keys' in jwk && Array.isArray((jwk as { keys: JsonWebKey[] }).keys)) jwk = (jwk as { keys: JsonWebKey[] }).keys[0];
  } catch {
    return { ok: false, error: 'This is not valid JSON.' };
  }
  const p: Params | null =
    jwk.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : jwk.kty === 'EC' ? { name: 'ECDSA', namedCurve: jwk.crv } : jwk.kty === 'OKP' && jwk.crv === 'Ed25519' ? { name: 'Ed25519' } : null;
  if (!p) return { ok: false, error: 'Supported: RSA, EC (P-256, P-384, P-521) and Ed25519 keys.' };
  const isPrivate = 'd' in jwk;
  try {
    const { alg, key_ops, use, ...clean } = jwk;
    void alg;
    void key_ops;
    void use;
    const key = await crypto.subtle.importKey('jwk', clean, p, true, isPrivate ? ['sign'] : ['verify']);
    const der = new Uint8Array(await crypto.subtle.exportKey(isPrivate ? 'pkcs8' : 'spki', key));
    return { ok: true, text: toPem(der, isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY'), kind: `${isPrivate ? 'Private' : 'Public'} ${jwk.kty} key` };
  } catch (error) {
    return { ok: false, error: `The JWK could not be read: ${(error as Error).message}` };
  }
}
