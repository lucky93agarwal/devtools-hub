/**
 * Reads what an image file says about itself: format details from the header
 * and EXIF metadata (camera, date, exposure, GPS), without any library.
 */
import { sniffImageType } from '../image-base64/image-data';

export interface Fact {
  label: string;
  value: string;
}

export interface Inspection {
  type: string | null;
  format: Fact[];
  exif: Fact[];
  gps: { latitude: number; longitude: number } | null;
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

export function inspectBytes(bytes: Uint8Array): Inspection {
  const type = sniffImageType(bytes);
  const format: Fact[] = [];
  let tiff: Uint8Array | null = null;
  try {
    if (type === 'image/png') tiff = inspectPng(bytes, format);
    else if (type === 'image/jpeg') tiff = inspectJpeg(bytes, format);
    else if (type === 'image/webp') tiff = inspectWebp(bytes, format);
    else if (type === 'image/gif') inspectGif(bytes, format);
    else if (type === 'image/tiff') tiff = bytes;
    else if (type === 'image/avif' || type === 'image/heic') {
      format.push({ label: 'Container', value: `HEIF (brand ${ascii(bytes, 8, 4)})` });
      tiff = findExif(bytes);
    }
  } catch {
    format.push({ label: 'Note', value: 'Part of the header could not be read; the file may be damaged.' });
  }
  const { exif, gps } = tiff ? readExif(tiff) : { exif: [], gps: null };
  return { type, format, exif, gps };
}

/** EXIF in HEIF and other containers starts with "Exif\0\0" then the TIFF header. */
function findExif(bytes: Uint8Array): Uint8Array | null {
  for (let i = 0; i < bytes.length - 10; i++) {
    if (bytes[i] === 0x45 && ascii(bytes, i, 6) === 'Exif\0\0') return bytes.subarray(i + 6);
  }
  return null;
}

const PNG_COLOUR = ['Greyscale', '', 'RGB', 'Indexed (palette)', 'Greyscale + alpha', '', 'RGBA'];

function inspectPng(bytes: Uint8Array, out: Fact[]): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let exif: Uint8Array | null = null;
  const texts: string[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const data = offset + 8;
    if (type === 'IHDR') {
      out.push({ label: 'Bit depth', value: `${bytes[data + 8]} bits per channel` });
      out.push({ label: 'Colour type', value: PNG_COLOUR[bytes[data + 9]] || 'Unknown' });
      out.push({ label: 'Interlaced', value: bytes[data + 12] ? 'Yes (Adam7)' : 'No' });
    } else if (type === 'iCCP') {
      out.push({ label: 'Colour profile', value: `Embedded ICC (${ascii(bytes, data, Math.min(79, length)).split('\0')[0]})` });
    } else if (type === 'sRGB') {
      out.push({ label: 'Colour profile', value: 'sRGB' });
    } else if (type === 'pHYs' && bytes[data + 8] === 1) {
      out.push({ label: 'Resolution', value: `${Math.round(view.getUint32(data) * 0.0254)} DPI` });
    } else if (type === 'acTL') {
      out.push({ label: 'Animation', value: `Animated PNG, ${view.getUint32(data)} frames` });
    } else if (type === 'eXIf') {
      exif = bytes.subarray(data, data + length);
    } else if (type === 'tEXt' || type === 'iTXt') {
      const keyword = ascii(bytes, data, Math.min(79, length)).split('\0')[0];
      if (keyword) texts.push(keyword);
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (texts.length) out.push({ label: 'Text chunks', value: [...new Set(texts)].join(', ') });
  return exif;
}

function inspectJpeg(bytes: Uint8Array, out: Fact[]): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let exif: Uint8Array | null = null;
  let icc = false;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    const data = offset + 4;
    if (marker === 0xe1 && ascii(bytes, data, 6) === 'Exif\0\0') exif = bytes.subarray(data + 6, offset + 2 + length);
    else if (marker === 0xe2 && ascii(bytes, data, 11) === 'ICC_PROFILE') icc = true;
    else if (marker === 0xe0 && ascii(bytes, data, 5) === 'JFIF\0' && bytes[data + 7] === 1) {
      out.push({ label: 'Resolution', value: `${view.getUint16(data + 8)} DPI` });
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      out.push({ label: 'Encoding', value: marker === 0xc2 ? 'Progressive' : 'Baseline' });
      out.push({ label: 'Bit depth', value: `${bytes[data]} bits per channel` });
      const components = bytes[data + 5];
      out.push({ label: 'Colour', value: components === 1 ? 'Greyscale' : components === 4 ? 'CMYK' : 'YCbCr (colour)' });
      break;
    }
    offset += 2 + length;
  }
  out.push({ label: 'Colour profile', value: icc ? 'Embedded ICC profile' : 'None (treated as sRGB)' });
  return exif;
}

function inspectWebp(bytes: Uint8Array, out: Fact[]): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = ascii(bytes, 12, 4);
  out.push({ label: 'Compression', value: kind === 'VP8L' ? 'Lossless' : kind === 'VP8X' ? 'Extended' : 'Lossy' });
  let exif: Uint8Array | null = null;
  if (kind === 'VP8X') {
    const flags = bytes[20];
    out.push({ label: 'Transparency', value: flags & 0x10 ? 'Yes' : 'No' });
    out.push({ label: 'Animation', value: flags & 0x02 ? 'Yes' : 'No' });
    if (flags & 0x20) out.push({ label: 'Colour profile', value: 'Embedded ICC' });
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const id = ascii(bytes, offset, 4);
      const size = view.getUint32(offset + 4, true);
      if (id === 'EXIF') {
        exif = bytes.subarray(offset + 8, offset + 8 + size);
        if (ascii(exif, 0, 6) === 'Exif\0\0') exif = exif.subarray(6);
      }
      offset += 8 + size + (size % 2);
    }
  }
  return exif;
}

function inspectGif(bytes: Uint8Array, out: Fact[]): void {
  out.push({ label: 'Version', value: ascii(bytes, 0, 6) });
  // Count image descriptors (0x2C) that follow a graphic control block, a quick frame estimate.
  let frames = 0;
  for (let i = 13; i < bytes.length - 2; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames++;
  out.push({ label: 'Frames', value: frames > 1 ? `${frames} (animated)` : '1' });
}

const ORIENTATION = ['', 'Normal', 'Mirrored', 'Rotated 180°', 'Flipped', 'Mirrored, rotated 90°', 'Rotated 90° clockwise', 'Mirrored, rotated 270°', 'Rotated 90° anticlockwise'];

/** TIFF tags we show, by IFD. */
const TAGS: Record<number, string> = {
  0x010f: 'Camera make',
  0x0110: 'Camera model',
  0x0112: 'Orientation',
  0x0131: 'Software',
  0x0132: 'Modified',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x829a: 'Exposure time',
  0x829d: 'F-number',
  0x8827: 'ISO',
  0x9003: 'Taken',
  0x920a: 'Focal length',
  0x9209: 'Flash',
  0xa434: 'Lens',
  0xa002: 'Pixel width',
  0xa003: 'Pixel height',
};

/** Reads EXIF from a TIFF-structured block (starting with "II" or "MM"). */
export function readExif(tiff: Uint8Array): { exif: Fact[]; gps: Inspection['gps'] } {
  const exif: Fact[] = [];
  let gps: Inspection['gps'] = null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = ascii(tiff, 0, 2) === 'II';
  if (!little && ascii(tiff, 0, 2) !== 'MM') return { exif, gps };
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  const values = (entry: number): number[] | string => {
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = (sizes[type] ?? 1) * count;
    const at = size > 4 ? u32(entry + 8) : entry + 8;
    if (at + size > tiff.length) return [];
    if (type === 2) return ascii(tiff, at, count).replace(/\0+$/, '').trim();
    const out: number[] = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      if (type === 3) out.push(u16(at + i * 2));
      else if (type === 4) out.push(u32(at + i * 4));
      else if (type === 9) out.push(view.getInt32(at + i * 4, little));
      else if (type === 5) out.push(u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
      else if (type === 10) out.push(view.getInt32(at + i * 8, little) / (view.getInt32(at + i * 8 + 4, little) || 1));
      else out.push(tiff[at + i]);
    }
    return out;
  };

  const readIfd = (offset: number, onEntry: (tag: number, entry: number) => void) => {
    if (offset <= 0 || offset + 2 > tiff.length) return;
    const count = u16(offset);
    for (let i = 0; i < count && offset + 2 + (i + 1) * 12 <= tiff.length; i++) onEntry(u16(offset + 2 + i * 12), offset + 2 + i * 12);
  };

  const found = new Map<string, string>();
  let exifIfd = 0;
  let gpsIfd = 0;
  const onTag = (tag: number, entry: number) => {
    if (tag === 0x8769) exifIfd = u32(entry + 8);
    else if (tag === 0x8825) gpsIfd = u32(entry + 8);
    const label = TAGS[tag];
    if (!label || found.has(label)) return;
    const value = values(entry);
    const first = Array.isArray(value) ? value[0] : undefined;
    let text: string;
    if (typeof value === 'string') text = value;
    else if (first === undefined) return;
    else if (tag === 0x0112) text = ORIENTATION[first] || String(first);
    else if (tag === 0x829a) text = first >= 1 ? `${first} s` : `1/${Math.round(1 / first)} s`;
    else if (tag === 0x829d) text = `f/${first.toFixed(1)}`;
    else if (tag === 0x920a) text = `${Math.round(first * 10) / 10} mm`;
    else if (tag === 0x9209) text = first & 1 ? 'Fired' : 'Did not fire';
    else text = String(first);
    if (text) found.set(label, text);
  };
  readIfd(u32(4), onTag);
  readIfd(exifIfd, onTag);
  for (const [label, value] of found) exif.push({ label, value });

  if (gpsIfd) {
    const gpsValues: Record<number, number[] | string> = {};
    readIfd(gpsIfd, (tag, entry) => (gpsValues[tag] = values(entry)));
    const toDegrees = (v: number[] | string | undefined) => (Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : NaN);
    let latitude = toDegrees(gpsValues[2]);
    let longitude = toDegrees(gpsValues[4]);
    if (gpsValues[1] === 'S') latitude = -latitude;
    if (gpsValues[3] === 'W') longitude = -longitude;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) gps = { latitude, longitude };
  }
  return { exif, gps };
}

/** Width:height in lowest terms, like 16:9, or a decimal when that is not a neat ratio. */
export function aspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(width, height) || 1;
  const w = width / d;
  const h = height / d;
  return w <= 50 && h <= 50 ? `${w}:${h}` : `${(width / height).toFixed(2)}:1`;
}
