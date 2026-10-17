import {
  MESSAGES,
  MODELS,
  RemoverError,
  downloadModel,
  fitWithin,
  friendlyError,
  fromHalf,
  maxOutputSide,
  toAlpha,
  toHalf,
} from './bg-removal';

describe('half precision', () => {
  it('round-trips ordinary values closely', () => {
    const values = new Float32Array([0, 1, -1, 0.5, 2.117, -1.804, 65504]);
    const back = fromHalf(toHalf(values));
    for (let i = 0; i < values.length; i++) expect(back[i]).toBeCloseTo(values[i], 2);
  });

  it('turns tiny values into zero and huge values into infinity', () => {
    const back = fromHalf(toHalf(new Float32Array([1e-9, 1e9, -1e9])));
    expect(Array.from(back)).toEqual([0, Infinity, -Infinity]);
  });
});

describe('toAlpha', () => {
  it('stretches probabilities to the full 0-255 range', () => {
    expect(Array.from(toAlpha(new Float32Array([0.2, 0.6, 1.0]), 'probability'))).toEqual([0, 128, 255]);
  });

  it('passes logits through a sigmoid', () => {
    expect(Array.from(toAlpha(new Float32Array([-10, 0, 10]), 'logits'))).toEqual([0, 128, 255]);
  });

  it('does not divide by zero on a flat mask', () => {
    expect(Array.from(toAlpha(new Float32Array([0.5, 0.5]), 'probability'))).toEqual([0, 0]);
  });
});

describe('MODELS', () => {
  it('only lists models with permissive licences', () => {
    for (const model of Object.values(MODELS)) expect(['MIT', 'Apache-2.0']).toContain(model.licence);
  });

  it('serves the default model from this site, under the 25 MiB file limit', () => {
    expect(MODELS.u2netp.url.startsWith('/')).toBe(true);
    expect(MODELS.u2netp.bytes).toBeLessThan(25 * 1024 * 1024);
  });
});

describe('maxOutputSide', () => {
  it('keeps phones and low-memory devices at 4096 px', () => {
    expect(maxOutputSide({ coarsePointer: true })).toBe(4096);
    expect(maxOutputSide({ coarsePointer: false, deviceMemory: 4 })).toBe(4096);
  });

  it('allows 8192 px on computers', () => {
    expect(maxOutputSide({ coarsePointer: false, deviceMemory: 8 })).toBe(8192);
    // Safari and Firefox do not report memory.
    expect(maxOutputSide({ coarsePointer: false })).toBe(8192);
  });
});

describe('fitWithin', () => {
  it('scales a 48 MP phone photo down, keeping its shape', () => {
    expect(fitWithin(8064, 6048, 4096)).toEqual({ width: 4096, height: 3072 });
  });

  it('never enlarges', () => {
    expect(fitWithin(800, 600, 4096)).toEqual({ width: 800, height: 600 });
  });
});

describe('friendlyError', () => {
  it('passes our own messages through', () => {
    expect(friendlyError(new RemoverError('This image is only 10×10 px.'))).toBe('This image is only 10×10 px.');
  });

  it('explains memory errors from the runtime', () => {
    expect(friendlyError(new RangeError('WebAssembly.Memory(): could not allocate memory'))).toBe(MESSAGES.memory);
    expect(friendlyError('Error: failed to allocate a buffer of size 4194304')).toBe(MESSAGES.memory);
  });

  it('explains network errors', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(MESSAGES.offline);
  });

  it('never shows raw technical text', () => {
    expect(friendlyError(new Error('ORT session run failed: 0x1f'))).toBe(MESSAGES.unknown);
  });
});

describe('downloadModel', () => {
  const model = { ...MODELS.u2netp, bytes: 6 };
  const original = { fetch: globalThis.fetch, caches: (globalThis as { caches?: CacheStorage }).caches };

  /** A response whose body arrives in the given chunks, then optionally fails. */
  function streamed(chunks: number[][], failAtEnd = false): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
        if (failAtEnd) controller.error(new TypeError('network error'));
        else controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  function fakeCache(put = vi.fn(async () => undefined)) {
    const cache = { match: vi.fn(async () => undefined), put, delete: vi.fn() };
    (globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => cache) };
    return cache;
  }

  afterEach(() => {
    globalThis.fetch = original.fetch;
    (globalThis as { caches?: unknown }).caches = original.caches;
  });

  it('reports progress and stores the model for next time', async () => {
    const cache = fakeCache();
    globalThis.fetch = vi.fn(async () => streamed([[1, 2, 3], [4, 5, 6]]));
    const progress: number[] = [];
    const bytes = await downloadModel(model, (f) => progress.push(f));
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress).toEqual([0.5, 1]);
    expect(cache.put).toHaveBeenCalled();
  });

  it('works in private windows that refuse the cache', async () => {
    (globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => Promise.reject(new DOMException('denied'))) };
    globalThis.fetch = vi.fn(async () => streamed([[1, 2, 3, 4, 5, 6]]));
    expect(await downloadModel(model, () => {})).toHaveLength(6);
  });

  it('still works when storage is full', async () => {
    fakeCache(vi.fn(async () => Promise.reject(new DOMException('QuotaExceededError'))));
    globalThis.fetch = vi.fn(async () => streamed([[1, 2, 3, 4, 5, 6]]));
    expect(await downloadModel(model, () => {})).toHaveLength(6);
  });

  it('explains being offline', async () => {
    fakeCache();
    globalThis.fetch = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(downloadModel(model, () => {})).rejects.toThrow(MESSAGES.offline);
  });

  it('explains a server error', async () => {
    fakeCache();
    globalThis.fetch = vi.fn(async () => new Response('busy', { status: 503 }));
    await expect(downloadModel(model, () => {})).rejects.toThrow('could not be downloaded (error 503)');
  });

  it('does not keep a download that stopped half way', async () => {
    const cache = fakeCache();
    globalThis.fetch = vi.fn(async () => streamed([[1, 2, 3]], true));
    await expect(downloadModel(model, () => {})).rejects.toThrow(MESSAGES.downloadStopped);
    // A stream that just ends early is caught too.
    globalThis.fetch = vi.fn(async () => streamed([[1, 2, 3]]));
    await expect(downloadModel(model, () => {})).rejects.toThrow(MESSAGES.downloadStopped);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
