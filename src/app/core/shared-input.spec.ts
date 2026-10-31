import { decodeShared, encodeShared, readFragment, shareUrl } from './shared-input';

describe('shared-input', () => {
  it('round-trips data through a compact, URL-safe fragment', () => {
    const data = { input: '{"name":"Ada","tags":["a","b"]}'.repeat(20), mode: 'decode', note: 'नमस्ते ✓' };
    const encoded = encodeShared(data);
    expect(encoded).toMatch(/^[\w-]+$/);
    expect(encoded.length).toBeLessThan(JSON.stringify(data).length);
    expect(decodeShared(encoded)).toEqual(data);
  });

  it('builds and reads share links', () => {
    const url = shareUrl('https://devtools24.in', '/base64', { input: 'hi' });
    expect(url).toMatch(/^https:\/\/devtools24\.in\/base64#share=[\w-]+$/);
    expect(readFragment(new URL(url).hash)).toEqual({ input: 'hi' });
  });

  it('ignores anything that is not shared data', () => {
    expect(readFragment('#results')).toBeNull();
    expect(readFragment('#share=not-valid')).toBeNull();
    expect(decodeShared(encodeShared({ a: 'x' }).slice(0, 4))).toBeNull();
  });
});
