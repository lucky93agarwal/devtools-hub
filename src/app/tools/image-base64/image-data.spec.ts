import { extensionFor, parseImageText, sniffImageType, snippets, toBase64 } from './image-data';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0]);

describe('image data', () => {
  it('detects image types from their bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('\0\0\0\x1cftypavif'))).toBe('image/avif');
    expect(sniffImageType(new TextEncoder().encode('\0\0\0\x18ftypheic'))).toBe('image/heic');
    expect(sniffImageType(new TextEncoder().encode('<?xml version="1.0"?><svg></svg>'))).toBe('image/svg+xml');
    expect(sniffImageType(new TextEncoder().encode('hello'))).toBeNull();
  });

  it('reads plain Base64, data URIs, CSS url() and URL-safe Base64', () => {
    const b64 = toBase64(PNG);
    for (const text of [b64, `data:image/png;base64,${b64}`, `url("data:image/png;base64,${b64}")`, b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), `${b64.slice(0, 4)}\n${b64.slice(4)}`]) {
      const parsed = parseImageText(text);
      expect(parsed.ok && parsed.type).toBe('image/png');
    }
  });

  it('reads URL-encoded SVG data URIs', () => {
    const parsed = parseImageText(`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`);
    expect(parsed.ok && parsed.type).toBe('image/svg+xml');
  });

  it('explains bad input', () => {
    expect(parseImageText('not base64 !!')).toEqual({ ok: false, message: 'This is not valid Base64.' });
    expect(parseImageText(btoa('hello world'))).toEqual({ ok: false, message: 'The decoded data is not an image this tool recognises.' });
  });

  it('makes snippets and extensions', () => {
    const list = snippets('data:image/png;base64,AAAA', 'logo.png');
    expect(list.map((s) => s.label)).toEqual(['Data URI', 'Base64 only', 'HTML <img>', 'CSS background', 'Markdown']);
    expect(list[1].text).toBe('AAAA');
    expect(list[2].text).toBe('<img src="data:image/png;base64,AAAA" alt="logo">');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/webp')).toBe('webp');
  });
});
