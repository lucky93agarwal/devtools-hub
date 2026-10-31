import { SAMPLE_MAP, SAMPLE_TRACE } from './samples';
import { Frame, loadMaps, mapFrame, parseFrames, rewriteTrace } from './stack';

describe('stack', () => {
  it('reads Chrome and Firefox style frames', () => {
    const items = parseFrames('Error: x\n    at fn (https://a.dev/app.js:10:5)\n    at https://a.dev/app.js:1:2\nfn@https://a.dev/app.js:3:4');
    expect(items[0]).toBe('Error: x');
    expect(items.slice(1)).toEqual([
      { raw: '    at fn (https://a.dev/app.js:10:5)', fn: 'fn', file: 'https://a.dev/app.js', line: 10, column: 5 },
      { raw: '    at https://a.dev/app.js:1:2', fn: null, file: 'https://a.dev/app.js', line: 1, column: 2 },
      { raw: 'fn@https://a.dev/app.js:3:4', fn: 'fn', file: 'https://a.dev/app.js', line: 3, column: 4 },
    ]);
  });

  it('maps a real minified esbuild trace back to cart.ts', () => {
    const loaded = loadMaps([{ name: 'main-ABC123.js.map', text: SAMPLE_MAP }]);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const items = parseFrames(SAMPLE_TRACE);
    const frames = items.filter((i): i is Frame => typeof i !== 'string');
    const mapped = new Map(frames.map((f) => [f, mapFrame(f, loaded.consumers)]));
    const first = mapped.get(frames[0])!;
    expect(first.source).toMatch(/cart\.ts$/);
    expect(first.line).toBe(4);
    expect(first.snippet?.find((s) => s.current)?.text).toContain('items.reduce');
    expect(mapped.get(frames[1])!.line).toBe(8);
    expect(rewriteTrace(items, mapped).split('\n')[1]).toMatch(/^ {4}at \S+ \(.*cart\.ts:4:\d+\)$/);
  });

  it('explains maps that do not fit', () => {
    expect(loadMaps([{ name: 'x.map', text: 'nope' }])).toMatchObject({ ok: false });
    expect(loadMaps([{ name: 'x.map', text: '{"version":2}' }])).toMatchObject({ ok: false });
    const loaded = loadMaps([{ name: 'main-ABC123.js.map', text: SAMPLE_MAP }, { name: 'other.js.map', text: SAMPLE_MAP.replace('main-ABC123.js', 'other.js') }]);
    if (!loaded.ok) throw new Error();
    expect(mapFrame({ raw: '', fn: null, file: 'vendor.js', line: 1, column: 1 }, loaded.consumers).problem).toBe('No source map for vendor.js.');
  });
});
