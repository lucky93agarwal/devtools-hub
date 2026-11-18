/**
 * Depth estimation with Depth Anything V2 Small (Apache-2.0), run on the CPU with
 * ONNX Runtime Web. The model is served by this site in two parts, because the
 * host allows files of up to 25 MiB, and joined in the browser.
 */

export const DEPTH_MODEL = {
  name: 'Depth Anything V2 Small',
  parts: ['/models/depth-anything-v2-small-int8.onnx.part0', '/models/depth-anything-v2-small-int8.onnx.part1'],
  bytes: 27_258_801,
  /** Cache key for the joined file. */
  cacheKey: '/models/depth-anything-v2-small-int8.onnx',
};

/** The model's patch size: input sides must be multiples of 14. */
const PATCH = 14;
/** Longest input side; 518 is what the model was trained on. */
export const DEPTH_SIDE = 518;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Model input size for an image: the longer side 518, both sides multiples of 14. */
export function inputSize(width: number, height: number, longest = DEPTH_SIDE): { width: number; height: number } {
  const scale = longest / Math.max(width, height);
  const round = (v: number) => Math.max(PATCH, Math.round((v * scale) / PATCH) * PATCH);
  return { width: round(width), height: round(height) };
}

/** RGBA pixels (already at the input size) as normalised RGB planes, as the model wants them. */
export function toTensorData(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

/**
 * The model output (relative inverse depth: bigger is nearer) as bytes from 0 (far)
 * to 255 (near). The extreme 1% at each end is ignored, so one odd pixel does not
 * squash the range.
 */
export function normaliseDepth(values: Float32Array): Uint8ClampedArray {
  const sorted = Float32Array.from(values).sort();
  const low = sorted[Math.floor(sorted.length * 0.01)];
  const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  const range = high - low || 1;
  const out = new Uint8ClampedArray(values.length);
  for (let i = 0; i < values.length; i++) out[i] = ((values[i] - low) / range) * 255;
  return out;
}

/** Joins downloaded parts into one buffer. */
export function joinParts(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
