/// <reference lib="webworker" />
// Estimates depth off the main thread: downloads the model once (kept in the
// browser cache), then runs it on the image the page sends.
import { DEPTH_MODEL, joinParts, normaliseDepth, toTensorData } from './depth';

export type DepthRequest = { id: number; rgba: Uint8ClampedArray; width: number; height: number };
export type DepthResponse =
  | { kind: 'model'; fraction: number }
  | { kind: 'working' }
  | { kind: 'done'; id: number; depth: Uint8ClampedArray; width: number; height: number; ms: number }
  | { kind: 'error'; id: number; message: string };

const CACHE = 'photo-3d-models-v1';
type Session = import('onnxruntime-web').InferenceSession;
let session: Promise<Session> | null = null;

async function modelBytes(): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(DEPTH_MODEL.cacheKey);
    if (hit) {
      postMessage({ kind: 'model', fraction: 1 } satisfies DepthResponse);
      return new Uint8Array(await hit.arrayBuffer());
    }
  } catch {
    cache = undefined;
  }
  const parts: Uint8Array[] = [];
  let received = 0;
  for (const url of DEPTH_MODEL.parts) {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`The 3D model could not be downloaded (error ${response.status}).`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      postMessage({ kind: 'model', fraction: Math.min(1, received / DEPTH_MODEL.bytes) } satisfies DepthResponse);
    }
    parts.push(joinParts(chunks));
  }
  if (received !== DEPTH_MODEL.bytes) throw new Error('The 3D model download stopped early. Check your connection and try again.');
  const bytes = joinParts(parts);
  try {
    await cache?.put(DEPTH_MODEL.cacheKey, new Response(bytes as Uint8Array<ArrayBuffer>));
  } catch {
    // No room or not allowed: it still works, and downloads again next time.
  }
  return bytes;
}

async function createSession(): Promise<Session> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.wasmPaths = '/ort/';
  return ort.InferenceSession.create(await modelBytes(), { executionProviders: ['wasm'] });
}

addEventListener('message', async ({ data }: MessageEvent<DepthRequest>) => {
  try {
    session ??= createSession();
    const ready = await session;
    postMessage({ kind: 'working' } satisfies DepthResponse);
    const ort = await import('onnxruntime-web/wasm');
    const input = new ort.Tensor('float32', toTensorData(data.rgba, data.width, data.height), [1, 3, data.height, data.width]);
    const started = performance.now();
    const outputs = await ready.run({ [ready.inputNames[0]]: input });
    const output = outputs[ready.outputNames[0]];
    // Output is [1, H, W] (or [1, 1, H, W]) at the input size.
    const dims = output.dims;
    const height = dims[dims.length - 2];
    const width = dims[dims.length - 1];
    const depth = normaliseDepth(output.data as Float32Array);
    postMessage({ kind: 'done', id: data.id, depth, width, height, ms: performance.now() - started } satisfies DepthResponse, [depth.buffer]);
  } catch (e) {
    session = null;
    postMessage({ kind: 'error', id: data.id, message: e instanceof Error ? e.message : 'Depth could not be worked out.' } satisfies DepthResponse);
  }
});
