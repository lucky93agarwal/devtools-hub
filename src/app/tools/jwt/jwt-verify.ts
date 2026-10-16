/**
 * JWT signature checking with the browser's Web Crypto API. No library, and the
 * secret or key never leaves the page.
 */
import { base64UrlToBytes } from './jwt-tools';

type Family = 'hmac' | 'rsa' | 'pss' | 'ecdsa';
type Hash = 'SHA-256' | 'SHA-384' | 'SHA-512';

interface AlgorithmInfo {
  family: Family;
  hash: Hash;
  /** Hash size in bytes; also the minimum safe HMAC secret length. */
  bytes: number;
  curve?: 'P-256' | 'P-384' | 'P-521';
  /** Length of an ECDSA signature (r and s side by side). */
  ecSignatureBytes?: number;
}

const ALGORITHMS: Record<string, AlgorithmInfo> = {
  HS256: { family: 'hmac', hash: 'SHA-256', bytes: 32 },
  HS384: { family: 'hmac', hash: 'SHA-384', bytes: 48 },
  HS512: { family: 'hmac', hash: 'SHA-512', bytes: 64 },
  RS256: { family: 'rsa', hash: 'SHA-256', bytes: 32 },
  RS384: { family: 'rsa', hash: 'SHA-384', bytes: 48 },
  RS512: { family: 'rsa', hash: 'SHA-512', bytes: 64 },
  PS256: { family: 'pss', hash: 'SHA-256', bytes: 32 },
  PS384: { family: 'pss', hash: 'SHA-384', bytes: 48 },
  PS512: { family: 'pss', hash: 'SHA-512', bytes: 64 },
  ES256: { family: 'ecdsa', hash: 'SHA-256', bytes: 32, curve: 'P-256', ecSignatureBytes: 64 },
  ES384: { family: 'ecdsa', hash: 'SHA-384', bytes: 48, curve: 'P-384', ecSignatureBytes: 96 },
  ES512: { family: 'ecdsa', hash: 'SHA-512', bytes: 64, curve: 'P-521', ecSignatureBytes: 132 },
};

export const SUPPORTED_ALGORITHMS = Object.keys(ALGORITHMS);

/** What the user must provide to check this algorithm, or null if it cannot be checked here. */
export function keyKind(alg: string | null): 'secret' | 'public-key' | null {
  const info = alg ? ALGORITHMS[alg] : undefined;
  if (!info) return null;
  return info.family === 'hmac' ? 'secret' : 'public-key';
}

export interface VerifyInput {
  alg: string;
  /** The first two parts of the token joined by a dot, exactly as in the token. */
  signingInput: string;
  /** The third part of the token. */
  signature: string;
  /** Secret for HS algorithms; PEM or JWK public key for the others. */
  key: string;
  /** The HS secret is Base64 (or Base64URL) encoded rather than plain text. */
  secretIsBase64?: boolean;
  /** Key ID from the token header, used to pick a key from a JWK set. */
  kid?: string;
}

export type VerifyResult = { status: 'valid' } | { status: 'invalid' } | { status: 'error'; message: string };

const fail = (message: string): VerifyResult => ({ status: 'error', message });

export async function verifySignature(input: VerifyInput): Promise<VerifyResult> {
  const info = ALGORITHMS[input.alg];
  if (!info) return fail(`Checking ${input.alg} signatures is not supported. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}.`);
  if (!input.key.trim()) return fail(info.family === 'hmac' ? 'Enter the secret.' : 'Paste the public key.');

  const signature = base64UrlToBytes(input.signature);
  if (!signature || signature.length === 0) return fail('The token has no signature to check.');

  let key: CryptoKey;
  try {
    const imported = info.family === 'hmac' ? await importSecret(input, info) : await importPublicKey(input, info);
    if ('message' in imported) return fail(imported.message);
    key = imported.key;
  } catch {
    return fail(`This key could not be used for ${input.alg}. Check that it is the right type of key.`);
  }

  // A JWS ECDSA signature is r and s side by side; other lengths (such as DER) are not valid.
  if (info.ecSignatureBytes && signature.length !== info.ecSignatureBytes) return { status: 'invalid' };

  const algorithm =
    info.family === 'hmac'
      ? { name: 'HMAC' }
      : info.family === 'rsa'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : info.family === 'pss'
          ? { name: 'RSA-PSS', saltLength: info.bytes }
          : { name: 'ECDSA', hash: info.hash };
  const data = new TextEncoder().encode(input.signingInput);
  const valid = await crypto.subtle.verify(algorithm, key, signature, data);
  return { status: valid ? 'valid' : 'invalid' };
}

/** Secret bytes as the server would see them, or null if the Base64 is broken. */
export function secretBytes(secret: string, isBase64 = false): Uint8Array<ArrayBuffer> | null {
  return isBase64 ? base64UrlToBytes(secret.trim()) : new TextEncoder().encode(secret);
}

async function importSecret(input: VerifyInput, info: AlgorithmInfo): Promise<{ key: CryptoKey } | { message: string }> {
  if (looksLikePublicKey(input.key)) {
    return {
      message:
        `This token says ${input.alg}, which uses a shared secret, but you entered a public key. ` +
        'Treating a public key as an HMAC secret is a known attack (algorithm confusion); servers must reject it.',
    };
  }
  const bytes = secretBytes(input.key, input.secretIsBase64);
  if (!bytes) return { message: 'The secret is not valid Base64.' };
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: info.hash }, false, ['verify']);
  return { key };
}

const looksLikePublicKey = (text: string) => /-----BEGIN [A-Z ]*KEY-----|-----BEGIN CERTIFICATE-----|"kty"\s*:/.test(text);

async function importPublicKey(input: VerifyInput, info: AlgorithmInfo): Promise<{ key: CryptoKey } | { message: string }> {
  const params =
    info.family === 'ecdsa'
      ? { name: 'ECDSA', namedCurve: info.curve! }
      : { name: info.family === 'pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash: info.hash };
  const text = input.key.trim();

  if (text.startsWith('{')) {
    const jwk = pickJwk(text, input.kid);
    if ('message' in jwk) return jwk;
    return { key: await crypto.subtle.importKey('jwk', jwk.jwk, params, false, ['verify']) };
  }
  if (/PRIVATE KEY-----/.test(text)) {
    return { message: 'This is a private key. Paste the public key instead, and never paste a private key into a website.' };
  }
  if (/-----BEGIN CERTIFICATE-----/.test(text)) {
    return { message: 'Certificates are not supported yet. Paste the public key (BEGIN PUBLIC KEY) or a JWK instead.' };
  }
  if (/-----BEGIN RSA PUBLIC KEY-----/.test(text)) {
    return {
      message:
        'This is an RSA key in the older PKCS#1 format. Convert it with: ' +
        'openssl rsa -RSAPublicKey_in -in key.pem -pubout',
    };
  }
  const pem = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(text);
  if (!pem) return { message: 'Paste a public key in PEM format (BEGIN PUBLIC KEY) or as a JWK.' };
  const der = base64UrlToBytes(pem[1].replace(/\s+/g, ''));
  if (!der) return { message: 'The PEM key is not valid Base64.' };
  return { key: await crypto.subtle.importKey('spki', der, params, false, ['verify']) };
}

/** Reads a JWK or a JWK set and keeps only the public fields Web Crypto needs. */
function pickJwk(text: string, kid?: string): { jwk: JsonWebKey } | { message: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { message: 'The key looks like JSON but is not valid JSON.' };
  }
  let jwk = value as JsonWebKey & { kid?: string; keys?: (JsonWebKey & { kid?: string })[] };
  if (Array.isArray(jwk.keys)) {
    const keys = jwk.keys;
    const match = kid ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : undefined;
    if (!match) {
      return {
        message: kid
          ? `No key in this set has the token's key ID (kid "${kid}").`
          : 'This key set has several keys and the token has no kid, so paste the one key to use.',
      };
    }
    jwk = match;
  }
  if (jwk.kty === 'RSA') return { jwk: { kty: 'RSA', n: jwk.n, e: jwk.e } };
  if (jwk.kty === 'EC') return { jwk: { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y } };
  return { message: 'The JWK must be an RSA or EC public key (kty "RSA" or "EC").' };
}

/** Common example secrets that attackers try first. */
const WELL_KNOWN_SECRETS = new Set([
  'secret',
  'your-256-bit-secret',
  'your-384-bit-secret',
  'your-512-bit-secret',
  'password',
  'changeme',
  'change-me',
  'jwt-secret',
  'jwtsecret',
  'mysecret',
  'my-secret',
  'secretkey',
  'secret-key',
  'key',
  'test',
  '123456',
  'admin',
]);

/** Plain-language warnings about the token header and, for HS tokens, the secret. */
export function securityWarnings(header: Record<string, unknown>, secret?: { text: string; isBase64: boolean }): string[] {
  const warnings: string[] = [];
  const alg = typeof header['alg'] === 'string' ? header['alg'] : '';

  for (const name of ['jku', 'x5u'] as const) {
    if (header[name] !== undefined) {
      warnings.push(
        `The header points to a key URL (${name}). Servers should never fetch the checking key from a URL inside the token.`,
      );
    }
  }
  if (header['jwk'] !== undefined) {
    warnings.push('The header carries its own key (jwk). Servers must not trust a key that arrives inside the token.');
  }

  const info = ALGORITHMS[alg];
  if (secret && info?.family === 'hmac' && secret.text) {
    const bytes = secretBytes(secret.text, secret.isBase64);
    if (bytes && WELL_KNOWN_SECRETS.has(secret.text.trim().toLowerCase())) {
      warnings.push('This secret is a well-known example. Attackers try these first, so never use it outside a demo.');
    } else if (bytes && bytes.length < info.bytes) {
      warnings.push(
        `This secret is ${bytes.length} bytes. ${alg} should use at least ${info.bytes} bytes ` +
          `(${info.bytes * 8} bits) of random data; short secrets can be guessed offline from any token.`,
      );
    }
  }
  return warnings;
}
