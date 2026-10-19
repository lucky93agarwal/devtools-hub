import { defaultFormat, hexDump, previewDocument, previewKind, toBase64 } from './response-format';

describe('response formats', () => {
  it('opens each content type in its format', () => {
    expect(defaultFormat('application/json; charset=utf-8', true)).toBe('json');
    expect(defaultFormat('application/problem+json', true)).toBe('json');
    expect(defaultFormat('text/html', true)).toBe('html');
    expect(defaultFormat('application/xml', true)).toBe('xml');
    expect(defaultFormat('application/yaml', true)).toBe('yaml');
    expect(defaultFormat('text/javascript', true)).toBe('javascript');
    expect(defaultFormat('text/markdown', true)).toBe('markdown');
    expect(defaultFormat('text/plain', true)).toBe('raw');
    expect(defaultFormat('application/octet-stream', false)).toBe('hex');
  });

  it('knows what Preview can show', () => {
    expect(previewKind('image/png', false)).toBe('image');
    expect(previewKind('application/pdf', false)).toBe('pdf');
    expect(previewKind('video/mp4', false)).toBe('video');
    expect(previewKind('audio/mpeg', false)).toBe('audio');
    expect(previewKind('text/html', true)).toBe('html');
    expect(previewKind('application/json', true)).toBe('text');
    expect(previewKind('application/zip', false)).toBe('none');
  });

  it('prints bytes as a hex dump with an ASCII column', () => {
    const bytes = new TextEncoder().encode('Hello, world!\n\u0000ABC');
    expect(hexDump(bytes)).toBe(
      '00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a 00 41  |Hello, world!..A|\n' +
        '00000010  42 43                                             |BC|',
    );
    expect(hexDump(new Uint8Array(40), 16)).toContain('… 24 more bytes not shown');
  });

  it('encodes Base64, cutting very large bodies', () => {
    expect(toBase64(new TextEncoder().encode('hi there'))).toBe('aGkgdGhlcmU=');
    expect(toBase64(new Uint8Array(10), 3)).toBe('AAAA\n\n… cut at 3 bytes. Download the response to get all of it.');
  });

  it('points relative links in an HTML preview at the API', () => {
    expect(previewDocument('<html><head><title>x</title></head></html>', 'https://x.dev/a?b="c"')).toBe(
      '<html><head><base href="https://x.dev/a?b=&quot;c&quot;" target="_blank"><title>x</title></head></html>',
    );
    expect(previewDocument('<p>hi</p>', 'https://x.dev/')).toBe('<base href="https://x.dev/" target="_blank"><p>hi</p>');
  });
});
