/** Reading and writing images as Base64 text and data: URIs. */

/** Image type from the first bytes of a file, which is more reliable than the name. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const ascii = (from: number, text: string) => [...text].every((ch, i) => bytes[from + i] === ch.charCodeAt(0));
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'BM')) return 'image/bmp';
  if (starts(0, 0, 1, 0)) return 'image/x-icon';
  if (starts(0x49, 0x49, 0x2a, 0) || starts(0x4d, 0x4d, 0, 0x2a)) return 'image/tiff';
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'mif1', 'msf1', 'heim', 'heis', 'hevc'].includes(brand)) return 'image/heic';
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

export type ParsedImage = { ok: true; type: string; bytes: Uint8Array } | { ok: false; message: string };

/** Reads pasted Base64 or a data: URI (with or without the prefix, quotes, CSS url() or line breaks). */
export function parseImageText(text: string): ParsedImage {
  let value = text.trim().replace(/^url\((.*)\)$/i, '$1').replace(/^['"]|['"]$/g, '').trim();
  let declared: string | null = null;
  const dataUri = /^data:([^;,]*)(;[^,]*)?,/i.exec(value);
  if (dataUri) {
    declared = dataUri[1].toLowerCase() || null;
    if (!/;base64/i.test(dataUri[2] ?? '')) {
      // A URL-encoded SVG, as some CSS uses.
      if (declared === 'image/svg+xml') {
        try {
          return { ok: true, type: declared, bytes: new TextEncoder().encode(decodeURIComponent(value.slice(dataUri[0].length))) };
        } catch {
          return { ok: false, message: 'This data URI could not be decoded.' };
        }
      }
      return { ok: false, message: 'This data URI is not Base64.' };
    }
    value = value.slice(dataUri[0].length);
  }
  value = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!value) return { ok: false, message: 'Paste Base64 text or a data: URI.' };
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return { ok: false, message: 'This is not valid Base64.' };
  while (value.length % 4) value += '=';
  let bytes: Uint8Array;
  try {
    const binary = atob(value);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return { ok: false, message: 'This is not valid Base64.' };
  }
  const type = sniffImageType(bytes) ?? (declared?.startsWith('image/') ? declared : null);
  if (!type) return { ok: false, message: 'The decoded data is not an image this tool recognises.' };
  return { ok: true, type, bytes };
}

/** Base64 of bytes, in chunks so large images do not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Ready-to-paste snippets for a data URI. */
export function snippets(dataUri: string, name: string): { label: string; text: string }[] {
  const alt = name.replace(/\.[^.]+$/, '').replace(/["<>]/g, '');
  return [
    { label: 'Data URI', text: dataUri },
    { label: 'Base64 only', text: dataUri.slice(dataUri.indexOf(',') + 1) },
    { label: 'HTML <img>', text: `<img src="${dataUri}" alt="${alt}">` },
    { label: 'CSS background', text: `background-image: url("${dataUri}");` },
    { label: 'Markdown', text: `![${alt}](${dataUri})` },
  ];
}

/** File extension for an image type. */
export function extensionFor(type: string): string {
  return (
    { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/tiff': 'tif' }[type] ??
    type.replace('image/', '')
  );
}
