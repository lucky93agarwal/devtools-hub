import { decodeJwt } from './jwt-tools';
import { SIGNING_ALGORITHMS, generateKeyPair, randomSecret, setClaim, signJwt } from './jwt-sign';
import { keyKind, verifySignature } from './jwt-verify';

/** Signs, then checks the result with the same decoder and verifier the page uses. */
async function roundTrip(token: string, key: string, secretIsBase64 = false) {
  const decoded = decodeJwt(token);
  if (!decoded.ok) throw new Error(decoded.message);
  const { header, payload, parts } = decoded.jwt;
  const check = await verifySignature({
    alg: header['alg'] as string,
    signingInput: `${parts.header}.${parts.payload}`,
    signature: parts.signature,
    key,
    secretIsBase64,
  });
  return { header, payload, payloadText: decoded.jwt.payloadText, status: check.status };
}

const SECRET = 'test-secret-that-is-long-enough-for-hs256';

describe('signJwt with a secret', () => {
  it('makes a token that decodes and verifies', async () => {
    const result = await signJwt('HS256', '{"typ": "JWT"}', '{"sub": "user-1"}', {
      kind: 'secret',
      text: SECRET,
      isBase64: false,
    });
    if (!result.ok) throw new Error(result.message);
    const check = await roundTrip(result.token, SECRET);
    expect(check.header).toEqual({ typ: 'JWT', alg: 'HS256' });
    expect(check.payload).toEqual({ sub: 'user-1' });
    expect(check.status).toBe('valid');
    expect((await roundTrip(result.token, 'another-secret-also-long-enough-xx')).status).toBe('invalid');
  });

  it('sets alg from the chosen algorithm, whatever the header says', async () => {
    const result = await signJwt('HS512', '{"alg": "none", "kid": "k1"}', '{}', { kind: 'secret', text: SECRET, isBase64: false });
    if (!result.ok) throw new Error(result.message);
    expect((await roundTrip(result.token, SECRET)).header).toEqual({ alg: 'HS512', kid: 'k1' });
  });

  it('keeps payload numbers and key order exactly as typed', async () => {
    const result = await signJwt('HS256', '{}', '{"z": 1.0, "id": 12345678901234567890, "a": "\\u00e9"}', {
      kind: 'secret',
      text: SECRET,
      isBase64: false,
    });
    if (!result.ok) throw new Error(result.message);
    expect((await roundTrip(result.token, SECRET)).payloadText).toBe(
      '{\n  "z": 1.0,\n  "id": 12345678901234567890,\n  "a": "\\u00e9"\n}',
    );
  });

  it('uses a Base64 secret when asked', async () => {
    const secret = randomSecret('HS256');
    const result = await signJwt('HS256', '{}', '{}', { kind: 'secret', text: secret, isBase64: true });
    if (!result.ok) throw new Error(result.message);
    expect((await roundTrip(result.token, secret, true)).status).toBe('valid');
    expect((await roundTrip(result.token, secret, false)).status).toBe('invalid');
  });

  it('explains bad input', async () => {
    const secret = { kind: 'secret' as const, text: SECRET, isBase64: false };
    const message = async (header: string, payload: string, key = secret) => {
      const result = await signJwt('HS256', header, payload, key);
      return result.ok ? 'ok' : result.message;
    };
    expect(await message('{"typ": "JWT",}', '{}')).toBe(
      'Header is not valid JSON. Line 1, column 15: Trailing comma is not allowed before }.',
    );
    expect(await message('[]', '{}')).toContain('Header must be a JSON object');
    expect(await message('{}', '{"a": 1\n"b": 2}')).toBe(
      `Payload is not valid JSON. Line 2, column 1: Missing comma. Add ',' before '"'.`,
    );
    expect(await message('{}', '"just text"')).toContain('Payload must be a JSON object');
    expect(await message('{}', '{}', { ...secret, text: '' })).toBe('Enter a secret, or generate a random one.');
  });
});

describe('signJwt with a key pair', () => {
  for (const alg of ['RS256', 'PS256', 'ES256', 'ES384'] as const) {
    it(`makes a ${alg} token that verifies with the public key`, async () => {
      const pair = await generateKeyPair(alg);
      const result = await signJwt(alg, '{"typ": "JWT"}', '{"sub": "x"}', { kind: 'pair', privateKey: pair.privateKey });
      if (!result.ok) throw new Error(result.message);
      expect((await roundTrip(result.token, pair.publicPem)).status).toBe('valid');
      expect((await roundTrip(result.token, JSON.stringify(pair.publicJwk))).status).toBe('valid');
    });
  }

  it('refuses to mix a secret algorithm with a key pair', async () => {
    const pair = await generateKeyPair('ES256');
    const result = await signJwt('HS256', '{}', '{}', { kind: 'pair', privateKey: pair.privateKey });
    expect(result).toEqual({ ok: false, message: 'HS256 uses a shared secret, not a key pair.' });
  });

  it('only offers algorithms the verifier can check', () => {
    for (const alg of SIGNING_ALGORITHMS) expect(keyKind(alg), alg).not.toBeNull();
  });
});

describe('randomSecret', () => {
  it('is long enough for the algorithm and different each time', () => {
    expect(randomSecret('HS256')).toHaveLength(43); // 32 bytes as Base64URL
    expect(randomSecret('HS512')).toHaveLength(86); // 64 bytes
    expect(randomSecret('HS256')).not.toBe(randomSecret('HS256'));
  });
});

describe('setClaim', () => {
  it('changes one claim and leaves the rest as typed', () => {
    expect(setClaim('{"sub": "x", "exp": 1, "id": 12345678901234567890}', 'exp', 99)).toBe(
      '{\n  "sub": "x",\n  "exp": 99,\n  "id": 12345678901234567890\n}',
    );
  });

  it('adds a missing claim at the end and removes one with null', () => {
    expect(setClaim('{"sub": "x"}', 'iat', 5)).toBe('{\n  "sub": "x",\n  "iat": 5\n}');
    expect(setClaim('{"sub": "x", "exp": 1}', 'exp', null)).toBe('{\n  "sub": "x"\n}');
  });

  it('gives up on text that is not a JSON object', () => {
    expect(setClaim('{"a": ', 'exp', 1)).toBeNull();
    expect(setClaim('[1]', 'exp', 1)).toBeNull();
  });
});
