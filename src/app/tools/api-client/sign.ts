import { signJwt } from '../jwt/jwt-sign';
import { ALGORITHMS } from '../jwt/jwt-verify';
import { Auth } from './auth';
import { PreparedRequest } from './build';
import { md5 } from './md5';

/**
 * Auth that is worked out when sending, because it depends on the time, a fresh
 * nonce or the exact request: JWT, Digest, OAuth 1.0, Hawk, AWS Signature,
 * Akamai EdgeGrid and ASAP. Everything uses Web Crypto in the browser.
 */

export class AuthError extends Error {}

export interface SignContext {
  now: Date;
  /** Random text for nonces; replaceable in tests. */
  nonce: (length: number) => string;
}

export const defaultContext = (): SignContext => ({ now: new Date(), nonce: randomText });

function randomText(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

const encoder = new TextEncoder();
type Hash = 'SHA-1' | 'SHA-256' | 'SHA-512';

const bytesOf = (data: string | Uint8Array) => (typeof data === 'string' ? encoder.encode(data) : data) as Uint8Array<ArrayBuffer>;

async function hmac(hash: Hash, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', bytesOf(key), { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, bytesOf(data)));
}

async function digest(hash: Hash, data: string | Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(hash, bytesOf(data)));
}

export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Percent-encoding per RFC 3986, as OAuth and AWS need (encodeURIComponent leaves !'()* alone). */
export const rfc3986 = (text: string) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const withHeader = (prepared: PreparedRequest, name: string, value: string): PreparedRequest => ({
  ...prepared,
  headers: [...prepared.headers.filter(([key]) => key.toLowerCase() !== name.toLowerCase()), [name, value]],
});

const withQuery = (prepared: PreparedRequest, params: [string, string][]): PreparedRequest => {
  const [base, hash] = prepared.url.split('#');
  const query = params.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
  const url = `${base}${base.includes('?') ? '&' : '?'}${query}${hash ? `#${hash}` : ''}`;
  return { ...prepared, url };
};

const headerValue = (prepared: PreparedRequest, name: string) =>
  prepared.headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

/** Adds the auth that needs signing. Requests without such auth come back unchanged. */
export async function signRequest(prepared: PreparedRequest, context: SignContext = defaultContext()): Promise<PreparedRequest> {
  const auth = prepared.signWith;
  if (!auth) return prepared;
  const url = parseUrl(prepared.url);
  switch (auth.type) {
    case 'jwt':
      return addJwt(prepared, auth);
    case 'asap':
      return withHeader(prepared, 'Authorization', `Bearer ${await asapToken(auth, context)}`);
    case 'digest':
      return withHeader(prepared, 'Authorization', await digestHeader(prepared, url, auth, context));
    case 'oauth1':
      return oauth1(prepared, url, auth, context);
    case 'hawk':
      return withHeader(prepared, 'Authorization', await hawkHeader(prepared, url, auth, context));
    case 'aws':
      return awsSign(prepared, url, auth, context);
    case 'edgegrid':
      return withHeader(prepared, 'Authorization', await edgegridHeader(prepared, url, auth, context));
    case 'ntlm':
      throw new AuthError(
        'NTLM needs a handshake on the network connection itself, which browsers do not let web pages do. Use Postman, or curl --ntlm in a terminal.',
      );
    default:
      return prepared;
  }
}

function parseUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new AuthError('Enter a valid URL first; the signature includes it.');
  }
}

// JWT Bearer and ASAP

/** Imports a PEM private key (PKCS #8) for an RS, PS or ES algorithm. */
async function importPrivateKey(pem: string, alg: string): Promise<CryptoKey> {
  if (/BEGIN (RSA|EC) PRIVATE KEY/.test(pem)) {
    throw new AuthError(
      'This key is in the older PKCS #1 or SEC 1 format. Convert it to PKCS #8 ("BEGIN PRIVATE KEY") with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem',
    );
  }
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  if (!body) throw new AuthError(`${alg} needs a private key in PEM format ("BEGIN PRIVATE KEY").`);
  let der: Uint8Array<ArrayBuffer>;
  try {
    der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    throw new AuthError('The private key is not valid PEM.');
  }
  const info = ALGORITHMS[alg];
  const params =
    info.family === 'ecdsa'
      ? { name: 'ECDSA', namedCurve: info.curve! }
      : { name: info.family === 'pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash: info.hash };
  try {
    return await crypto.subtle.importKey('pkcs8', der, params, false, ['sign']);
  } catch {
    throw new AuthError(`The private key does not fit ${alg}. Check the algorithm and the key.`);
  }
}

async function jwt(alg: string, header: string, payload: string, key: { secret: string; secretBase64: boolean; privateKey: string }) {
  const info = ALGORITHMS[alg];
  const signingKey =
    info.family === 'hmac'
      ? { kind: 'secret' as const, text: key.secret, isBase64: key.secretBase64 }
      : { kind: 'pair' as const, privateKey: await importPrivateKey(key.privateKey, alg) };
  const result = await signJwt(alg as never, header || '{}', payload, signingKey);
  if (!result.ok) throw new AuthError(result.message);
  return result.token;
}

async function addJwt(prepared: PreparedRequest, auth: Extract<Auth, { type: 'jwt' }>): Promise<PreparedRequest> {
  const token = await jwt(auth.algorithm, auth.header, auth.payload, auth);
  if (auth.addTo === 'query') return withQuery(prepared, [[auth.queryKey || 'token', token]]);
  return withHeader(prepared, 'Authorization', `${auth.prefix} ${token}`.trim());
}

async function asapToken(auth: Extract<Auth, { type: 'asap' }>, context: SignContext): Promise<string> {
  if (!auth.issuer || !auth.audience || !auth.keyId) throw new AuthError('ASAP needs an issuer, an audience and a key ID.');
  let extra: Record<string, unknown> = {};
  try {
    extra = auth.claims.trim() ? JSON.parse(auth.claims) : {};
  } catch {
    throw new AuthError('Additional claims must be valid JSON.');
  }
  const iat = Math.floor(context.now.getTime() / 1000);
  const payload = {
    iss: auth.issuer,
    sub: auth.subject || auth.issuer,
    aud: auth.audience.split(',').map((a) => a.trim()).filter(Boolean),
    jti: crypto.randomUUID(),
    iat,
    exp: iat + (auth.expiresIn || 3600),
    ...extra,
  };
  return jwt(auth.algorithm, JSON.stringify({ kid: auth.keyId }), JSON.stringify(payload), { secret: '', secretBase64: false, privateKey: auth.privateKey });
}

// Digest (RFC 7616)

export async function digestHeader(
  prepared: PreparedRequest,
  url: URL,
  auth: Extract<Auth, { type: 'digest' }>,
  context: SignContext,
): Promise<string> {
  if (!auth.realm || !auth.nonce) {
    throw new AuthError(
      'Digest needs the realm and nonce from the server\'s 401 response. Browsers hide that response header from web pages, so copy them from the WWW-Authenticate header (for example with curl -i) into the fields.',
    );
  }
  const sha = auth.algorithm.startsWith('SHA-256');
  const H = async (text: string) => (sha ? hex(await digest('SHA-256', text)) : md5(text));
  const uri = url.pathname + url.search;
  const cnonce = auth.clientNonce || context.nonce(16);
  const nc = auth.nonceCount || '00000001';
  let ha1 = await H(`${auth.username}:${auth.realm}:${auth.password}`);
  if (auth.algorithm.endsWith('-sess')) ha1 = await H(`${ha1}:${auth.nonce}:${cnonce}`);
  const ha2 =
    auth.qop === 'auth-int'
      ? await H(`${prepared.method}:${uri}:${await H(prepared.bodyText ?? '')}`)
      : await H(`${prepared.method}:${uri}`);
  const response = auth.qop
    ? await H(`${ha1}:${auth.nonce}:${nc}:${cnonce}:${auth.qop}:${ha2}`)
    : await H(`${ha1}:${auth.nonce}:${ha2}`);
  const parts = [
    `username="${auth.username}"`,
    `realm="${auth.realm}"`,
    `nonce="${auth.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${auth.algorithm}`,
    ...(auth.qop ? [`qop=${auth.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    `response="${response}"`,
    ...(auth.opaque ? [`opaque="${auth.opaque}"`] : []),
  ];
  return `Digest ${parts.join(', ')}`;
}

// OAuth 1.0 (RFC 5849)

export async function oauth1(
  prepared: PreparedRequest,
  url: URL,
  auth: Extract<Auth, { type: 'oauth1' }>,
  context: SignContext,
): Promise<PreparedRequest> {
  const oauth: [string, string][] = [
    ['oauth_consumer_key', auth.consumerKey],
    ...(auth.token ? [['oauth_token', auth.token] as [string, string]] : []),
    ['oauth_signature_method', auth.signatureMethod],
    ['oauth_timestamp', String(Math.floor(context.now.getTime() / 1000))],
    ['oauth_nonce', context.nonce(11)],
    ['oauth_version', '1.0'],
  ];
  const key = `${rfc3986(auth.consumerSecret)}&${rfc3986(auth.tokenSecret)}`;
  let signature: string;
  if (auth.signatureMethod === 'PLAINTEXT') {
    signature = key;
  } else {
    const params: [string, string][] = [...url.searchParams, ...oauth];
    // A form body's fields are part of the signature too.
    if (/x-www-form-urlencoded/i.test(headerValue(prepared, 'content-type') ?? '') && prepared.bodyText) {
      params.push(...new URLSearchParams(prepared.bodyText));
    }
    const normalized = params
      .map(([k, v]) => [rfc3986(k), rfc3986(v)])
      .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const base = [prepared.method.toUpperCase(), rfc3986(`${url.protocol}//${url.host.toLowerCase()}${url.pathname}`), rfc3986(normalized)].join('&');
    const hash: Hash = auth.signatureMethod === 'HMAC-SHA1' ? 'SHA-1' : auth.signatureMethod === 'HMAC-SHA256' ? 'SHA-256' : 'SHA-512';
    signature = base64(await hmac(hash, key, base));
  }
  const all: [string, string][] = [...oauth, ['oauth_signature', signature]];
  if (auth.addTo === 'query') return withQuery(prepared, all);
  const header = [...(auth.realm ? [`realm="${auth.realm}"`] : []), ...all.map(([k, v]) => `${k}="${rfc3986(v)}"`)].join(', ');
  return withHeader(prepared, 'Authorization', `OAuth ${header}`);
}

// Hawk

export async function hawkHeader(
  prepared: PreparedRequest,
  url: URL,
  auth: Extract<Auth, { type: 'hawk' }>,
  context: SignContext,
): Promise<string> {
  if (!auth.authId || !auth.authKey) throw new AuthError('Hawk needs an auth ID and an auth key.');
  const hash: Hash = auth.algorithm === 'sha1' ? 'SHA-1' : 'SHA-256';
  const ts = String(Math.floor(context.now.getTime() / 1000));
  const nonce = context.nonce(6);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  let payloadHash = '';
  if (auth.includePayloadHash) {
    const type = (headerValue(prepared, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
    payloadHash = base64(await digest(hash, `hawk.1.payload\n${type}\n${prepared.bodyText ?? ''}\n`));
  }
  const normalized =
    ['hawk.1.header', ts, nonce, prepared.method.toUpperCase(), url.pathname + url.search, url.hostname.toLowerCase(), port, payloadHash, auth.ext].join('\n') +
    '\n' +
    (auth.app ? `${auth.app}\n${auth.dlg}\n` : '');
  const mac = base64(await hmac(hash, auth.authKey, normalized));
  const parts = [
    `id="${auth.authId}"`,
    `ts="${ts}"`,
    `nonce="${nonce}"`,
    ...(payloadHash ? [`hash="${payloadHash}"`] : []),
    ...(auth.ext ? [`ext="${auth.ext}"`] : []),
    `mac="${mac}"`,
    ...(auth.app ? [`app="${auth.app}"`, ...(auth.dlg ? [`dlg="${auth.dlg}"`] : [])] : []),
  ];
  return `Hawk ${parts.join(', ')}`;
}

// AWS Signature Version 4

export async function awsSign(
  prepared: PreparedRequest,
  url: URL,
  auth: Extract<Auth, { type: 'aws' }>,
  context: SignContext,
): Promise<PreparedRequest> {
  if (!auth.accessKey || !auth.secretKey) throw new AuthError('AWS Signature needs an access key and a secret key.');
  const amzDate = context.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = auth.service || 'execute-api';
  const region = auth.region || 'us-east-1';
  const s3 = service === 's3';

  // A binary body is a file, so its bytes are hashed; form-data is left unsigned, as AWS has no rule for it.
  const payload = prepared.body instanceof Blob ? new Uint8Array(await prepared.body.arrayBuffer()) : (prepared.bodyText ?? '');
  const payloadHash = hex(await digest('SHA-256', payload));
  let signed = withHeader(prepared, 'X-Amz-Date', amzDate);
  if (auth.sessionToken) signed = withHeader(signed, 'X-Amz-Security-Token', auth.sessionToken);
  if (s3) signed = withHeader(signed, 'X-Amz-Content-Sha256', payloadHash);

  // S3 paths are encoded once; other services twice, as AWS's own SDKs do.
  const encodeSegment = (segment: string) => {
    const once = rfc3986(safeDecode(segment));
    return s3 ? once : rfc3986(once);
  };
  const canonicalUri = url.pathname.split('/').map(encodeSegment).join('/') || '/';
  const canonicalQuery = [...url.searchParams]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const headers = new Map<string, string>([['host', url.host]]);
  for (const [name, value] of signed.headers) {
    const lower = name.toLowerCase();
    if (lower.startsWith('x-amz-') || lower === 'content-type') headers.set(lower, value.trim().replace(/\s+/g, ' '));
  }
  const names = [...headers.keys()].sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers.get(name)}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [signed.method.toUpperCase(), canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(await digest('SHA-256', canonicalRequest))].join('\n');
  let key: Uint8Array = await hmac('SHA-256', `AWS4${auth.secretKey}`, dateStamp);
  key = await hmac('SHA-256', key, region);
  key = await hmac('SHA-256', key, service);
  key = await hmac('SHA-256', key, 'aws4_request');
  const signature = hex(await hmac('SHA-256', key, stringToSign));
  return withHeader(
    signed,
    'Authorization',
    `AWS4-HMAC-SHA256 Credential=${auth.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// Akamai EdgeGrid

/** Bodies are hashed up to this many bytes, as Akamai's own clients do. */
const EDGEGRID_MAX_BODY = 131072;

export async function edgegridHeader(
  prepared: PreparedRequest,
  url: URL,
  auth: Extract<Auth, { type: 'edgegrid' }>,
  context: SignContext,
): Promise<string> {
  if (!auth.clientToken || !auth.accessToken || !auth.clientSecret) {
    throw new AuthError('Akamai EdgeGrid needs the client token, access token and client secret from your .edgerc file.');
  }
  const iso = context.now.toISOString();
  const timestamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 19)}+0000`;
  const nonce = crypto.randomUUID();
  const prefix = `EG1-HMAC-SHA256 client_token=${auth.clientToken};access_token=${auth.accessToken};timestamp=${timestamp};nonce=${nonce};`;
  const signingKey = base64(await hmac('SHA-256', auth.clientSecret, timestamp));
  const canonicalHeaders = auth.headersToSign
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const value = headerValue(prepared, name);
      return value === undefined ? null : `${name.toLowerCase()}:${value.trim().replace(/\s+/g, ' ')}`;
    })
    .filter((line): line is string => line !== null)
    .join('\t');
  const body = prepared.method.toUpperCase() === 'POST' && prepared.bodyText ? bytesOf(prepared.bodyText).slice(0, EDGEGRID_MAX_BODY) : null;
  const contentHash = body ? base64(await digest('SHA-256', body)) : '';
  const data = [prepared.method.toUpperCase(), url.protocol.replace(':', ''), url.host, url.pathname + url.search, canonicalHeaders, contentHash, prefix].join('\t');
  const signature = base64(await hmac('SHA-256', signingKey, data));
  return `${prefix}signature=${signature}`;
}
