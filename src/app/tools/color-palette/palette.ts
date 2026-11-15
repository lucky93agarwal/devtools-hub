/** Finding the main colours of an image, with median cut (the method used by many palette tools). */

export interface Swatch {
  r: number;
  g: number;
  b: number;
  /** Share of the image's pixels, 0 to 1. */
  share: number;
}

interface Box {
  pixels: number[][];
}

/**
 * The `count` main colours of RGBA pixel data, most common first. Transparent
 * pixels are skipped; `step` samples every nth pixel to keep big images fast.
 */
export function extractPalette(data: Uint8ClampedArray | Uint8Array, count: number, step = 1): Swatch[] {
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 128) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) return [];
  const boxes: Box[] = [{ pixels }];
  while (boxes.length < count) {
    // Split the box with the widest colour range, at the median of that channel.
    let best = -1;
    let bestRange = 0;
    let bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.pixels.length < 2) return;
      for (let channel = 0; channel < 3; channel++) {
        let min = 255;
        let max = 0;
        for (const p of box.pixels) {
          if (p[channel] < min) min = p[channel];
          if (p[channel] > max) max = p[channel];
        }
        // Weight by size so big, varied areas split before tiny ones.
        const range = (max - min) * Math.sqrt(box.pixels.length);
        if (range > bestRange) {
          bestRange = range;
          best = index;
          bestChannel = channel;
        }
      }
    });
    if (best < 0) break;
    // Split at the middle of the colour range, so two clear colours never get mixed;
    // fall back to the median when everything sits on one side.
    const sorted = boxes[best].pixels.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const cut = (sorted[0][bestChannel] + sorted[sorted.length - 1][bestChannel]) / 2;
    let middle = sorted.findIndex((p) => p[bestChannel] > cut);
    if (middle <= 0 || middle >= sorted.length) middle = Math.floor(sorted.length / 2);
    boxes.splice(best, 1, { pixels: sorted.slice(0, middle) }, { pixels: sorted.slice(middle) });
  }
  const total = pixels.length;
  return boxes
    .filter((box) => box.pixels.length)
    .map((box) => {
      const sum = box.pixels.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
      const n = box.pixels.length;
      return { r: Math.round(sum[0] / n), g: Math.round(sum[1] / n), b: Math.round(sum[2] / n), share: n / total };
    })
    .sort((a, b) => b.share - a.share);
}

export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function toHsl({ r, g, b }: { r: number; g: number; b: number }): string {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h *= 60;
  }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** Dark text on light colours, white on dark ones. */
export function textOn({ r, g, b }: { r: number; g: number; b: number }): string {
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111827' : '#ffffff';
}

export type ExportFormat = 'css' | 'scss' | 'tailwind' | 'json';

/** The palette as code to paste into a project. */
export function exportPalette(swatches: readonly Swatch[], format: ExportFormat): string {
  const hexes = swatches.map(toHex);
  switch (format) {
    case 'css':
      return `:root {\n${hexes.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}\n`;
    case 'scss':
      return hexes.map((h, i) => `$color-${i + 1}: ${h};`).join('\n') + '\n';
    case 'tailwind':
      return `// tailwind.config.js → theme.extend.colors\npalette: {\n${hexes.map((h, i) => `  ${(i + 1) * 100}: '${h}',`).join('\n')}\n},\n`;
    case 'json':
      return JSON.stringify(hexes, null, 2) + '\n';
  }
}
