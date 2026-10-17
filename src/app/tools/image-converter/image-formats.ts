/**
 * Readers and writers for the formats the browser's canvas cannot handle by
 * itself. Small formats (BMP, ICO) are written here; the rest use libraries that
 * are only downloaded when a file of that kind is used.
 */

/** 24-bit BMP. BMP has no reliable transparency, so pass pixels already on a solid background. */
export function writeBmp(image: ImageData): Blob {
  const { width, height, data } = image;
  // Each row is padded to a multiple of 4 bytes.
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x42; // "B"
  bytes[1] = 0x4d; // "M"
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true); // where the pixels start
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: rows are stored bottom to top
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(34, rowSize * height, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    let out = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      bytes[out++] = data[i + 2];
      bytes[out++] = data[i + 1];
      bytes[out++] = data[i];
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

/** Icon sizes put into every ICO file: browser tabs, taskbars and high-density screens. */
export const ICO_SIZES = [16, 32, 48, 256];

/** ICO holding one PNG per size, which every current system reads. */
export function writeIco(icons: { size: number; png: ArrayBuffer }[]): Blob {
  const headerSize = 6 + icons.length * 16;
  const total = headerSize + icons.reduce((sum, icon) => sum + icon.png.byteLength, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, icons.length, true);
  let offset = headerSize;
  icons.forEach((icon, n) => {
    const entry = 6 + n * 16;
    // 0 means 256 pixels.
    bytes[entry] = icon.size >= 256 ? 0 : icon.size;
    bytes[entry + 1] = icon.size >= 256 ? 0 : icon.size;
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, icon.png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(new Uint8Array(icon.png), offset);
    offset += icon.png.byteLength;
  });
  return new Blob([buffer], { type: 'image/x-icon' });
}

/** GIF with up to 256 colours; fully transparent pixels stay transparent. */
export async function writeGif(image: ImageData): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc/dist/gifenc.esm.js');
  const palette = quantize(image.data, 256, { format: 'rgba4444', oneBitAlpha: true });
  const index = applyPalette(image.data, palette, 'rgba4444');
  const transparentIndex = palette.findIndex((colour) => colour[3] === 0);
  const gif = GIFEncoder();
  gif.writeFrame(index, image.width, image.height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}

/** Uncompressed TIFF, which every program that reads TIFF can open. */
export async function writeTiff(image: ImageData): Promise<Blob> {
  const { default: UTIF } = await import('utif');
  const pixels = image.data.slice().buffer;
  return new Blob([UTIF.encodeImage(pixels, image.width, image.height)], { type: 'image/tiff' });
}

/** AVIF, encoded in a Web Worker because it takes a few seconds for a large photo. */
export function writeAvif(image: ImageData, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./avif.worker', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = ({ data }: MessageEvent<{ avif?: ArrayBuffer; error?: string }>) => {
      done();
      if (data.avif) resolve(new Blob([data.avif], { type: 'image/avif' }));
      else reject(new Error(data.error ?? 'AVIF encoding failed.'));
    };
    worker.onerror = () => {
      done();
      reject(new Error('AVIF encoding failed.'));
    };
    worker.postMessage({ image, quality }, [image.data.buffer]);
  });
}

/** Pixels from a TIFF the browser cannot open itself (every browser except Safari). */
export async function readTiff(buffer: ArrayBuffer): Promise<ImageData> {
  const { default: UTIF } = await import('utif');
  const [first] = UTIF.decode(buffer);
  if (!first) throw new Error('No image in this TIFF.');
  UTIF.decodeImage(buffer, first);
  const rgba = UTIF.toRGBA8(first);
  return new ImageData(new Uint8ClampedArray(rgba), first.width, first.height);
}

/** Pixels from a HEIC or HEIF photo (iPhone camera format), for browsers that cannot open it. */
export async function readHeic(buffer: ArrayBuffer): Promise<ImageData> {
  const { default: factory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs');
  const libheif = await factory();
  const [image] = new libheif.HeifDecoder().decode(new Uint8Array(buffer));
  if (!image) throw new Error('No image in this HEIC file.');
  try {
    const width = image.get_width();
    const height = image.get_height();
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const result = await new Promise<{ data: Uint8ClampedArray } | null>((resolve) =>
      image.display(target, resolve),
    );
    if (!result) throw new Error('This HEIC file could not be decoded.');
    return new ImageData(target.data, width, height);
  } finally {
    image.free?.();
  }
}
