import { crc32, indexedPngBytes, savedPercent } from './png-writer';

describe('png writer', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  it('writes a valid palette PNG with transparency', async () => {
    const index = new Uint8Array([0, 1, 1, 0]);
    const bytes = await indexedPngBytes(2, 2, index, [
      [255, 0, 0, 0],
      [0, 0, 255, 255],
    ]);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const text = String.fromCharCode(...bytes);
    expect(text).toContain('IHDR');
    expect(text).toContain('PLTE');
    expect(text).toContain('tRNS');
    expect(text.indexOf('IDAT')).toBeGreaterThan(text.indexOf('tRNS'));
    expect(text.endsWith('IEND\xaeB`\x82')).toBe(true);
    // Colour type 3 (palette), 8 bits.
    expect(bytes[24]).toBe(8);
    expect(bytes[25]).toBe(3);
  });

  it('leaves out tRNS when every colour is opaque', async () => {
    const bytes = await indexedPngBytes(1, 1, new Uint8Array([0]), [[1, 2, 3]]);
    expect(String.fromCharCode(...bytes)).not.toContain('tRNS');
  });

  it('reports the saving', () => {
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1100)).toBe(-10);
  });
});
