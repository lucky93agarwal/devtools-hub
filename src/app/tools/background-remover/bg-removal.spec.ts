import { MODELS, fromHalf, toAlpha, toHalf } from './bg-removal';

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
