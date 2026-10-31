/** Base64 and Base64URL encoding of text and bytes, and decoding that tolerates real-world input. */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let binary = '';
  // Chunks keep String.fromCharCode below the argument limit for large files.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  return urlSafe ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base64;
}

export const textToBase64 = (text: string, urlSafe = false) => bytesToBase64(new TextEncoder().encode(text), urlSafe);

/** Splits Base64 into lines of 76 characters, as MIME and PEM files do. */
export const wrapLines = (base64: string, width = 76) => base64.replace(new RegExp(`(.{${width}})(?=.)`, 'g'), '$1\n');

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; mime: string | null }
  | { ok: false; error: string };

/**
 * Decodes Base64 or Base64URL. Accepts a data: URI, line breaks and spaces, and missing padding,
 * and points at the first character that cannot be Base64.
 */
export function decodeBase64(input: string): DecodeResult {
  let text = input.trim();
  let mime: string | null = null;
  const dataUri = /^data:([^;,]*)(?:;[^,]*)?;base64,/i.exec(text);
  if (dataUri) {
    mime = dataUri[1] || null;
    text = text.slice(dataUri[0].length);
  }
  text = text.replace(/\s+/g, '');
  const bad = /[^A-Za-z0-9+/\-_=]/.exec(text);
  if (bad) return { ok: false, error: `“${bad[0]}” at position ${bad.index + 1} is not a Base64 character.` };
  const padding = /=+$/.exec(text)?.[0].length ?? 0;
  const body = text.slice(0, text.length - padding);
  if (body.includes('=')) return { ok: false, error: 'Padding (=) can only appear at the end.' };
  if (body.length % 4 === 1) return { ok: false, error: 'The Base64 is cut short: one character too many or too few.' };
  const standard = body.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ok: true, bytes, mime: mime ?? sniffMime(bytes) };
  } catch {
    return { ok: false, error: 'This is not valid Base64.' };
  }
}

/** The bytes as UTF-8 text, or null when they are not text (an image, a zip file and so on). */
export function bytesToText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Control characters other than tabs and line breaks mean binary data.
    return /[\u0000-\u0008\u000E-\u001F]/.test(text) ? null : text;
  } catch {
    return null;
  }
}

const SIGNATURES: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
  ['application/zip', [0x50, 0x4b, 0x03, 0x04]],
  ['application/gzip', [0x1f, 0x8b]],
  ['image/x-icon', [0x00, 0x00, 0x01, 0x00]],
  ['image/bmp', [0x42, 0x4d]],
];

/** Recognises common file types from their first bytes. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp' && /avif|avis/.test(String.fromCharCode(...bytes.subarray(8, 12)))) {
    return 'image/avif';
  }
  for (const [mime, signature] of SIGNATURES) {
    if (signature.every((byte, i) => bytes[i] === byte)) return mime;
  }
  const start = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  if (/^<svg[\s>]|^<\?xml[^>]*>\s*<svg[\s>]/i.test(start)) return 'image/svg+xml';
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
  'application/json': 'json',
  'text/plain': 'txt',
};

export const extensionFor = (mime: string | null) => (mime && EXTENSIONS[mime]) || 'bin';
