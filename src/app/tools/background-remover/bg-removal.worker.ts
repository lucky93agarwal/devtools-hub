/// <reference lib="webworker" />
// Runs background removal off the main thread, so the page stays responsive while
// the model works (a few seconds on a laptop, longer on phones).
import { MODELS, Remover, createRemover, downloadModel } from './bg-removal';

export type WorkerRequest = { id: number; file: Blob };

export type WorkerMessage =
  | { id: number; type: 'progress'; stage: 'model'; fraction: number }
  | { id: number; type: 'progress'; stage: 'removing' }
  | { id: number; type: 'done'; png: Blob; width: number; height: number; ms: number }
  | { id: number; type: 'error'; message: string };

let remover: Promise<Remover> | undefined;
/** The request being worked on; download progress is reported to it even if it started for an earlier one. */
let currentId = 0;

const post = (message: WorkerMessage) => postMessage(message);

addEventListener('message', async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, file } = data;
  currentId = id;
  try {
    remover ??= (async () => {
      const model = MODELS.u2netp;
      const bytes = await downloadModel(model, (fraction) => post({ id: currentId, type: 'progress', stage: 'model', fraction }));
      return createRemover(model, bytes);
    })();
    let ready: Remover;
    try {
      ready = await remover;
    } catch (e) {
      remover = undefined; // let the next request try again
      throw e;
    }

    post({ id, type: 'progress', stage: 'removing' });
    let image: ImageBitmap;
    try {
      image = await createImageBitmap(file);
    } catch {
      throw new Error('This image could not be read. The file may be damaged.');
    }
    const started = performance.now();
    const { png } = await ready.remove(image);
    post({ id, type: 'done', png, width: image.width, height: image.height, ms: performance.now() - started });
    image.close();
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
});
