import { fitSquare, svgSize } from './image-encoder';
import { writeBmp, writeIco } from './image-formats';

/** jsdom has no ImageData, so build the same shape by hand. */
const pixels = (width: number, height: number, rgba: number[]) =>
  ({
    width,
    height,
    data: new Uint8ClampedArray(Array.from({ length: width * height }, () => rgba).flat()),
  }) as ImageData;

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('writeBmp', () => {
  it('writes a 24-bit BMP with padded rows, stored bottom to top in BGR order', async () => {
    const image = pixels(3, 2, [255, 0, 0, 255]);
    image.data.set([0, 0, 255, 255], 0); // top-left pixel blue
    const blob = writeBmp(image);
    const bytes = await bytesOf(blob);
    const view = new DataView(bytes.buffer);
    expect(blob.type).toBe('image/bmp');
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('BM');
    // 3 pixels × 3 bytes = 9, padded to 12 per row.
    expect(bytes.length).toBe(54 + 12 * 2);
    expect(view.getUint32(2, true)).toBe(bytes.length);
    expect(view.getInt32(18, true)).toBe(3);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
    // The top row is stored last; its first pixel is blue (B, G, R).
    expect([...bytes.slice(54 + 12, 54 + 12 + 3)]).toEqual([255, 0, 0]);
    // The bottom row is stored first and is red.
    expect([...bytes.slice(54, 57)]).toEqual([0, 0, 255]);
  });
});

describe('writeIco', () => {
  it('stores each PNG with its size, and 256 as 0', async () => {
    const png = (n: number) => new Uint8Array(n).fill(7).buffer;
    const bytes = await bytesOf(
      writeIco([
        { size: 16, png: png(10) },
        { size: 256, png: png(20) },
      ]),
    );
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(2, true)).toBe(1); // icon
    expect(view.getUint16(4, true)).toBe(2); // two images
    expect(bytes[6]).toBe(16);
    expect(view.getUint32(6 + 8, true)).toBe(10);
    expect(view.getUint32(6 + 12, true)).toBe(6 + 32);
    expect(bytes[22]).toBe(0); // 256 px
    expect(view.getUint32(22 + 12, true)).toBe(6 + 32 + 10);
    expect(bytes.length).toBe(6 + 32 + 30);
  });
});

describe('fitSquare', () => {
  it('centres a wide image in the square, keeping its shape', () => {
    expect(fitSquare(400, 200, 32)).toEqual({ x: 0, y: 8, width: 32, height: 16 });
  });

  it('centres a tall image', () => {
    expect(fitSquare(100, 300, 48)).toEqual({ x: 16, y: 0, width: 16, height: 48 });
  });
});

describe('svgSize', () => {
  it('scales small drawings up to 1024 px on the longer side', () => {
    expect(svgSize(24, 12)).toEqual({ width: 1024, height: 512 });
  });

  it('keeps large drawings as they are', () => {
    expect(svgSize(2000, 1000)).toEqual({ width: 2000, height: 1000 });
  });

  it('uses a square when the SVG has no size', () => {
    expect(svgSize(0, 0)).toEqual({ width: 1024, height: 1024 });
  });
});
