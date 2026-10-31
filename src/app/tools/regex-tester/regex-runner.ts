import { RunResult, run } from './regex';

/** How long a pattern may run before the worker is stopped. */
export const TIME_LIMIT_MS = 1500;

export type RunOutcome = { ok: true; result: RunResult } | { ok: false; error: string; timedOut: boolean };

/**
 * Runs patterns in a Web Worker and stops it when a pattern takes too long, which happens with
 * catastrophic backtracking such as (a+)+$. Without workers (tests, old browsers) it runs on the page.
 */
export class RegexRunner {
  private worker?: Worker;
  private nextId = 0;
  private pending?: { id: number; resolve: (outcome: RunOutcome) => void; timer: ReturnType<typeof setTimeout> };

  run(pattern: string, flags: string, text: string, replacement: string | null): Promise<RunOutcome> {
    const worker = this.getWorker();
    if (!worker) {
      try {
        return Promise.resolve({ ok: true, result: run(pattern, flags, text, replacement) });
      } catch (error) {
        return Promise.resolve({ ok: false, error: (error as Error).message, timedOut: false });
      }
    }
    // A newer run replaces the one still waiting.
    this.settle({ ok: false, error: '', timedOut: false });
    const id = ++this.nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.worker?.terminate();
        this.worker = undefined;
        this.settle({
          ok: false,
          timedOut: true,
          error: `This pattern took more than ${TIME_LIMIT_MS / 1000} seconds and was stopped. Nested repeats such as (a+)+ can take forever on some text.`,
        });
      }, TIME_LIMIT_MS);
      this.pending = { id, resolve, timer };
      worker.postMessage({ id, pattern, flags, text, replacement });
    });
  }

  destroy(): void {
    this.worker?.terminate();
    if (this.pending) clearTimeout(this.pending.timer);
  }

  private settle(outcome: RunOutcome): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.resolve(outcome);
    this.pending = undefined;
  }

  private getWorker(): Worker | undefined {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return undefined;
    try {
      this.worker = new Worker(new URL('./regex.worker', import.meta.url), { type: 'module' });
    } catch {
      return undefined;
    }
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: RunResult; error?: string }>) => {
      if (data.id !== this.pending?.id) return;
      this.settle(data.result ? { ok: true, result: data.result } : { ok: false, error: data.error ?? 'Unknown error', timedOut: false });
    };
    return this.worker;
  }
}
