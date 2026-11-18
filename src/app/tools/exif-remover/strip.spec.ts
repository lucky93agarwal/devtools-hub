import { jpegOrientation, stripJpeg, stripPng, stripWebp } from './strip';

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

function jpegWith(orientation: number): Uint8Array {
  const tiff = [...text('II'), 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const app1 = [...text('Exif\0\0'), ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0, 7, ...text('JFIF\0'),
    0xff, 0xe1, len >> 8, len & 255, ...app1,
    0xff, 0xfe, 0, 5, ...text('hey'),
    0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
  ]);
}

describe('metadata stripping', () => {
  it('removes EXIF and comments from a JPEG and keeps the image data', () => {
    const input = jpegWith(1);
    const { bytes, removed } = stripJpeg(input);
    expect(removed).toEqual(['EXIF', 'Comment']);
    expect(String.fromCharCode(...bytes)).not.toContain('Exif');
    expect(String.fromCharCode(...bytes)).toContain('JFIF');
    // The scan data and end marker are copied unchanged.
    expect([...bytes.slice(-9)]).toEqual([...input.slice(-9)]);
  });

  it('reads the JPEG orientation', () => {
    expect(jpegOrientation(jpegWith(6))).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
  });

  it('removes text and EXIF chunks from a PNG', () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...text(type), ...data, 0, 0, 0, 0];
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', Array(13).fill(0)), ...chunk('tEXt', text('a\0b')), ...chunk('eXIf', [1]), ...chunk('IEND', [])]);
    const { bytes, removed } = stripPng(png);
    expect(removed).toEqual(['Text', 'EXIF']);
    const out = String.fromCharCode(...bytes);
    expect(out).toContain('IHDR');
    expect(out).toContain('IEND');
    expect(out).not.toContain('tEXt');
  });

  it('removes EXIF from an extended WebP and clears its flag', () => {
    const chunk = (id: string, data: number[]) => [...text(id), data.length, 0, 0, 0, ...data, ...(data.length % 2 ? [0] : [])];
    const body = [...chunk('VP8X', [0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...chunk('VP8 ', [1, 2]), ...chunk('EXIF', [9, 9, 9])];
    const webp = new Uint8Array([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...body]);
    const { bytes, removed } = stripWebp(webp);
    expect(removed).toEqual(['EXIF']);
    expect(String.fromCharCode(...bytes)).not.toContain('EXIF');
    expect(bytes[20] & 0x08).toBe(0);
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
  });
});
