/** How a response body can be shown, as in Postman's format menu. */

export type ResponseFormat = 'json' | 'xml' | 'html' | 'yaml' | 'javascript' | 'markdown' | 'raw' | 'hex' | 'base64';

export interface FormatOption {
  value: ResponseFormat;
  label: string;
  /** Monaco language for the editor. */
  editor: string;
  /** Short mark shown in the menu, like Postman's icons. */
  mark: string;
  /** "text" formats colour the body; "bytes" formats show it unformatted or encoded. */
  group: 'text' | 'bytes';
}

export const RESPONSE_FORMATS: FormatOption[] = [
  { value: 'json', label: 'JSON', editor: 'json', mark: '{ }', group: 'text' },
  { value: 'xml', label: 'XML', editor: 'xml', mark: '</>', group: 'text' },
  { value: 'html', label: 'HTML', editor: 'html', mark: '<h>', group: 'text' },
  { value: 'yaml', label: 'YAML', editor: 'yaml', mark: 'y:', group: 'text' },
  { value: 'javascript', label: 'JavaScript', editor: 'javascript', mark: 'JS', group: 'text' },
  { value: 'markdown', label: 'Markdown', editor: 'markdown', mark: 'M↓', group: 'text' },
  { value: 'raw', label: 'Raw', editor: 'plaintext', mark: 'T', group: 'bytes' },
  { value: 'hex', label: 'Hex', editor: 'plaintext', mark: '0x', group: 'bytes' },
  { value: 'base64', label: 'Base64', editor: 'plaintext', mark: '64', group: 'bytes' },
];

/** Hex dumps of more than this are cut short; they are 4 times the size of the data. */
export const HEX_LIMIT = 256 * 1024;
/** Larger bodies are cut short in Base64 so the editor stays quick. */
export const BASE64_LIMIT = 4 * 1024 * 1024;

/** The format a response opens in, from its Content-Type. Binary bodies open as Hex. */
export function defaultFormat(contentType: string, isText: boolean, text = ''): ResponseFormat {
  if (!isText) return 'hex';
  const type = contentType.toLowerCase();
  if (/json/.test(type)) return 'json';
  // Servers often send JSON as text/plain or with no type at all.
  if (!/html|xml|yaml|javascript|markdown/.test(type) && /^\s*[[{]/.test(text)) return 'json';
  if (/html/.test(type)) return 'html';
  if (/xml/.test(type)) return 'xml';
  if (/yaml|yml/.test(type)) return 'yaml';
  if (/javascript|ecmascript/.test(type)) return 'javascript';
  if (/markdown/.test(type)) return 'markdown';
  return 'raw';
}

/** What Preview can show for a content type without running anything from the response. */
export function previewKind(contentType: string, isText: boolean): 'image' | 'pdf' | 'video' | 'audio' | 'html' | 'text' | 'none' {
  const type = contentType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.includes('pdf')) return 'pdf';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.includes('html')) return 'html';
  return isText ? 'text' : 'none';
}

/**
 * Lines of 16 bytes: offset, the bytes in hex, and the printable ASCII characters,
 * as `hexdump -C` prints them.
 */
export function hexDump(bytes: Uint8Array, limit = HEX_LIMIT): string {
  const shown = bytes.subarray(0, limit);
  const lines: string[] = [];
  for (let offset = 0; offset < shown.length; offset += 16) {
    const row = shown.subarray(offset, offset + 16);
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0'));
    const left = hex.slice(0, 8).join(' ');
    const right = hex.slice(8).join(' ');
    const ascii = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${left.padEnd(23)}  ${right.padEnd(23)}  |${ascii}|`);
  }
  if (bytes.length > limit) lines.push(`… ${bytes.length - limit} more bytes not shown. Download the response to see them all.`);
  return lines.join('\n');
}

export function toBase64(bytes: Uint8Array, limit = BASE64_LIMIT): string {
  const shown = bytes.subarray(0, limit);
  let binary = '';
  for (let i = 0; i < shown.length; i += 0x8000) binary += String.fromCharCode(...shown.subarray(i, i + 0x8000));
  const text = btoa(binary);
  return bytes.length > limit ? `${text}\n\n… cut at ${limit} bytes. Download the response to get all of it.` : text;
}

/** HTML for a sandboxed preview frame, with links and images resolved against the response URL. */
export function previewDocument(html: string, baseUrl: string): string {
  const base = `<base href="${baseUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" target="_blank">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + base) : base + html;
}
