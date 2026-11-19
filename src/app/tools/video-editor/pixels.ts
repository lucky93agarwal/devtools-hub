/** Per-pixel effects that canvas filters cannot do: green screen and sharpening. */

/** Makes pixels close to `key` see-through. `similarity` is 0..100; edges are softened. */
export function chromaKey(data: Uint8ClampedArray, key: [number, number, number], similarity: number): void {
  const limit = (similarity / 100) * 255;
  const soft = limit * 0.35;
  const [kr, kg, kb] = key;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - kr;
    const dg = data[i + 1] - kg;
    const db = data[i + 2] - kb;
    const distance = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
    if (distance < limit) data[i + 3] = 0;
    else if (distance < limit + soft) data[i + 3] = Math.round((data[i + 3] * (distance - limit)) / soft);
    // Remove the green tint that spills onto the edges.
    if (data[i + 3] > 0 && kg > kr && kg > kb && data[i + 1] > Math.max(data[i], data[i + 2])) {
      data[i + 1] = Math.max(data[i], data[i + 2]);
    }
  }
}

/** Unsharp-style sharpening with a 3×3 kernel; `amount` 0..100. Returns new pixels. */
export function sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  const k = amount / 100;
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const centre = data[i + c];
        const around = data[i - 4 + c] + data[i + 4 + c] + data[i - width * 4 + c] + data[i + width * 4 + c];
        out[i + c] = centre + k * (4 * centre - around);
      }
    }
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The colour effects (as in effectsFilter) done on pixels, for browsers without canvas filters (Safari). */
export function colourEffects(
  data: Uint8ClampedArray,
  e: { brightness: number; contrast: number; saturation: number; grayscale: number; sepia: number; invert: number; hue: number },
): void {
  const b = e.brightness / 100;
  const c = e.contrast / 100;
  const s = e.saturation / 100;
  const g = e.grayscale / 100;
  const sp = e.sepia / 100;
  const inv = e.invert / 100;
  const angle = (e.hue * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Hue rotation matrix, as the CSS filter specification defines it.
  const h = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let gr = data[i + 1];
    let bl = data[i + 2];
    r *= b; gr *= b; bl *= b;
    r = (r - 128) * c + 128; gr = (gr - 128) * c + 128; bl = (bl - 128) * c + 128;
    const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * bl;
    r = lum + (r - lum) * s; gr = lum + (gr - lum) * s; bl = lum + (bl - lum) * s;
    if (g) {
      const l = 0.2126 * r + 0.7152 * gr + 0.0722 * bl;
      r += (l - r) * g; gr += (l - gr) * g; bl += (l - bl) * g;
    }
    if (sp) {
      const sr = 0.393 * r + 0.769 * gr + 0.189 * bl;
      const sg = 0.349 * r + 0.686 * gr + 0.168 * bl;
      const sb = 0.272 * r + 0.534 * gr + 0.131 * bl;
      r += (sr - r) * sp; gr += (sg - gr) * sp; bl += (sb - bl) * sp;
    }
    if (e.hue) {
      const nr = h[0] * r + h[1] * gr + h[2] * bl;
      const ng = h[3] * r + h[4] * gr + h[5] * bl;
      const nb = h[6] * r + h[7] * gr + h[8] * bl;
      r = nr; gr = ng; bl = nb;
    }
    if (inv) {
      r += (255 - 2 * r) * inv; gr += (255 - 2 * gr) * inv; bl += (255 - 2 * bl) * inv;
    }
    data[i] = r;
    data[i + 1] = gr;
    data[i + 2] = bl;
  }
}
