// Same format as src/app/core/shared-input.ts: JSON, raw DEFLATE, Base64URL, in the part after #
// (which browsers never send to a server).
export const SITE = 'https://devtools24.in';

async function deflateRaw(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function toolUrl(path, data) {
  if (!data) return `${SITE}/${path}`;
  return `${SITE}/${path}#share=${toBase64Url(await deflateRaw(JSON.stringify(data)))}`;
}

/** Picks the tool for a piece of text, like Smart Paste on the site. */
export function detect(input) {
  const text = input.trim();
  const oneLine = !text.includes('\n');
  if (/^(Bearer\s+)?eyJ[\w-]+\.eyJ[\w-]*\.[\w-]*$/.test(text)) return { path: 'jwt', data: { token: text } };
  if (/^curl\s/i.test(text)) return { path: 'curl-to-code', data: { input: text } };
  if (/-----BEGIN (CERTIFICATE|CERTIFICATE REQUEST)-----/.test(text)) return { path: 'certificate-decoder', data: { input: text } };
  if (/^[{[]/.test(text)) return { path: 'json-formatter', data: { input: text } };
  if (oneLine && /^https?:\/\/\S+$/i.test(text)) return { path: 'url-encoder', data: { url: text } };
  if (oneLine && /%[0-9a-f]{2}/i.test(text)) return { path: 'url-encoder', data: { text, direction: 'decode' } };
  if (oneLine && /^-?\d{9,19}(\.\d+)?$/.test(text)) return { path: 'timestamp-converter', data: { input: text } };
  if (oneLine && /^(@\w+|([\d*?/,LW#-]+\s+){4,6}[\d*?/,LW#A-Z-]+)$/i.test(text)) return { path: 'cron-expression', data: { input: text } };
  if (text.length >= 8 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text.replace(/\s+/g, '')) && text.replace(/\s+/g, '').length % 4 !== 1) {
    return { path: 'base64', data: { input: text, mode: 'decode' } };
  }
  return { path: 'case-converter', data: { input: text } };
}
