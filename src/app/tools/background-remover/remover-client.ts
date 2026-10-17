import { DestroyRef, Injectable, inject } from '@angular/core';
import type { WorkerMessage } from './bg-removal.worker';

export type RemoveProgress = { stage: 'model'; fraction: number } | { stage: 'removing' };

export interface RemoveResult {
  png: Blob;
  width: number;
  height: number;
  ms: number;
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
    this.pending?.reject(new Error('Replaced by a newer image.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending = { id, onProgress, resolve, reject };
      worker.postMessage({ id, file });
    });
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
        pending.resolve({ png: data.png, width: data.width, height: data.height, ms: data.ms });
      } else {
        this.pending = undefined;
        pending.reject(new Error(data.message));
      }
    };
    this.worker.onerror = () => {
      this.pending?.reject(new Error('The background remover stopped unexpectedly. Reload the page and try again.'));
      this.pending = undefined;
      this.worker?.terminate();
      this.worker = undefined;
    };
    return this.worker;
  }
}
