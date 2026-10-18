import { PRESETS, layout, shrinkToSize } from './resize-math';

describe('layout', () => {
  it('scales by percent', () => {
    expect(layout(4000, 3000, { mode: 'percent', percent: 25 })).toMatchObject({ width: 1000, height: 750 });
  });

  it('works out the missing side from the shape', () => {
    expect(layout(4000, 3000, { mode: 'size', width: 800, height: null, fit: 'fit' })).toMatchObject({
      width: 800,
      height: 600,
    });
    expect(layout(4000, 3000, { mode: 'size', width: null, height: 300, fit: 'fit' })).toMatchObject({
      width: 400,
      height: 300,
    });
  });

  it('fits inside, keeping the shape', () => {
    expect(layout(4000, 3000, { mode: 'size', width: 1000, height: 1000, fit: 'fit' })).toMatchObject({
      width: 1000,
      height: 750,
    });
  });

  it('fills and cuts the centre for an exact size', () => {
    const result = layout(4000, 3000, { mode: 'size', width: 1000, height: 1000, fit: 'fill' });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1000);
    expect(result.source).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });

  it('pads the sides, centring the image', () => {
    const result = layout(4000, 2000, { mode: 'size', width: 1000, height: 1000, fit: 'pad' });
    expect(result.target).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });

  it('stretches to the exact size and can enlarge', () => {
    expect(layout(100, 50, { mode: 'size', width: 300, height: 300, fit: 'stretch' })).toMatchObject({
      width: 300,
      height: 300,
      target: { width: 300, height: 300 },
    });
  });

  it('never goes below 1 px or above the browser limit', () => {
    expect(layout(10, 10, { mode: 'percent', percent: 1 })).toMatchObject({ width: 1, height: 1 });
    expect(layout(10000, 10000, { mode: 'percent', percent: 500 })).toMatchObject({ width: 16384, height: 16384 });
  });
});

describe('PRESETS', () => {
  it('have unique ids and sensible sizes', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const preset of PRESETS) expect(preset.width * preset.height).toBeGreaterThan(100_000);
  });
});

describe('shrinkToSize', () => {
  /** Pretend file size: grows with quality and with the number of pixels. */
  const fakeEncode = vi.fn(async (scale: number, quality: number) => new Blob([new Uint8Array(Math.round(200_000 * scale * scale * quality))]));

  beforeEach(() => fakeEncode.mockClear());

  it('keeps full quality when it already fits', async () => {
    const result = await shrinkToSize(fakeEncode, 500_000, true);
    expect(result).toMatchObject({ scale: 1, quality: 0.95, reached: true });
    expect(fakeEncode).toHaveBeenCalledTimes(1);
  });

  it('finds the highest quality under the limit before shrinking the image', async () => {
    const result = await shrinkToSize(fakeEncode, 100_000, true);
    expect(result.scale).toBe(1);
    expect(result.blob.size).toBeLessThanOrEqual(100_000);
    expect(result.quality).toBeGreaterThan(0.45);
    expect(result.reached).toBe(true);
  });

  it('makes the image smaller when even low quality is too big', async () => {
    const result = await shrinkToSize(fakeEncode, 20_000, true);
    expect(result.scale).toBeLessThan(1);
    expect(result.blob.size).toBeLessThanOrEqual(20_000);
  });

  it('only changes the pixel size for lossless formats', async () => {
    const result = await shrinkToSize(fakeEncode, 50_000, false, 1);
    expect(result.quality).toBe(1);
    expect(result.scale).toBeLessThan(0.6);
    expect(result.blob.size).toBeLessThanOrEqual(50_000);
  });

  it('says when the limit cannot be reached', async () => {
    const result = await shrinkToSize(fakeEncode, 1, true);
    expect(result.reached).toBe(false);
  });
});
