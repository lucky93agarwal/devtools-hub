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
