import { generateKeyPair, jwkToPem, pemToJwk, thumbprint } from './keys';

describe('keys', () => {
  it('computes the RFC 7638 example thumbprint', async () => {
    const jwk = {
      kty: 'RSA',
      e: 'AQAB',
      n:
        '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
    };
    expect(await thumbprint(jwk)).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
  });

  it('generates RSA and EC key pairs with matching kid', async () => {
    const rsa = await generateKeyPair('RS256', 2048);
    expect(rsa.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(rsa.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(rsa.publicJwk).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: rsa.kid });
    expect(JSON.parse(rsa.jwks).keys[0].kid).toBe(rsa.kid);
    const ec = await generateKeyPair('ES256');
    expect(ec.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' });
  });

  it('converts PEM to JWK and back', async () => {
    const pair = await generateKeyPair('ES384');
    const jwk = await pemToJwk(pair.publicPem);
    expect(jwk).toMatchObject({ ok: true, kind: 'Public EC P-384 key' });
    if (!jwk.ok) return;
    expect(JSON.parse(jwk.text).kid).toBe(pair.kid);
    const pem = await jwkToPem(jwk.text);
    expect(pem.ok && pem.text).toBe(pair.publicPem);
    const priv = await pemToJwk(pair.privatePem);
    expect(priv.ok && JSON.parse(priv.text).d).toBeTruthy();
  });

  it('explains keys it cannot read', async () => {
    expect(await pemToJwk('hello')).toMatchObject({ ok: false });
    expect(await pemToJwk('-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----')).toMatchObject({ ok: false, error: expect.stringContaining('openssl pkcs8') });
    expect(await jwkToPem('{"kty":"oct","k":"abc"}')).toMatchObject({ ok: false });
  });
});
