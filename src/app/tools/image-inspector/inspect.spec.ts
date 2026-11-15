import { aspectRatio, inspectBytes, readExif } from './inspect';

/** A little-endian TIFF block with Make, Orientation and a GPS position. */
function exifBlock(): Uint8Array {
  const buffer = new ArrayBuffer(200);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x49, 0x49, 0x2a, 0]);
  view.setUint32(4, 8, true);
  // IFD0 at 8: 3 entries.
  view.setUint16(8, 3, true);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  };
  entry(10, 0x010f, 2, 4, 0); // Make "Ace\0" inline
  bytes.set([65, 99, 101, 0], 18);
  entry(22, 0x0112, 3, 1, 6); // Orientation 6
  entry(34, 0x8825, 4, 1, 60); // GPS IFD at 60
  view.setUint32(46, 0, true);
  // GPS IFD at 60: N, lat, E, lon.
  view.setUint16(60, 4, true);
  entry(62, 1, 2, 2, 0);
  bytes.set([78, 0], 70);
  entry(74, 2, 5, 3, 120);
  entry(86, 3, 2, 2, 0);
  bytes.set([69, 0], 94);
  entry(98, 4, 5, 3, 144);
  const rational = (at: number, values: number[]) =>
    values.forEach((v, i) => {
      view.setUint32(at + i * 8, v, true);
      view.setUint32(at + i * 8 + 4, 1, true);
    });
  rational(120, [12, 30, 0]);
  rational(144, [77, 15, 0]);
  return bytes;
}

describe('image inspector', () => {
  it('reads EXIF tags and GPS', () => {
    const { exif, gps } = readExif(exifBlock());
    expect(exif).toEqual([
      { label: 'Camera make', value: 'Ace' },
      { label: 'Orientation', value: 'Rotated 90° clockwise' },
    ]);
    expect(gps).toEqual({ latitude: 12.5, longitude: 77.25 });
  });

  it('reads PNG header details', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
    const result = inspectBytes(png);
    expect(result.type).toBe('image/png');
    expect(result.format).toContainEqual({ label: 'Colour type', value: 'RGBA' });
    expect(result.format).toContainEqual({ label: 'Bit depth', value: '8 bits per channel' });
  });

  it('reads JPEG EXIF and encoding', () => {
    const exif = exifBlock();
    const app1Length = 2 + 6 + exif.length;
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, app1Length >> 8, app1Length & 0xff, ...new TextEncoder().encode('Exif\0\0'), ...exif,
      0xff, 0xc2, 0, 11, 8, 0, 1, 0, 1, 3, 0, 0, 0,
    ]);
    const result = inspectBytes(jpeg);
    expect(result.type).toBe('image/jpeg');
    expect(result.format).toContainEqual({ label: 'Encoding', value: 'Progressive' });
    expect(result.exif[0]).toEqual({ label: 'Camera make', value: 'Ace' });
    expect(result.gps).not.toBeNull();
  });

  it('describes aspect ratios', () => {
    expect(aspectRatio(1920, 1080)).toBe('16:9');
    expect(aspectRatio(4032, 3024)).toBe('4:3');
    expect(aspectRatio(1001, 997)).toBe('1.00:1');
  });
});
