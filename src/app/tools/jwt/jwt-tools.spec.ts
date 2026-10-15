import { createSampleToken } from './jwt-sample';
import {
  base64UrlDecode,
  base64UrlEncode,
  cleanToken,
  decodeJwt,
  relativeTime,
  timeClaims,
  tokenTiming,
} from './jwt-tools';

const make = (header: object | string, payload: object | string, signature = 'c2ln') =>
  [header, payload]
    .map((part) => base64UrlEncode(typeof part === 'string' ? part : JSON.stringify(part)))
    .concat(signature)
    .join('.');

const NOW = new Date('2026-10-15T12:00:00Z');
const nowSeconds = NOW.getTime() / 1000;

describe('base64Url', () => {
  it('round-trips UTF-8 text without padding', () => {
    const encoded = base64UrlEncode('{"name":"José ✓"}');
    expect(encoded).not.toContain('=');
    expect(base64UrlDecode(encoded)).toBe('{"name":"José ✓"}');
  });

  it('accepts standard Base64 and padding too', () => {
    expect(base64UrlDecode('aGk=')).toBe('hi');
    expect(base64UrlDecode('aGk')).toBe('hi');
  });

  it('rejects text that is not Base64URL', () => {
    expect(base64UrlDecode('a$b')).toBeNull();
    expect(base64UrlDecode('abcde')).toBeNull();
  });
});

describe('cleanToken', () => {
  it('strips a Bearer prefix and whitespace', () => {
    expect(cleanToken('  Bearer aaa.\n bbb.ccc ')).toBe('aaa.bbb.ccc');
  });
});

describe('decodeJwt', () => {
  it('decodes header and payload, keeping numbers exactly as written', () => {
    const token = make({ alg: 'HS256', typ: 'JWT' }, '{"sub":"42","id":12345678901234567890}');
    const result = decodeJwt(token);
    if (!result.ok) throw new Error(result.message);
    expect(result.jwt.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(result.jwt.payload['sub']).toBe('42');
    expect(result.jwt.headerText).toBe('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
    expect(result.jwt.payloadText).toContain('"id": 12345678901234567890');
    expect(result.jwt.parts.signature).toBe('c2ln');
  });

  it('accepts a token with an empty signature', () => {
    expect(decodeJwt(make({ alg: 'none' }, { a: 1 }, '')).ok).toBe(true);
  });

  const messageOf = (input: string) => {
    const result = decodeJwt(input);
    return result.ok ? 'decoded' : result.message;
  };

  it('explains why a token cannot be decoded', () => {
    expect(messageOf('   ')).toBe('Paste a JWT to decode it.');
    expect(messageOf('abc.def')).toContain('This text has 2.');
    expect(messageOf('a.b.c.d.e')).toContain('encrypted token (JWE');
    expect(messageOf('$$$.e30.sig')).toBe('The header is not valid Base64URL text.');
    expect(messageOf(make('not json', {}))).toBe('The header decodes, but it is not JSON.');
    expect(messageOf(make({ alg: 'HS256' }, '[1,2]'))).toBe('The payload must be a JSON object.');
    expect(messageOf(make({ alg: 'HS256' }, {}, 'bad+sig'))).toBe('The signature is not valid Base64URL.');
  });
});

describe('time claims', () => {
  it('turns iat, nbf and exp into dates with relative times', () => {
    const claims = timeClaims({ iat: nowSeconds - 3600, nbf: nowSeconds - 3600, exp: nowSeconds + 7200, sub: 'x' }, NOW);
    expect(claims.map((c) => [c.name, c.label, c.relative])).toEqual([
      ['iat', 'Issued at', '1 hour ago'],
      ['nbf', 'Not valid before', '1 hour ago'],
      ['exp', 'Expires', 'in 2 hours'],
    ]);
    expect(claims[2].date.toISOString()).toBe('2026-10-15T14:00:00.000Z');
  });

  it('ignores time claims that are not numbers', () => {
    expect(timeClaims({ exp: '2026-10-15' }, NOW)).toEqual([]);
  });

  it('describes distances in the largest sensible unit', () => {
    expect(relativeTime(new Date(NOW.getTime() + 30_000), NOW)).toBe('in 30 seconds');
    expect(relativeTime(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe('3 days ago');
    expect(relativeTime(NOW, NOW)).toBe('now');
  });
});

describe('tokenTiming', () => {
  it('reports expired, not yet valid, active and no expiry', () => {
    expect(tokenTiming({ exp: nowSeconds - 1 }, NOW)).toBe('expired');
    expect(tokenTiming({ exp: nowSeconds }, NOW)).toBe('expired');
    expect(tokenTiming({ nbf: nowSeconds + 60, exp: nowSeconds + 120 }, NOW)).toBe('not-yet-valid');
    expect(tokenTiming({ exp: nowSeconds + 60 }, NOW)).toBe('active');
    expect(tokenTiming({ sub: 'x' }, NOW)).toBe('no-expiry');
  });
});

describe('createSampleToken', () => {
  it('makes a decodable HS256 token that is active now', async () => {
    const token = await createSampleToken(NOW);
    const result = decodeJwt(token);
    if (!result.ok) throw new Error(result.message);
    expect(result.jwt.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(tokenTiming(result.jwt.payload, NOW)).toBe('active');
    expect(result.jwt.parts.signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
