/**
 * Exemplar-based inpainting (after Criminisi, Pérez and Toyama, 2004): the hole
 * is filled from its edge inwards, each time copying the best-matching patch
 * of nearby known pixels. It handles textures such as grass, sky, walls and
 * plain backgrounds well, without any AI model.
 */

export interface InpaintOptions {
  /** Patch size is 2 × radius + 1 pixels. */
  patchRadius?: number;
  /** Source patches are searched within this many pixels of the hole. */
  searchMargin?: number;
  /** Check every nth candidate position, for speed. */
  searchStep?: number;
}

/**
 * Fills the pixels where `mask` is 1, in place. `data` is RGBA, `mask` has one
 * byte per pixel. Returns the number of patches copied.
 */
export function inpaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  options: InpaintOptions = {},
): number {
  const r = options.patchRadius ?? 4;
  const margin = options.searchMargin ?? 60;
  const step = options.searchStep ?? 2;
  const unknown = Uint8Array.from(mask, (m) => (m ? 1 : 0));
  const confidence = Float32Array.from(unknown, (u) => (u ? 0 : 1));

  // Bounding box of the hole; the search looks only around it.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let remaining = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (unknown[y * width + x]) {
        remaining++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!remaining) return 0;
  const sx0 = Math.max(r, minX - margin);
  const sy0 = Math.max(r, minY - margin);
  const sx1 = Math.min(width - r - 1, maxX + margin);
  const sy1 = Math.min(height - r - 1, maxY + margin);

  // Source patches must be entirely known; precompute which centres qualify.
  const validSource = (cx: number, cy: number): boolean => {
    for (let dy = -r; dy <= r; dy++) {
      const row = (cy + dy) * width;
      for (let dx = -r; dx <= r; dx++) if (mask[row + cx + dx]) return false;
    }
    return true;
  };
  const sources: number[] = [];
  for (let y = sy0; y <= sy1; y += step) for (let x = sx0; x <= sx1; x += step) if (validSource(x, y)) sources.push(x, y);
  if (!sources.length) {
    diffuse(data, width, height, unknown);
    return 0;
  }

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  let copies = 0;
  // A safety cap; each copy fills at least one pixel.
  const maxCopies = remaining + 10;
  while (remaining > 0 && copies < maxCopies) {
    // Pick the front pixel (unknown, next to a known one) whose patch is most known.
    let best = -1;
    let bestPriority = -1;
    for (let y = Math.max(0, minY - 1); y <= Math.min(height - 1, maxY + 1); y++) {
      for (let x = Math.max(0, minX - 1); x <= Math.min(width - 1, maxX + 1); x++) {
        const i = y * width + x;
        if (!unknown[i]) continue;
        const onFront =
          (x > 0 && !unknown[i - 1]) || (x < width - 1 && !unknown[i + 1]) || (y > 0 && !unknown[i - width]) || (y < height - 1 && !unknown[i + width]);
        if (!onFront) continue;
        let sum = 0;
        let count = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (!inside(px, py)) continue;
            sum += confidence[py * width + px];
            count++;
          }
        }
        const priority = sum / count;
        if (priority > bestPriority) {
          bestPriority = priority;
          best = i;
        }
      }
    }
    if (best < 0) break;
    const tx = best % width;
    const ty = (best - tx) / width;

    // Find the known patch that best matches the known pixels around the target.
    let bestSource = 0;
    let bestScore = Infinity;
    for (let s = 0; s < sources.length; s += 2) {
      const cx = sources[s];
      const cy = sources[s + 1];
      let score = 0;
      for (let dy = -r; dy <= r && score < bestScore; dy++) {
        const ty2 = ty + dy;
        if (ty2 < 0 || ty2 >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const tx2 = tx + dx;
          if (tx2 < 0 || tx2 >= width) continue;
          const t = ty2 * width + tx2;
          if (unknown[t]) continue;
          const a = t * 4;
          const b = ((cy + dy) * width + cx + dx) * 4;
          const d0 = data[a] - data[b];
          const d1 = data[a + 1] - data[b + 1];
          const d2 = data[a + 2] - data[b + 2];
          score += d0 * d0 + d1 * d1 + d2 * d2;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        bestSource = s;
      }
    }
    const cx = sources[bestSource];
    const cy = sources[bestSource + 1];

    // Copy the unknown pixels of the target patch from the source patch.
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = tx + dx;
        const py = ty + dy;
        if (!inside(px, py)) continue;
        const t = py * width + px;
        if (!unknown[t]) continue;
        const a = t * 4;
        const b = ((cy + dy) * width + cx + dx) * 4;
        data[a] = data[b];
        data[a + 1] = data[b + 1];
        data[a + 2] = data[b + 2];
        data[a + 3] = 255;
        unknown[t] = 0;
        confidence[t] = bestPriority;
        remaining--;
      }
    }
    copies++;
  }
  if (remaining > 0) diffuse(data, width, height, unknown);
  return copies;
}

/** Fallback: fills holes with the average of known neighbours, repeated until full. */
export function diffuse(data: Uint8ClampedArray, width: number, height: number, unknown: Uint8Array): void {
  let left = unknown.reduce((n, u) => n + u, 0);
  while (left > 0) {
    const filled: number[] = [];
    for (let i = 0; i < unknown.length; i++) {
      if (!unknown[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j < 0 || unknown[j]) continue;
        r += data[j * 4];
        g += data[j * 4 + 1];
        b += data[j * 4 + 2];
        n++;
      }
      if (n) {
        data[i * 4] = r / n;
        data[i * 4 + 1] = g / n;
        data[i * 4 + 2] = b / n;
        data[i * 4 + 3] = 255;
        filled.push(i);
      }
    }
    if (!filled.length) break;
    for (const i of filled) unknown[i] = 0;
    left -= filled.length;
  }
}

/** Grows a mask by `radius` pixels, so the fill covers the soft edge around an object. */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const py = y + dy;
        if (py < 0 || py >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const px = x + dx;
          if (px >= 0 && px < width && dx * dx + dy * dy <= radius * radius) out[py * width + px] = 1;
        }
      }
    }
  }
  return out;
}
