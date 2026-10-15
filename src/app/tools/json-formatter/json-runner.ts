import { DestroyRef, Injectable, inject } from '@angular/core';
import { JsonJob, JsonResult, runJsonJob } from './json-tools';

/**
 * Inputs at least this long (about 100 KB) go to the Web Worker. Smaller ones run
 * right away on the page, which is faster than the round trip to a worker.
 */
export const WORKER_THRESHOLD = 100_000;

/** Runs JSON jobs, using a Web Worker for large inputs when the browser has one. */
@Injectable({ providedIn: 'root' })
export class JsonRunner {
  private worker?: Worker;
  private nextId = 0;
  private readonly pending = new Map<number, { job: JsonJob; resolve: (result: JsonResult) => void }>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.worker?.terminate());
  }

  run(job: JsonJob): Promise<JsonResult> {
    const worker = job.text.length >= WORKER_THRESHOLD ? this.getWorker() : undefined;
    if (!worker) return Promise.resolve(runJsonJob(job));

    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, { job, resolve });
      worker.postMessage({ id, job });
    });
  }

  private getWorker(): Worker | undefined {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return undefined;
    try {
      this.worker = new Worker(new URL('./json.worker', import.meta.url), { type: 'module' });
    } catch {
      return undefined;
    }
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; result: JsonResult }>) => {
      this.pending.get(data.id)?.resolve(data.result);
      this.pending.delete(data.id);
    };
    // If the worker fails, finish the waiting jobs on the page instead of hanging.
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = undefined;
      for (const { job, resolve } of this.pending.values()) resolve(runJsonJob(job));
      this.pending.clear();
    };
    return this.worker;
  }
}
