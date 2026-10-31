import { buildUrl, decodeText, encodeText, parseUrl } from './url-tools';

describe('url-tools', () => {
  it('encodes a query value or a whole URL', () => {
    expect(encodeText('a b&c=d/é', 'component')).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(encodeText('a b&c', 'component', true)).toBe('a+b%26c');
    expect(encodeText('https://x.dev/a b?q=é&r=1', 'url')).toBe('https://x.dev/a%20b?q=%C3%A9&r=1');
  });

  it('decodes, optionally reading + as a space', () => {
    expect(decodeText('a%20b%26c')).toEqual({ ok: true, text: 'a b&c' });
    expect(decodeText('a+b')).toEqual({ ok: true, text: 'a+b' });
    expect(decodeText('a+b', true)).toEqual({ ok: true, text: 'a b' });
  });

  it('names the broken escape', () => {
    expect(decodeText('100%')).toEqual({ ok: false, error: '“%” is not a valid percent-encoded character.' });
    expect(decodeText('a%E9b')).toEqual({ ok: false, error: '“%E9” is not a valid percent-encoded character.' });
  });

  it('splits a URL into parts and decoded parameters', () => {
    const result = parseUrl('https://ada:pw@api.example.com:8443/v1/users%20list?q=caf%C3%A9&tag=a&tag=b#top');
    expect(result).toEqual({
      ok: true,
      parts: {
        protocol: 'https',
        username: 'ada',
        password: 'pw',
        hostname: 'api.example.com',
        port: '8443',
        pathname: '/v1/users list',
        hash: 'top',
        params: [
          { key: 'q', value: 'café' },
          { key: 'tag', value: 'a' },
          { key: 'tag', value: 'b' },
        ],
      },
    });
  });

  it('reads a URL without a scheme as https and rebuilds it', () => {
    const result = parseUrl('example.com/search?q=a b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.parts.params.push({ key: 'page', value: '2' });
    expect(buildUrl(result.parts)).toBe('https://example.com/search?q=a+b&page=2');
    expect(parseUrl('http://exa mple.com')).toMatchObject({ ok: false });
  });
});
