/**
 * Removes metadata from JPEG, PNG and WebP files without re-encoding the image,
 * so quality and file size stay the same. Colour profiles are kept, because
 * removing them changes how colours look.
 */

export interface StripResult {
  bytes: Uint8Array;
  /** Names of what was removed, such as "EXIF" or "XMP". */
  removed: string[];
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** JPEG: drops APP1 (EXIF, XMP), APP13 (IPTC) and comments; keeps JFIF, ICC profile and Adobe markers. */
export function stripJpeg(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  const removed = new Set<string>();
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    // Start of scan: the rest is image data.
    if (marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    const data = offset + 4;
    let drop = false;
    if (marker === 0xe1) {
      drop = true;
      removed.add(ascii(bytes, data, 4) === 'Exif' ? 'EXIF' : 'XMP');
    } else if (marker === 0xed) {
      drop = true;
      removed.add('IPTC');
    } else if (marker === 0xfe) {
      drop = true;
      removed.add('Comment');
    } else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) {
      // APP3 to APP15 (except Adobe's APP14) hold maker notes and other extras.
      drop = true;
      removed.add('Extra metadata');
    }
    if (!drop) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  parts.push(bytes.subarray(offset));
  return { bytes: concat(parts), removed: [...removed] };
}

const PNG_DROP: Record<string, string> = { eXIf: 'EXIF', tEXt: 'Text', zTXt: 'Text', iTXt: 'Text (XMP)', tIME: 'Date' };

/** PNG: drops eXIf, text and time chunks; keeps colour (iCCP, sRGB, gAMA) and image chunks. */
export function stripPng(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed = new Set<string>();
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (PNG_DROP[type]) removed.add(PNG_DROP[type]);
    else parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return { bytes: concat(parts), removed: [...removed] };
}

/** WebP: drops EXIF and XMP chunks and clears their flags in the VP8X header. */
export function stripWebp(bytes: Uint8Array): StripResult {
  if (ascii(bytes, 12, 4) !== 'VP8X') return { bytes, removed: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  const removed = new Set<string>();
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size + (size % 2));
    if (id === 'EXIF' || id === 'XMP ') removed.add(id === 'EXIF' ? 'EXIF' : 'XMP');
    else parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  const body = concat(parts);
  // VP8X flags: bit 3 = EXIF, bit 2 = XMP.
  body[8] &= ~0x0c;
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return { bytes: concat([header, body]), removed: [...removed] };
}

/** The EXIF orientation of a JPEG (1 = upright), or 1 when there is none. */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff && bytes[offset + 1] !== 0xda) {
    const length = view.getUint16(offset + 2);
    if (bytes[offset + 1] === 0xe1 && ascii(bytes, offset + 4, 6) === 'Exif\0\0') {
      const tiff = offset + 10;
      const little = ascii(bytes, tiff, 2) === 'II';
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) break;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}
