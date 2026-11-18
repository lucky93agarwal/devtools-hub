import { inputSize, joinParts, normaliseDepth, toTensorData } from './depth';
import { motionAt, smoothDepth } from './renderer';

describe('3D photo depth', () => {
  it('sizes the model input to multiples of 14 with the long side near 518', () => {
    expect(inputSize(4000, 3000)).toEqual({ width: 518, height: 392 });
    expect(inputSize(1080, 1920)).toEqual({ width: 294, height: 518 });
  });

  it('normalises pixels into RGB planes', () => {
    const out = toTensorData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(out[1]).toBeCloseTo((0 - 0.456) / 0.224);
  });

  it('maps depth to 0 (far) to 255 (near), ignoring outliers', () => {
    const values = Float32Array.from({ length: 200 }, (_, i) => i);
    values[199] = 1e6;
    const out = normaliseDepth(values);
    expect(out[0]).toBe(0);
    expect(out[198]).toBe(255);
    expect(out[100]).toBeGreaterThan(100);
  });

  it('joins model parts', () => {
    expect([...joinParts([new Uint8Array([1, 2]), new Uint8Array([3])])]).toEqual([1, 2, 3]);
  });

  it('animates in loops and smooths depth', () => {
    expect(motionAt('circle', 0)).toEqual({ x: 1, y: 0, dolly: 0 });
    expect(motionAt('zoom', 0.5).dolly).toBeCloseTo(1);
    expect(motionAt('sway', 1).x).toBeCloseTo(0);
    const smooth = smoothDepth(new Uint8ClampedArray([0, 0, 255, 0, 0]), 5, 1, 1);
    expect(smooth[2]).toBe(85);
    expect(smooth[0]).toBe(0);
  });
});
