/** Turning image pixels into ASCII art. */

export const CHARSETS = {
  standard: ' .:-=+*#%@',
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  simple: ' .oO@',
  binary: ' #',
} as const;
export type Charset = keyof typeof CHARSETS;

/** Rows of text for a picture `columns` characters wide. Characters are about twice as tall as wide. */
export function rowsFor(width: number, height: number, columns: number): number {
  return Math.max(1, Math.round((height / width) * columns * 0.5));
}

/**
 * ASCII art from RGBA pixels already scaled to columns × rows. Dark pixels get
 * dense characters; `invert` flips that for light text on a dark background.
 * Transparent pixels count as the background.
 */
export function toAscii(
  data: Uint8ClampedArray | Uint8Array,
  columns: number,
  rows: number,
  chars: string,
  invert = false,
): string {
  const set = [...chars];
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 4;
      const alpha = data[i + 3] / 255;
      // Luminance, with transparent pixels blended onto white.
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha + 255 * (1 - alpha);
      const darkness = 1 - lum / 255;
      const level = invert ? 1 - darkness : darkness;
      line += set[Math.min(set.length - 1, Math.floor(level * set.length))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

/** The art wrapped for a README (a code block keeps the spacing). */
export function asMarkdown(art: string): string {
  return '```text\n' + art + '\n```\n';
}

/** The art as an HTML <pre> block, safe to paste into a page. */
export function asHtml(art: string): string {
  const escaped = art.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre style="font-family: monospace; line-height: 1; font-size: 8px">\n${escaped}\n</pre>\n`;
}
