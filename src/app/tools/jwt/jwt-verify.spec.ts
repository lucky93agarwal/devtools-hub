import { base64UrlEncode } from './jwt-tools';
import { VerifyInput, keyKind, securityWarnings, verifySignature } from './jwt-verify';

/** Real keys and tokens made with Web Crypto, the same API the page uses. */
const enc = (value: object) => base64UrlEncode(JSON.stringify(value));
const payload = enc({ sub: 'user-1', exp: 4_102_444_800 });

async function hsToken(secret: string | Uint8Array, alg = 'HS256', hash = 'SHA-256') {
  const bytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  const key = await crypto.subtle.importKey('raw', bytes as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash }, false, ['sign']);
  const signingInput = `${enc({ alg, typ: 'JWT' })}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return { signingInput, signature: base64UrlEncode(new Uint8Array(signature)) };
}

const pem = (der: ArrayBuffer) =>
  `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----`;

async function asymmetric(alg: string, generate: RsaHashedKeyGenParams | EcKeyGenParams, sign: AlgorithmIdentifier | RsaPssParams | EcdsaParams) {
  const pair = (await crypto.subtle.generateKey(generate, true, ['sign', 'verify'])) as CryptoKeyPair;
  const signingInput = `${enc({ alg, typ: 'JWT', kid: 'k1' })}.${payload}`;
  const signature = await crypto.subtle.sign(sign, pair.privateKey, new TextEncoder().encode(signingInput));
  return {
    signingInput,
    signature: base64UrlEncode(new Uint8Array(signature)),
    pem: pem(await crypto.subtle.exportKey('spki', pair.publicKey)),
    jwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
  };
}

const rsa = (name: string, hash = 'SHA-256'): RsaHashedKeyGenParams => ({
  name,
  hash,
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
});

const check = (input: Partial<VerifyInput> & Pick<VerifyInput, 'alg' | 'signingInput' | 'signature' | 'key'>) =>
  verifySignature(input);

describe('keyKind', () => {
  it('asks for a secret or a public key depending on the algorithm', () => {
    expect(keyKind('HS256')).toBe('secret');
    expect(keyKind('RS256')).toBe('public-key');
    expect(keyKind('ES512')).toBe('public-key');
    expect(keyKind('none')).toBeNull();
    expect(keyKind('EdDSA')).toBeNull();
  });
});

describe('HS256', () => {
  const secret = 'a-long-random-secret-of-32-bytes!';

  it('accepts the right secret and rejects a wrong one', async () => {
    const token = await hsToken(secret);
    expect(await check({ alg: 'HS256', ...token, key: secret })).toEqual({ status: 'valid' });
    expect(await check({ alg: 'HS256', ...token, key: 'wrong-secret' })).toEqual({ status: 'invalid' });
  });

  it('rejects a token whose payload was changed', async () => {
    const token = await hsToken(secret);
    const tampered = token.signingInput.replace(payload, enc({ sub: 'admin', exp: 4_102_444_800 }));
    expect(await check({ alg: 'HS256', signingInput: tampered, signature: token.signature, key: secret })).toEqual({
      status: 'invalid',
    });
  });

  it('reads a Base64 encoded secret when asked', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const token = await hsToken(raw);
    const key = base64UrlEncode(raw);
    expect(await check({ alg: 'HS256', ...token, key, secretIsBase64: true })).toEqual({ status: 'valid' });
    expect(await check({ alg: 'HS256', ...token, key, secretIsBase64: false })).toEqual({ status: 'invalid' });
  });

  it('works for HS512 too', async () => {
    const token = await hsToken(secret, 'HS512', 'SHA-512');
    expect(await check({ alg: 'HS512', ...token, key: secret })).toEqual({ status: 'valid' });
  });

  it('refuses a public key used as an HMAC secret (algorithm confusion)', async () => {
    const token = await hsToken(secret);
    const result = await check({ alg: 'HS256', ...token, key: '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----' });
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toContain('algorithm confusion');
  });

  it('asks for the secret when it is empty', async () => {
    const token = await hsToken(secret);
    expect(await check({ alg: 'HS256', ...token, key: ' ' })).toEqual({ status: 'error', message: 'Enter the secret.' });
  });
});

describe('RS256, PS256 and ES256', () => {
  it('checks RS256 with a PEM key and with a JWK', async () => {
    const t = await asymmetric('RS256', rsa('RSASSA-PKCS1-v1_5'), { name: 'RSASSA-PKCS1-v1_5' });
    expect(await check({ alg: 'RS256', ...t, key: t.pem })).toEqual({ status: 'valid' });
    expect(await check({ alg: 'RS256', ...t, key: JSON.stringify(t.jwk) })).toEqual({ status: 'valid' });
  });

  it('rejects RS256 signed by a different key', async () => {
    const t = await asymmetric('RS256', rsa('RSASSA-PKCS1-v1_5'), { name: 'RSASSA-PKCS1-v1_5' });
    const other = await asymmetric('RS256', rsa('RSASSA-PKCS1-v1_5'), { name: 'RSASSA-PKCS1-v1_5' });
    expect(await check({ alg: 'RS256', ...t, key: other.pem })).toEqual({ status: 'invalid' });
  });

  it('checks PS256', async () => {
    const t = await asymmetric('PS256', rsa('RSA-PSS'), { name: 'RSA-PSS', saltLength: 32 });
    expect(await check({ alg: 'PS256', ...t, key: t.pem })).toEqual({ status: 'valid' });
  });

  it('checks ES256 and ES384', async () => {
    const es256 = await asymmetric('ES256', { name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' });
    expect(await check({ alg: 'ES256', ...es256, key: es256.pem })).toEqual({ status: 'valid' });
    const es384 = await asymmetric('ES384', { name: 'ECDSA', namedCurve: 'P-384' }, { name: 'ECDSA', hash: 'SHA-384' });
    expect(await check({ alg: 'ES384', ...es384, key: JSON.stringify(es384.jwk) })).toEqual({ status: 'valid' });
  });

  it('picks the key with the token kid from a JWK set', async () => {
    const t = await asymmetric('ES256', { name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' });
    const other = await asymmetric('ES256', { name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' });
    const set = JSON.stringify({ keys: [{ ...other.jwk, kid: 'k0' }, { ...t.jwk, kid: 'k1' }] });
    expect(await check({ alg: 'ES256', ...t, key: set, kid: 'k1' })).toEqual({ status: 'valid' });
    const missing = await check({ alg: 'ES256', ...t, key: set, kid: 'k9' });
    expect(missing.status === 'error' && missing.message).toContain('kid "k9"');
  });

  it('explains keys it cannot use', async () => {
    const t = await asymmetric('ES256', { name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' });
    const message = async (key: string) => {
      const result = await check({ alg: 'ES256', ...t, key });
      return result.status === 'error' ? result.message : result.status;
    };
    expect(await message('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toContain('This is a private key');
    expect(await message('-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----')).toContain('Certificates');
    expect(await message('-----BEGIN RSA PUBLIC KEY-----\nabc\n-----END RSA PUBLIC KEY-----')).toContain('PKCS#1');
    expect(await message('hello')).toContain('PEM format');
    expect(await message('{"kty":"oct","k":"abc"}')).toContain('RSA or EC public key');
    // An RSA key for an ES256 token.
    const rsaKey = await asymmetric('RS256', rsa('RSASSA-PKCS1-v1_5'), { name: 'RSASSA-PKCS1-v1_5' });
    expect(await message(rsaKey.pem)).toContain('could not be used for ES256');
  });

  it('does not support algorithms it does not know', async () => {
    const result = await check({ alg: 'EdDSA', signingInput: 'a.b', signature: 'c2ln', key: 'x' });
    expect(result.status === 'error' && result.message).toContain('not supported');
  });
});

describe('securityWarnings', () => {
  it('warns about short and well-known HS secrets', () => {
    expect(securityWarnings({ alg: 'HS256' }, { text: 'short', isBase64: false })[0]).toContain(
      'This secret is 5 bytes. HS256 should use at least 32 bytes',
    );
    expect(securityWarnings({ alg: 'HS256' }, { text: 'your-256-bit-secret', isBase64: false })[0]).toContain(
      'well-known example',
    );
    expect(securityWarnings({ alg: 'HS256' }, { text: 'x'.repeat(32), isBase64: false })).toEqual([]);
  });

  it('warns about keys that come from inside the token', () => {
    const warnings = securityWarnings({ alg: 'RS256', jku: 'https://evil.example/keys', jwk: {} });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('(jku)');
    expect(warnings[1]).toContain('(jwk)');
  });
});
