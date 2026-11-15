/**
 * Writes palette ("indexed") PNG files, the trick TinyPNG and pngquant use:
 * up to 256 colours with one byte per pixel instead of four, which is often
 * 60 to 80% smaller and looks the same for logos, screenshots and icons.
 */

let crcTable: Uint32Array | null = null;

/** CRC-32 as PNG chunks need it. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** zlib-wrapped deflate, as PNG's image data needs it. */
export async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * An 8-bit palette PNG. `index` holds one palette position per pixel; palette
 * colours are [r, g, b] or [r, g, b, a].
 */
export async function encodeIndexedPng(
  width: number,
  height: number,
  index: Uint8Array,
  palette: readonly number[][],
): Promise<Blob> {
  return new Blob([(await indexedPngBytes(width, height, index, palette)) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

/** The bytes of an 8-bit palette PNG; see encodeIndexedPng. */
export async function indexedPngBytes(
  width: number,
  height: number,
  index: Uint8Array,
  palette: readonly number[][],
): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 3; // colour type: palette
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((colour, i) => plte.set(colour.slice(0, 3), i * 3));
  // Alpha for each palette entry, trimmed after the last see-through one.
  let lastAlpha = -1;
  palette.forEach((colour, i) => {
    if ((colour[3] ?? 255) < 255) lastAlpha = i;
  });
  const trns = new Uint8Array(lastAlpha + 1);
  for (let i = 0; i <= lastAlpha; i++) trns[i] = palette[i][3] ?? 255;
  // Every row starts with filter type 0 (none), which suits palette images.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(index.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', plte),
    ...(trns.length ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Percent smaller (positive) or bigger (negative), rounded. */
export function savedPercent(before: number, after: number): number {
  return before > 0 ? Math.round((1 - after / before) * 100) : 0;
}
