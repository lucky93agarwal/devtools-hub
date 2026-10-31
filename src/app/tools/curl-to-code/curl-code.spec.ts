import { curlToCode } from './curl-code';

const CURL = `curl 'https://api.example.com/v1/orders?limit=5' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: session=abc' \\
  --data-raw '{"item":"pen","qty":2}'`;

describe('curl-code', () => {
  it('turns a multi-line cURL command into Python and keeps the Cookie header', () => {
    const result = curlToCode(CURL, 'python-requests');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('POST https://api.example.com/v1/orders?limit=5 with 2 headers and a body');
    expect(result.code).toContain('import requests');
    expect(result.code).toContain('https://api.example.com/v1/orders?limit=5');
    expect(result.code).toContain('Cookie');
    expect(result.code).toContain('pen');
    expect(result.code).toContain('requests.request("POST"');
  });

  it('writes JavaScript fetch and Go', () => {
    const fetch = curlToCode('curl https://example.com/users -H "Accept: application/json"', 'js-fetch');
    expect(fetch.ok && fetch.code).toContain('fetch("https://example.com/users"');
    const go = curlToCode('curl https://example.com/users', 'go');
    expect(go.ok && go.code).toContain('http.NewRequest');
  });

  it('explains commands it cannot read', () => {
    expect(curlToCode('wget https://x.dev', 'go')).toEqual({ ok: false, error: 'Paste a command that starts with curl.' });
    expect(curlToCode("curl 'https://x.dev", 'go')).toEqual({ ok: false, error: 'A quote in the command is never closed.' });
    expect(curlToCode('', 'go')).toEqual({ ok: false, error: '' });
  });
});
