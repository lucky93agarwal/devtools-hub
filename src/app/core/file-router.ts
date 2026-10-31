/** Which tool opens a file dropped anywhere on the site, and with what. */
import { detect } from './detect';
import { SharedData } from './shared-input';

export type FileRoute = { path: string; data: SharedData } | { path: string; files: true } | { error: string };

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/** By extension first, as the name says the most; then by looking at the text. */
const BY_EXTENSION: [RegExp, string, string][] = [
  [/\.json$/i, 'json-formatter', 'input'],
  [/strings\.xml$/i, 'localization-converter', 'input'],
  [/\.(xml|svg|plist|xsd)$/i, 'xml-formatter', 'input'],
  [/\.(ya?ml)$/i, 'yaml-validator', 'input'],
  [/(^|\.)env(\.[\w-]+)?$/i, 'env-converter', 'input'],
  [/\.(pem|crt|cer|csr|der)$/i, 'certificate-decoder', 'input'],
  [/\.(md|markdown)$/i, 'markdown-editor', 'input'],
  [/\.sql$/i, 'sql-formatter', 'input'],
  [/\.(html?|css|js|mjs)$/i, 'code-beautifier', 'input'],
  [/\.strings$/i, 'localization-converter', 'input'],
];

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export async function routeFile(file: File): Promise<FileRoute> {
  if (file.type.startsWith('image/') && !/svg/.test(file.type)) return { path: 'image-converter', files: true };
  const byName = BY_EXTENSION.find(([pattern]) => pattern.test(file.name));
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, MAX_TEXT_BYTES)).arrayBuffer());
  let text: string | null = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Binary: DER certificates go to the decoder as Base64, anything else gets a checksum.
  }
  if (byName && byName[1] === 'certificate-decoder' && text === null) return { path: 'certificate-decoder', data: { input: toBase64(bytes) } };
  if (text === null || file.size > MAX_TEXT_BYTES) return { path: 'hash-generator', files: true };
  if (byName) return { path: byName[1], data: { [byName[2]]: text } };
  const first = detect(text)[0]?.suggestions[0];
  return first ? { path: first.path, data: first.data } : { error: `No tool reads ${file.name}.` };
}
