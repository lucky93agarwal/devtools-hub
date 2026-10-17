/// <reference lib="webworker" />
// Runs background removal off the main thread, so the page stays responsive while
// the model works (a few seconds on a laptop, longer on phones).
import {
  MIN_SIDE,
  MESSAGES,
  MODELS,
  PREVIEW_SIDE,
  Remover,
  RemoverError,
  createRemover,
  downloadModel,
  fitWithin,
  forgetModel,
  friendlyError,
} from './bg-removal';

/** maxSide: the result is scaled down to fit inside this many pixels (see maxOutputSide). */
export type WorkerRequest = { id: number; file: Blob; maxSide: number };

export type WorkerMessage =
  | { id: number; type: 'progress'; stage: 'model'; fraction: number }
  | { id: number; type: 'progress'; stage: 'removing' }
  | {
      id: number;
      type: 'done';
      /** Full-size result for the download. */
      png: Blob;
      /** Small versions for the before/after preview, so phones do not decode huge images twice. */
      beforePreview: Blob;
      afterPreview: Blob;
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
      ms: number;
    }
  | { id: number; type: 'error'; message: string };

let remover: Promise<Remover> | undefined;
/** The request being worked on; download progress is reported to it even if it started for an earlier one. */
let currentId = 0;

const post = (message: WorkerMessage) => postMessage(message);

/** Loads the model once; a failed load is forgotten so the next image tries again. */
async function getRemover(): Promise<Remover> {
  remover ??= (async () => {
    const model = MODELS.u2netp;
    const bytes = await downloadModel(model, (fraction) =>
      post({ id: currentId, type: 'progress', stage: 'model', fraction }),
    );
    try {
      return await createRemover(model, bytes);
    } catch (e) {
      // A damaged cached copy would fail every time, so download it again next time.
      await forgetModel(model);
      throw /memory|RangeError/i.test(String(e)) ? e : new RemoverError(MESSAGES.startFailed);
    }
  })();
  try {
    return await remover;
  } catch (e) {
    remover = undefined;
    throw e;
  }
}

/** Opens the image, scaled down to `maxSide` when it is larger. */
async function readImage(file: Blob, maxSide: number) {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new RemoverError('This image could not be read. The file may be damaged.');
  }
  const source = { width: image.width, height: image.height };
  if (source.width < MIN_SIDE || source.height < MIN_SIDE) {
    image.close();
    throw new RemoverError(
      `This image is only ${source.width}×${source.height} px. Use one at least ${MIN_SIDE} px on each side.`,
    );
  }
  const size = fitWithin(source.width, source.height, maxSide);
  if (size.width !== source.width) {
    const scaled = await createImageBitmap(scale(image, size.width, size.height));
    image.close();
    image = scaled;
  }
  return { image, source };
}

function scale(source: CanvasImageSource, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

addEventListener('message', async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, file, maxSide } = data;
  currentId = id;
  let image: ImageBitmap | undefined;
  try {
    // Check the image first, so a damaged file does not wait for the model download.
    const read = await readImage(file, maxSide);
    image = read.image;
    const ready = await getRemover();

    post({ id, type: 'progress', stage: 'removing' });
    const started = performance.now();
    const { result } = await ready.remove(image);
    const png = await result.convertToBlob({ type: 'image/png' });
    const preview = fitWithin(image.width, image.height, PREVIEW_SIDE);
    const beforePreview = await scale(image, preview.width, preview.height).convertToBlob({
      type: 'image/jpeg',
      quality: 0.85,
    });
    const afterPreview = await scale(result, preview.width, preview.height).convertToBlob({ type: 'image/png' });
    // Free the full-size pixels now rather than waiting for garbage collection.
    result.width = result.height = 0;
    post({
      id,
      type: 'done',
      png,
      beforePreview,
      afterPreview,
      width: image.width,
      height: image.height,
      sourceWidth: read.source.width,
      sourceHeight: read.source.height,
      ms: performance.now() - started,
    });
  } catch (e) {
    post({ id, type: 'error', message: friendlyError(e) });
  } finally {
    image?.close();
  }
});
