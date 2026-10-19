import { verifySignature } from '../jwt/jwt-verify';
import { decodeJwt } from '../jwt/jwt-tools';
import { Auth, defaultAuth } from './auth';
import { PreparedRequest, mergeUrlParams, prepareRequest } from './build';
import { fromBulk, toBulk } from './kv-table';
import { md5 } from './md5';
import { newRequest } from './model';
import { exportPostman, importPostman } from './postman';
import { AuthError, SignContext, signRequest } from './sign';
import { inheritedAuth } from './store';

const prepared = (changes: Partial<PreparedRequest>): PreparedRequest => ({
  method: 'GET',
  url: 'https://example.com/',
  headers: [],
  body: null,
  bodyText: null,
  formFields: [],
  dropped: [],
  unresolved: [],
  ...changes,
});

const context = (iso: string, nonce: string): SignContext => ({ now: new Date(iso), nonce: () => nonce });
const header = (p: PreparedRequest, name: string) => p.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

describe('md5', () => {
  it('matches the standard examples', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(md5('é'.repeat(100))).toHaveLength(32);
  });
});

describe('Digest auth', () => {
  it('matches the RFC 2617 example', async () => {
    const auth: Auth = {
      ...(defaultAuth('digest') as Extract<Auth, { type: 'digest' }>),
      username: 'Mufasa',
      password: 'Circle Of Life',
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      clientNonce: '0a4f113b',
      opaque: '5ccc069c403ebaf9f0171e9517f40e41',
    };
    const signed = await signRequest(prepared({ url: 'http://www.nowhere.org/dir/index.html', signWith: auth }));
    expect(header(signed, 'Authorization')).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(header(signed, 'Authorization')).toContain('uri="/dir/index.html"');
  });

  it('matches the RFC 7616 SHA-256 example', async () => {
    const auth: Auth = {
      ...(defaultAuth('digest') as Extract<Auth, { type: 'digest' }>),
      username: 'Mufasa',
      password: 'Circle of Life',
      realm: 'http-auth@example.org',
      nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v',
      clientNonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
      algorithm: 'SHA-256',
    };
    const signed = await signRequest(prepared({ url: 'https://example.org/dir/index.html', signWith: auth }));
    expect(header(signed, 'Authorization')).toContain(
      'response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"',
    );
  });

  it('asks for the realm and nonce', async () => {
    await expect(signRequest(prepared({ signWith: defaultAuth('digest') }))).rejects.toThrow('realm and nonce');
  });
});

describe('OAuth 1.0', () => {
  it('matches the signature in Twitter\'s documented example', async () => {
    const auth: Auth = {
      type: 'oauth1',
      signatureMethod: 'HMAC-SHA1',
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      realm: '',
      addTo: 'header',
    };
    const signed = await signRequest(
      prepared({
        method: 'POST',
        url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        bodyText: 'status=Hello%20Ladies%20%2B%20Gentlemen%2C%20a%20signed%20OAuth%20request%21',
        signWith: auth,
      }),
      context('2011-10-14T20:09:18Z', 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg'),
    );
    expect(header(signed, 'Authorization')).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(header(signed, 'Authorization')).toMatch(/^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
  });

  it('can put the parameters in the query string', async () => {
    const auth = { ...(defaultAuth('oauth1') as Extract<Auth, { type: 'oauth1' }>), consumerKey: 'k', addTo: 'query' as const };
    const signed = await signRequest(prepared({ signWith: auth }), context('2020-01-01T00:00:00Z', 'n'));
    expect(signed.url).toMatch(/\?oauth_consumer_key=k&.*oauth_signature=/);
    expect(header(signed, 'Authorization')).toBeUndefined();
  });
});

describe('Hawk', () => {
  it('matches the example in the Hawk documentation', async () => {
    const auth: Auth = {
      ...(defaultAuth('hawk') as Extract<Auth, { type: 'hawk' }>),
      authId: 'dh37fgj492je',
      authKey: 'werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn',
      ext: 'some-app-ext-data',
    };
    const signed = await signRequest(
      prepared({ url: 'http://example.com:8000/resource/1?b=1&a=2', signWith: auth }),
      context(new Date(1353832234 * 1000).toISOString(), 'j4h3g2'),
    );
    expect(header(signed, 'Authorization')).toBe(
      'Hawk id="dh37fgj492je", ts="1353832234", nonce="j4h3g2", ext="some-app-ext-data", mac="6R4rV5iE+NPoym+WwjeHzjAGXUtLNIxmo1vpMofpLAE="',
    );
  });
});

describe('AWS Signature Version 4', () => {
  it('matches the get-vanilla case from the AWS test suite', async () => {
    const auth: Auth = {
      type: 'aws',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      sessionToken: '',
      region: 'us-east-1',
      service: 'service',
    };
    const signed = await signRequest(prepared({ url: 'https://example.amazonaws.com/', signWith: auth }), context('2015-08-30T12:36:00Z', ''));
    expect(header(signed, 'X-Amz-Date')).toBe('20150830T123600Z');
    expect(header(signed, 'Authorization')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });
});

describe('Akamai EdgeGrid', () => {
  it('writes the EG1 header with a timestamp, nonce and signature', async () => {
    const auth: Auth = { type: 'edgegrid', accessToken: 'akab-access', clientToken: 'akab-client', clientSecret: 'secret', headersToSign: '' };
    const signed = await signRequest(prepared({ url: 'https://host.akamaiapis.net/papi/v1/groups', signWith: auth }), context('2024-03-05T06:07:08Z', ''));
    expect(header(signed, 'Authorization')).toMatch(
      /^EG1-HMAC-SHA256 client_token=akab-client;access_token=akab-access;timestamp=20240305T06:07:08\+0000;nonce=[0-9a-f-]{36};signature=[A-Za-z0-9+/]{43}=$/,
    );
  });
});

describe('JWT Bearer and ASAP', () => {
  it('signs an HS256 token that verifies, as a Bearer header', async () => {
    const auth = { ...(defaultAuth('jwt') as Extract<Auth, { type: 'jwt' }>), secret: 'top-secret', payload: '{"sub":"ada"}' };
    const signed = await signRequest(prepared({ signWith: auth }));
    const token = header(signed, 'Authorization')!.replace(/^Bearer /, '');
    const [head, body, signature] = token.split('.');
    expect(await verifySignature({ alg: 'HS256', signingInput: `${head}.${body}`, signature, key: 'top-secret' })).toEqual({
      status: 'valid',
    });
  });

  it('signs ASAP tokens with a PKCS #8 key, with the right claims', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
    const auth: Auth = {
      type: 'asap',
      algorithm: 'ES256',
      issuer: 'my-service',
      subject: '',
      audience: 'their-service',
      keyId: 'my-service/key-1',
      privateKey: pem,
      claims: '{"scope":"read"}',
      expiresIn: 60,
    };
    const signed = await signRequest(prepared({ signWith: auth }), context('2024-01-01T00:00:00Z', ''));
    const decoded = decodeJwt(header(signed, 'Authorization')!.replace(/^Bearer /, ''));
    if (!decoded.ok) throw new Error(decoded.message);
    expect(decoded.jwt.header).toMatchObject({ alg: 'ES256', kid: 'my-service/key-1' });
    expect(decoded.jwt.payload).toMatchObject({ iss: 'my-service', sub: 'my-service', aud: ['their-service'], iat: 1704067200, exp: 1704067260, scope: 'read' });
  });

  it('explains keys in the older PKCS #1 format', async () => {
    const auth = { ...(defaultAuth('jwt') as Extract<Auth, { type: 'jwt' }>), algorithm: 'RS256' as const, privateKey: '-----BEGIN RSA PRIVATE KEY-----\nabc' };
    await expect(signRequest(prepared({ signWith: auth }))).rejects.toThrow('openssl pkcs8');
  });
});

describe('NTLM and simple auth', () => {
  it('explains that NTLM cannot be sent from a browser', async () => {
    await expect(signRequest(prepared({ signWith: defaultAuth('ntlm') }))).rejects.toBeInstanceOf(AuthError);
  });

  it('applies OAuth 2.0 tokens without signing, and fills variables in auth fields', () => {
    const vars = new Map([['tok', 'abc']]);
    const auth: Auth = { ...(defaultAuth('oauth2') as Extract<Auth, { type: 'oauth2' }>), accessToken: '{{tok}}' };
    const result = prepareRequest(newRequest({ url: 'x.dev', auth }), vars);
    expect(result.headers).toEqual([['Authorization', 'Bearer abc']]);
    expect(result.signWith).toBeUndefined();
    const hawk = prepareRequest(newRequest({ url: 'x.dev', auth: { ...(defaultAuth('hawk') as Extract<Auth, { type: 'hawk' }>), authKey: '{{tok}}' } }), vars);
    expect(hawk.signWith).toMatchObject({ type: 'hawk', authKey: 'abc' });
  });
});

describe('inherited auth', () => {
  it('uses the nearest folder with auth, then the collection', () => {
    const request = newRequest({ auth: { type: 'inherit' } });
    const inner = { id: 'f2', name: 'Inner', requests: [request], folders: [] };
    const outer = { id: 'f1', name: 'Outer', requests: [], folders: [inner], auth: { type: 'bearer' as const, token: 'folder' } };
    const collection = { id: 'c', name: 'API', requests: [], folders: [outer], variables: [], auth: { type: 'basic' as const, username: 'u', password: 'p' } };
    expect(inheritedAuth(collection, request.id)).toEqual({ auth: { type: 'bearer', token: 'folder' }, from: 'Outer' });
    delete (outer as { auth?: unknown }).auth;
    expect(inheritedAuth(collection, request.id)?.from).toBe('API');
  });
});

describe('Postman import and export of every auth type', () => {
  it('round-trips each type with its settings', () => {
    const types = ['basic', 'bearer', 'jwt', 'digest', 'oauth1', 'oauth2', 'hawk', 'aws', 'ntlm', 'api-key', 'edgegrid', 'asap'] as const;
    const requests = types.map((type) => newRequest({ name: type, url: 'https://x.dev', auth: defaultAuth(type) }));
    requests.push(newRequest({ name: 'inherits', auth: { type: 'inherit' } }));
    const collection = { id: 'c', name: 'All', requests, folders: [], variables: [], auth: { type: 'bearer' as const, token: 't' } };
    const back = importPostman(exportPostman(collection));
    expect(back.skipped).toEqual([]);
    expect(back.collection.auth).toEqual({ type: 'bearer', token: 't' });
    expect(back.collection.requests.map((r) => r.auth)).toEqual(requests.map((r) => r.auth));
  });

  it('keeps param descriptions and unticked params', () => {
    const request = newRequest({
      url: 'https://x.dev/a?q=1',
      params: [
        { key: 'q', value: '1', enabled: true, description: 'Search text' },
        { key: 'debug', value: 'true', enabled: false },
      ],
    });
    const back = importPostman(exportPostman({ id: 'c', name: 'P', requests: [request], folders: [], variables: [] }));
    expect(back.collection.requests[0].params).toEqual(request.params);
  });
});

describe('params editing', () => {
  it('keeps descriptions and unticked rows when the URL is edited', () => {
    const previous = [
      { key: 'q', value: 'old', enabled: true, description: 'Search text' },
      { key: 'debug', value: '1', enabled: false },
    ];
    expect(mergeUrlParams('https://x.dev?q=new&page=2', previous)).toEqual([
      { key: 'q', value: 'new', enabled: true, description: 'Search text' },
      { key: 'page', value: '2', enabled: true },
      { key: 'debug', value: '1', enabled: false },
    ]);
  });

  it('writes and reads Bulk Edit text, with // for unticked rows', () => {
    const rows = [
      { key: 'a', value: '1', enabled: true, description: 'first' },
      { key: 'b', value: 'x:y', enabled: false },
    ];
    expect(toBulk(rows)).toBe('a:1\n//b:x:y');
    expect(fromBulk('a:2\n// b:x:y\nc', rows)).toEqual([
      { key: 'a', value: '2', enabled: true, description: 'first' },
      { key: 'b', value: 'x:y', enabled: false },
      { key: 'c', value: '', enabled: true },
    ]);
  });
});
