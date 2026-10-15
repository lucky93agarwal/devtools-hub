import { TestBed } from '@angular/core/testing';
import { JsonRunner, WORKER_THRESHOLD } from './json-runner';
import { JsonJob } from './json-tools';

/** Minimal stand-in for a browser Worker that answers like json.worker.ts. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  posted: { id: number; job: JsonJob }[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: { id: number; job: JsonJob }): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(id: number, result: unknown): void {
    this.onmessage?.({ data: { id, result } } as MessageEvent);
  }
}

const bigArray = () => `[${'1,'.repeat(WORKER_THRESHOLD / 2)}1]`;

describe('JsonRunner', () => {
  const realWorker = globalThis.Worker;

  beforeEach(() => {
    FakeWorker.instances = [];
    (globalThis as { Worker: unknown }).Worker = FakeWorker;
  });

  afterEach(() => {
    (globalThis as { Worker: unknown }).Worker = realWorker;
  });

  it('runs small inputs on the page without a worker', async () => {
    const runner = TestBed.inject(JsonRunner);
    const result = await runner.run({ op: 'minify', text: '[1, 2]', indent: 2 });
    expect(result).toEqual({ ok: true, output: '[1,2]' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('sends large inputs to one shared worker and matches replies by id', async () => {
    const runner = TestBed.inject(JsonRunner);
    const first = runner.run({ op: 'minify', text: bigArray(), indent: 2 });
    const second = runner.run({ op: 'format', text: bigArray(), indent: 2 });

    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker.posted.map((m) => m.job.op)).toEqual(['minify', 'format']);

    // Replies can arrive in any order.
    worker.reply(worker.posted[1].id, { ok: true, output: 'second' });
    worker.reply(worker.posted[0].id, { ok: true, output: 'first' });
    expect(await first).toEqual({ ok: true, output: 'first' });
    expect(await second).toEqual({ ok: true, output: 'second' });
  });

  it('finishes waiting jobs on the page if the worker fails', async () => {
    const runner = TestBed.inject(JsonRunner);
    const pending = runner.run({ op: 'minify', text: bigArray(), indent: 2 });
    const worker = FakeWorker.instances[0];
    worker.onerror?.();

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it('works without Worker support', async () => {
    (globalThis as { Worker: unknown }).Worker = undefined;
    const runner = TestBed.inject(JsonRunner);
    const result = await runner.run({ op: 'minify', text: bigArray(), indent: 2 });
    expect(result.ok).toBe(true);
  });
});
