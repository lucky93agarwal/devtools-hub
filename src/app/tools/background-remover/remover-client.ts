import { DestroyRef, Injectable, inject } from '@angular/core';
import { MESSAGES, maxOutputSide } from './bg-removal';
import type { WorkerMessage } from './bg-removal.worker';

export type RemoveProgress = { stage: 'model'; fraction: number } | { stage: 'removing' };

export interface RemoveResult {
  /** Full-size result for the download. */
  png: Blob;
  /** Small versions for the before/after preview. */
  beforePreview: Blob;
  afterPreview: Blob;
  width: number;
  height: number;
  /** Size of the uploaded image; larger than width/height when it was scaled down. */
  sourceWidth: number;
  sourceHeight: number;
  ms: number;
}

/** Rejection messages that mean "stopped on purpose", not a failure to show. */
export const REPLACED = 'Replaced by a newer image.';
export const CANCELLED = 'Cancelled.';

/** How large a result this device can handle, from its memory and whether it is a touch device. */
function deviceMaxSide(): number {
  if (typeof navigator === 'undefined') return maxOutputSide({ coarsePointer: false });
  return maxOutputSide({
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  });
}

/**
 * Talks to the background removal Web Worker. The worker keeps the model loaded,
 * so only the first image downloads it. One image is processed at a time.
 */
@Injectable({ providedIn: 'root' })
export class RemoverClient {
  private worker?: Worker;
  private nextId = 0;
  private pending?: {
    id: number;
    onProgress: (progress: RemoveProgress) => void;
    resolve: (result: RemoveResult) => void;
    reject: (error: Error) => void;
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.worker?.terminate());
  }

  remove(file: Blob, onProgress: (progress: RemoveProgress) => void): Promise<RemoveResult> {
    const worker = this.getWorker();
    // A new image replaces one still in progress.
    this.pending?.reject(new Error(REPLACED));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending = { id, onProgress, resolve, reject };
      worker.postMessage({ id, file, maxSide: deviceMaxSide() });
    });
  }

  /**
   * Stops the image in progress. The model cannot be interrupted, so the worker is
   * closed; the next image starts a new one, which loads the model from the browser cache.
   */
  cancel(): void {
    if (!this.pending) return;
    this.pending.reject(new Error(CANCELLED));
    this.pending = undefined;
    this.stopWorker();
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./bg-removal.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      const pending = this.pending;
      if (!pending || data.id !== pending.id) return;
      if (data.type === 'progress') {
        pending.onProgress(data.stage === 'model' ? { stage: 'model', fraction: data.fraction } : { stage: 'removing' });
      } else if (data.type === 'done') {
        this.pending = undefined;
        const { id, type, ...result } = data;
        pending.resolve(result);
      } else {
        this.pending = undefined;
        pending.reject(new Error(data.message));
      }
    };
    // The worker dies without a message when the browser stops it, nearly always for memory.
    this.worker.onerror = () => {
      this.pending?.reject(new Error(MESSAGES.memory));
      this.pending = undefined;
      this.stopWorker();
    };
    return this.worker;
  }
}
