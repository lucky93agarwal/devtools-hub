/**
 * Background removal on the user's own device with ONNX Runtime Web (MIT licence).
 * The image never leaves the browser.
 *
 * Day 19 findings (Chrome 152 on an Apple M-series Mac):
 * - BiRefNet_lite (MIT, 109 MB fp16, fixed 1024x1024 input) does not run in the browser:
 *   the native WebGPU engine needs 11 storage buffers per shader where Apple GPUs allow 10,
 *   and the CPU and JSEP paths run out of WebAssembly memory.
 * - U2-Netp (Apache-2.0, 4.6 MB, 320x320 input) runs on the CPU, and both the model and
 *   the runtime fit under Cloudflare's 25 MiB file limit, so this site serves them itself.
 */

export interface ModelInfo {
  id: 'u2netp' | 'birefnet-lite';
  name: string;
  licence: string;
  url: string;
  bytes: number;
  /** The model works on a square image of this size. */
  size: number;
  /** What the first output holds: raw scores, or probabilities from 0 to 1. */
  output: 'logits' | 'probability';
}

export const MODELS: Record<ModelInfo['id'], ModelInfo> = {
  u2netp: {
    id: 'u2netp',
    name: 'U2-Netp',
    licence: 'Apache-2.0',
    // Served by this site (public/models); from the rembg v0.0.0 release of the U-2-Net weights.
    url: '/models/u2netp.onnx',
    bytes: 4_574_861,
    size: 320,
    output: 'probability',
  },
  'birefnet-lite': {
    id: 'birefnet-lite',
    name: 'BiRefNet_lite (fp16)',
    licence: 'MIT',
    // Pinned to one commit so the file never changes under us.
    url:
      'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/' +
      'de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model_fp16.onnx',
    bytes: 114_538_221,
    size: 1024,
    output: 'logits',
  },
};

/** ONNX Runtime's WebAssembly files, copied into the build by angular.json. */
export const ORT_WASM_BASE = '/ort/';

const CACHE_NAME = 'background-remover-models-v1';

/** ImageNet mean and standard deviation, which both models were trained with. */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface Remover {
  model: ModelInfo;
  /** Returns a PNG of the image with a transparent background, plus the time the model took. */
  remove(image: ImageBitmap): Promise<{ png: Blob; inferenceMs: number }>;
}

/** Gets the model bytes, from the browser cache when possible, reporting progress from 0 to 1. */
export async function downloadModel(model: ModelInfo, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME) : undefined;
  const cached = await cache?.match(model.url);
  if (cached) {
    onProgress(1);
    return new Uint8Array(await cached.arrayBuffer());
  }

  const response = await fetch(model.url);
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || model.bytes;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(received / total, 1));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  await cache?.put(model.url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  return bytes;
}

/** Loads ONNX Runtime (CPU, WebAssembly) and the model. */
export async function createRemover(info: ModelInfo, modelBytes: Uint8Array): Promise<Remover> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.wasmPaths = ORT_WASM_BASE;
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
  const inputIsHalf = session.inputMetadata[0].isTensor && session.inputMetadata[0].type === 'float16';
  const size = info.size;

  return {
    model: info,
    async remove(image: ImageBitmap) {
      const pixels = toInputTensor(image, size);
      const tensor = inputIsHalf
        ? new ort.Tensor('float16', toHalf(pixels), [1, 3, size, size])
        : new ort.Tensor('float32', pixels, [1, 3, size, size]);
      const started = performance.now();
      const outputs = await session.run({ [session.inputNames[0]]: tensor });
      const inferenceMs = performance.now() - started;
      const output = outputs[session.outputNames[0]];
      const raw = output.type === 'float16' ? fromHalf(output.data as Uint16Array) : (output.data as Float32Array);
      return { png: await cutOut(image, toAlpha(raw, info.output), size), inferenceMs };
    },
  };
}

/** Scales the image to the model size and turns it into normalised RGB planes (CHW). */
function toInputTensor(image: ImageBitmap, size: number): Float32Array {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/**
 * Turns the model output into alpha values from 0 to 255. Probabilities are stretched
 * to the full range, as rembg does for U2-Net; logits go through a sigmoid.
 */
export function toAlpha(values: Float32Array, kind: ModelInfo['output']): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(values.length);
  if (kind === 'logits') {
    for (let i = 0; i < values.length; i++) alpha[i] = 255 / (1 + Math.exp(-values[i]));
    return alpha;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < values.length; i++) alpha[i] = ((values[i] - min) / range) * 255;
  return alpha;
}

/** Uses the mask as the alpha channel of the original image, at full size. */
async function cutOut(image: ImageBitmap, alpha: Uint8ClampedArray, size: number): Promise<Blob> {
  const mask = new OffscreenCanvas(size, size);
  const maskContext = mask.getContext('2d')!;
  const maskPixels = maskContext.createImageData(size, size);
  for (let i = 0; i < alpha.length; i++) maskPixels.data[i * 4 + 3] = alpha[i];
  maskContext.putImageData(maskPixels, 0, 0);

  const result = new OffscreenCanvas(image.width, image.height);
  const context = result.getContext('2d')!;
  context.drawImage(image, 0, 0);
  // Keep the image only where the (smoothly scaled) mask is opaque.
  context.globalCompositeOperation = 'destination-in';
  context.imageSmoothingQuality = 'high';
  context.drawImage(mask, 0, 0, image.width, image.height);
  return result.convertToBlob({ type: 'image/png' });
}

/** float32 to IEEE 754 half precision, as ONNX Runtime expects for float16 inputs. */
export function toHalf(values: Float32Array): Uint16Array {
  const out = new Uint16Array(values.length);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let i = 0; i < values.length; i++) {
    f32[0] = values[i];
    const x = u32[0];
    const sign = (x >>> 16) & 0x8000;
    const exponent = ((x >>> 23) & 0xff) - 127 + 15;
    const mantissa = x & 0x7fffff;
    if (exponent <= 0) out[i] = sign; // too small: zero
    else if (exponent >= 31) out[i] = sign | 0x7c00; // too large: infinity
    else out[i] = sign | (exponent << 10) | (mantissa >>> 13);
  }
  return out;
}

/** IEEE 754 half precision to float32. */
export function fromHalf(values: Uint16Array): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const h = values[i];
    const sign = h & 0x8000 ? -1 : 1;
    const exponent = (h >>> 10) & 0x1f;
    const mantissa = h & 0x3ff;
    out[i] =
      exponent === 0
        ? sign * 2 ** -14 * (mantissa / 1024)
        : exponent === 31
          ? sign * Infinity
          : sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
  }
  return out;
}
