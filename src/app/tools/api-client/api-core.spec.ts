import { paramsFromUrl, prepareRequest, resolveVariables, urlWithParams, variableMap } from './build';
import { nameFromUrl, parseCurl, shellWords, toCurl, toFetchCode } from './curl';
import { newRequest } from './model';
import { exportPostman, importPostman } from './postman';

const vars = variableMap([{ key: 'base', value: 'https://api.example.com', enabled: true }, { key: 'off', value: 'x', enabled: false }]);

describe('URL params', () => {
  it('reads params, decoding them, and keeps {{variables}}', () => {
    expect(paramsFromUrl('{{base}}/users?q=ada%20l&page=2&flag')).toEqual([
      { key: 'q', value: 'ada l', enabled: true },
      { key: 'page', value: '2', enabled: true },
      { key: 'flag', value: '', enabled: true },
    ]);
    expect(paramsFromUrl('https://x.dev/a')).toEqual([]);
  });

  it('writes params back, leaving out unticked rows and keeping the hash', () => {
    const url = urlWithParams('{{base}}/users?old=1#top', [
      { key: 'q', value: 'a b', enabled: true },
      { key: 'skip', value: '1', enabled: false },
      { key: 'id', value: '{{userId}}', enabled: true },
    ]);
    expect(url).toBe('{{base}}/users?q=a%20b&id={{userId}}#top');
  });
});

describe('variables', () => {
  it('fills known variables and leaves unknown ones', () => {
    expect(resolveVariables('{{base}}/v1/{{ missing }}', vars)).toBe('https://api.example.com/v1/{{ missing }}');
  });

  it('lets later lists win', () => {
    const map = variableMap([{ key: 'a', value: '1', enabled: true }], [{ key: 'a', value: '2', enabled: true }]);
    expect(map.get('a')).toBe('2');
  });
});

describe('prepareRequest', () => {
  it('fills variables, adds https:// and applies bearer auth', () => {
    const prepared = prepareRequest(
      newRequest({ url: 'api.example.com/me?x={{off}}', auth: { type: 'bearer', token: 't0k' } }),
      vars,
    );
    expect(prepared.url).toBe('https://api.example.com/me?x={{off}}');
    expect(prepared.headers).toEqual([['Authorization', 'Bearer t0k']]);
    expect(prepared.unresolved).toEqual(['off']);
  });

  it('builds a JSON body with a content type, and skips it for GET', () => {
    const post = prepareRequest(
      newRequest({ method: 'POST', url: '{{base}}/u', body: { mode: 'json', raw: '{"a":1}', fields: [] } }),
      vars,
    );
    expect(post.body).toBe('{"a":1}');
    expect(post.headers).toContainEqual(['Content-Type', 'application/json']);
    const get = prepareRequest(newRequest({ url: '{{base}}', body: { mode: 'json', raw: '{}', fields: [] } }), vars);
    expect(get.body).toBeNull();
  });

  it('keeps a content type the user set', () => {
    const prepared = prepareRequest(
      newRequest({
        method: 'POST',
        url: 'x.dev',
        headers: [{ key: 'content-type', value: 'application/vnd.api+json', enabled: true }],
        body: { mode: 'json', raw: '{}', fields: [] },
      }),
      vars,
    );
    expect(prepared.headers).toEqual([['content-type', 'application/vnd.api+json']]);
  });

  it('encodes basic auth as UTF-8 and API keys in the query', () => {
    const basic = prepareRequest(newRequest({ url: 'x.dev', auth: { type: 'basic', username: 'ä', password: 'p' } }), vars);
    expect(basic.headers).toEqual([['Authorization', 'Basic w6Q6cA==']]);
    const key = prepareRequest(
      newRequest({ url: 'x.dev/a?b=1', auth: { type: 'api-key', key: 'api_key', value: 'k 1', addTo: 'query' } }),
      vars,
    );
    expect(key.url).toBe('https://x.dev/a?b=1&api_key=k%201');
  });

  it('lists headers the browser will drop instead of sending them', () => {
    const prepared = prepareRequest(
      newRequest({
        url: 'x.dev',
        headers: [
          { key: 'Cookie', value: 'a=1', enabled: true },
          { key: 'X-Trace', value: '1', enabled: true },
          { key: 'X-Off', value: '1', enabled: false },
        ],
      }),
      vars,
    );
    expect(prepared.dropped).toEqual(['Cookie']);
    expect(prepared.headers).toEqual([['X-Trace', '1']]);
  });

  it('sends form fields url-encoded or as multipart', () => {
    const fields = [
      { key: 'a', value: '1 2', enabled: true },
      { key: 'b', value: 'x', enabled: false },
    ];
    const encoded = prepareRequest(newRequest({ method: 'POST', url: 'x.dev', body: { mode: 'urlencoded', raw: '', fields } }), vars);
    expect(encoded.body).toBe('a=1+2');
    const multipart = prepareRequest(newRequest({ method: 'POST', url: 'x.dev', body: { mode: 'form-data', raw: '', fields } }), vars);
    expect(multipart.body).toBeInstanceOf(FormData);
    expect(multipart.formFields).toEqual([['a', '1 2']]);
  });
});

describe('cURL', () => {
  it('splits words like a shell', () => {
    expect(shellWords(`curl -H 'a: "b"' "c \\"d\\"" e\\ f \\\n --x`)).toEqual(['curl', '-H', 'a: "b"', 'c "d"', 'e f', '--x']);
    expect(() => shellWords(`curl 'open`)).toThrow('never closed');
  });

  it('reads a command copied from Chrome', () => {
    const request = parseCurl(
      `curl 'https://api.example.com/v1/users?page=2' \\\n  -H 'accept: application/json' \\\n  -H 'authorization: Bearer abc' \\\n  --data-raw '{"name":"Ada"}' \\\n  --compressed`,
    );
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.example.com/v1/users?page=2');
    expect(request.headers.map((h) => h.key)).toEqual(['accept', 'authorization']);
    expect(request.body).toEqual({ mode: 'json', raw: '{\n  "name": "Ada"\n}', fields: [] });
    expect(request.name).toBe('POST /v1/users');
  });

  it('reads -X, --flag=value, -u, form fields and -G', () => {
    expect(parseCurl(`curl -XPUT --url=https://x.dev/a -u ada:secret`)).toMatchObject({
      method: 'PUT',
      url: 'https://x.dev/a',
      auth: { type: 'basic', username: 'ada', password: 'secret' },
    });
    expect(parseCurl(`curl https://x.dev -F name=ada -F age=36`).body).toEqual({
      mode: 'form-data',
      raw: '',
      fields: [
        { key: 'name', value: 'ada', enabled: true },
        { key: 'age', value: '36', enabled: true },
      ],
    });
    expect(parseCurl(`curl -G https://x.dev/s -d q=a`)).toMatchObject({ method: 'GET', url: 'https://x.dev/s?q=a' });
    expect(parseCurl(`curl https://x.dev -d a=1 -d b=2`).body.fields).toHaveLength(2);
  });

  it('explains what is wrong with a bad command', () => {
    expect(() => parseCurl('wget https://x.dev')).toThrow('starts with curl');
    expect(() => parseCurl('curl -H "a: b"')).toThrow('no URL');
  });

  it('writes cURL and fetch code that round-trip', () => {
    const prepared = prepareRequest(
      newRequest({ method: 'POST', url: 'https://x.dev/it\'s', body: { mode: 'json', raw: '{"a":1}', fields: [] } }),
      vars,
    );
    const curl = toCurl(prepared);
    expect(curl).toBe(
      `curl --request POST 'https://x.dev/it'\\''s' \\\n  --header 'Content-Type: application/json' \\\n  --data-raw '{"a":1}'`,
    );
    const back = parseCurl(curl);
    expect(back.url).toBe("https://x.dev/it's");
    expect(toFetchCode(prepared)).toContain('const response = await fetch("https://x.dev/it\'s", {');
  });

  it('names requests after their path', () => {
    expect(nameFromUrl('https://x.dev/a/b?c=1', 'GET')).toBe('GET /a/b');
    expect(nameFromUrl('{{base}}', 'GET')).toBe('GET {{base}}');
  });
});

describe('Postman collections', () => {
  const postman = {
    info: { name: 'arx-sso', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    variable: [{ key: 'base', value: 'https://sso.example.com' }],
    item: [
      {
        name: 'oauth',
        item: [
          {
            name: 'userinfo',
            request: { method: 'GET', header: [{ key: 'Accept', value: 'application/json' }], url: { raw: '{{base}}/oauth/userinfo' } },
          },
          {
            name: 'token',
            request: {
              method: 'POST',
              auth: { type: 'noauth' },
              url: '{{base}}/oauth/token',
              body: { mode: 'urlencoded', urlencoded: [{ key: 'grant_type', value: 'password' }, { key: 'scope', value: 'x', disabled: true }] },
            },
          },
        ],
      },
      {
        name: 'oauth2 one',
        request: {
          method: 'GET',
          url: 'https://x.dev',
          auth: { type: 'oauth2', oauth2: [{ key: 'grant_type', value: 'authorization_code', type: 'string' }] },
        },
      },
    ],
  };

  it('imports folders, requests, variables and inherited auth', () => {
    const { collection, requests, skipped } = importPostman(JSON.stringify(postman));
    expect(collection.name).toBe('arx-sso');
    expect(requests).toBe(3);
    expect(collection.variables).toEqual([{ key: 'base', value: 'https://sso.example.com', enabled: true }]);
    const [userinfo, token] = collection.folders[0].requests;
    // A request without its own auth inherits the collection's, as in Postman.
    expect(userinfo).toMatchObject({ name: 'userinfo', method: 'GET', url: '{{base}}/oauth/userinfo', auth: { type: 'inherit' } });
    expect(collection.auth).toEqual({ type: 'bearer', token: '{{token}}' });
    expect(token.auth).toEqual({ type: 'none' });
    expect(token.body.fields).toEqual([
      { key: 'grant_type', value: 'password', enabled: true },
      { key: 'scope', value: 'x', enabled: false },
    ]);
    // The browser cannot run the authorization code flow, so the import says so.
    expect(skipped).toEqual(['OAuth 2.0 "authorization_code" token flow']);
  });

  it('reads v2.0 auth written as an object', () => {
    const v20 = { info: { name: 'old' }, item: [{ name: 'r', request: { url: 'x', auth: { type: 'bearer', bearer: { token: 'abc' } } } }] };
    expect(importPostman(JSON.stringify(v20)).collection.requests[0].auth).toEqual({ type: 'bearer', token: 'abc' });
  });

  it('explains files that are not collections', () => {
    expect(() => importPostman('{oops')).toThrow('not valid JSON');
    expect(() => importPostman('{"a":1}')).toThrow('not a Postman collection');
  });

  it('exports v2.1 that imports back the same', () => {
    const { collection } = importPostman(JSON.stringify(postman));
    const again = importPostman(exportPostman(collection)).collection;
    expect(again.folders[0].requests.map((r) => [r.name, r.method, r.url, r.auth.type])).toEqual([
      ['userinfo', 'GET', '{{base}}/oauth/userinfo', 'inherit'],
      ['token', 'POST', '{{base}}/oauth/token', 'none'],
    ]);
    expect(again.auth).toEqual({ type: 'bearer', token: '{{token}}' });
    expect(JSON.parse(exportPostman(collection)).info.schema).toContain('v2.1.0');
  });
});
