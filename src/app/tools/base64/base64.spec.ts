import { bytesToText, decodeBase64, sniffMime, textToBase64, wrapLines } from './base64';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('base64', () => {
  it('encodes UTF-8 text, also as Base64URL without padding', () => {
    expect(textToBase64('héllo ✓')).toBe('aMOpbGxvIOKckw==');
    expect(textToBase64('héllo ✓', true)).toBe('aMOpbGxvIOKckw');
    expect(textToBase64('??>')).toBe('Pz8+');
    expect(textToBase64('??>', true)).toBe('Pz8-');
  });

  it('decodes standard, URL-safe, unpadded and wrapped input', () => {
    for (const input of ['aMOpbGxvIOKckw==', 'aMOpbGxvIOKckw', ' aMOpbGxv\nIOKckw== ']) {
      const result = decodeBase64(input);
      expect(result.ok && bytesToText(result.bytes)).toBe('héllo ✓');
    }
    const url = decodeBase64('Pz8-');
    expect(url.ok && bytesToText(url.bytes)).toBe('??>');
  });

  it('reads the type from a data URI or from the bytes', () => {
    const uri = decodeBase64('data:text/plain;charset=utf-8;base64,aGk=');
    expect(uri.ok && uri.mime).toBe('text/plain');
    const png = decodeBase64('iVBORw0KGgo=');
    expect(png.ok && png.mime).toBe('image/png');
    expect(sniffMime(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBe('image/svg+xml');
  });

  it('points at the first character that is not Base64', () => {
    expect(decodeBase64('abc$def')).toEqual({ ok: false, error: '“$” at position 4 is not a Base64 character.' });
    expect(decodeBase64('ab=c')).toMatchObject({ ok: false, error: 'Padding (=) can only appear at the end.' });
    expect(decodeBase64('abcde')).toMatchObject({ ok: false });
  });

  it('tells text from binary data', () => {
    expect(bytesToText(bytes(0x68, 0x69, 0x0a))).toBe('hi\n');
    expect(bytesToText(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(bytesToText(bytes(0x00, 0x01))).toBeNull();
  });

  it('wraps long Base64 at 76 characters', () => {
    const wrapped = wrapLines('A'.repeat(160));
    expect(wrapped.split('\n').map((l) => l.length)).toEqual([76, 76, 8]);
  });
});
