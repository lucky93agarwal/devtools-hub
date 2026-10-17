import { zipSync } from 'fflate';
import { baseName } from '../../shared/file-utils';

/**
 * Makes every name unique by adding " (2)", " (3)" and so on before the extension,
 * so photo.png and photo.jpg converted to WebP do not overwrite each other in the ZIP.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '';
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      candidate = `${baseName(name)} (${n})${extension}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** BMP and TIFF are written without compression, so the ZIP compresses them. */
const UNCOMPRESSED = /\.(bmp|tiff?)$/i;

/**
 * Packs files into one ZIP. Most images are already compressed, so they are
 * stored as they are (level 0), which is much faster and barely bigger.
 */
export async function buildZip(files: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const names = uniqueNames(files.map((f) => f.name));
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (let i = 0; i < files.length; i++) {
    const level = UNCOMPRESSED.test(names[i]) ? 6 : 0;
    entries[names[i]] = [new Uint8Array(await files[i].blob.arrayBuffer()), { level }];
  }
  return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
