/**
 * Colour vision deficiency simulation with the Machado, Oliveira and Fernandes
 * (2009) matrices, applied in linear RGB as the paper describes.
 */

export type Vision = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export const VISIONS: readonly { id: Vision; label: string; note: string }[] = [
  { id: 'protanopia', label: 'Protanopia', note: 'No red cones. Reds look dark; red and green are confused. About 1% of men.' },
  { id: 'deuteranopia', label: 'Deuteranopia', note: 'No green cones. Red and green are confused. The most common type, about 1% of men (6% have a milder form).' },
  { id: 'tritanopia', label: 'Tritanopia', note: 'No blue cones. Blue and yellow are confused. Rare.' },
  { id: 'achromatopsia', label: 'Achromatopsia', note: 'No colour at all, only light and dark. Very rare.' },
];

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

const MATRICES: Record<Vision, Matrix> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

/** The matrix mixed with "normal vision" by severity (0 = normal, 1 = full deficiency). */
export function matrixFor(vision: Vision, severity: number): Matrix {
  const m = MATRICES[vision];
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return m.map((value, i) => identity[i] + (value - identity[i]) * severity) as unknown as Matrix;
}

let toLinear: Float32Array | null = null;

function linearTable(): Float32Array {
  if (!toLinear) {
    toLinear = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      toLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }
  }
  return toLinear;
}

function toSrgb(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
}

/** A new RGBA buffer showing the pixels as seen with the given vision. Alpha is kept. */
export function simulate(data: Uint8ClampedArray, vision: Vision, severity = 1): Uint8ClampedArray {
  const m = matrixFor(vision, severity);
  const lin = linearTable();
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = lin[data[i]];
    const g = lin[data[i + 1]];
    const b = lin[data[i + 2]];
    out[i] = toSrgb(m[0] * r + m[1] * g + m[2] * b);
    out[i + 1] = toSrgb(m[3] * r + m[4] * g + m[5] * b);
    out[i + 2] = toSrgb(m[6] * r + m[7] * g + m[8] * b);
    out[i + 3] = data[i + 3];
  }
  return out;
}
