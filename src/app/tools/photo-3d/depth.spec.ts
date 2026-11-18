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

import { writeGlb } from './glb';
import { buildMesh, gridSize, orbitView, sampleDepth } from './mesh';

describe('3D model', () => {
  it('keeps the grid under 65,000 points for 16-bit indices', () => {
    for (const aspect of [0.5, 1, 16 / 9, 3]) {
      const { columns, rows } = gridSize(aspect);
      expect(columns * rows).toBeLessThanOrEqual(65_000);
      expect(columns / rows).toBeCloseTo(aspect, 0);
    }
  });

  it('samples depth smoothly and raises near points', () => {
    const depth = new Uint8Array([0, 255]);
    expect(sampleDepth(depth, 2, 1, 0.5, 0)).toBeCloseTo(0.5);
    const mesh = buildMesh(depth, 2, 1, 1);
    const last = mesh.depths.length - 1;
    expect(mesh.depths[0]).toBe(0);
    expect(mesh.depths[mesh.columns - 1]).toBe(1);
    expect(mesh.indices.reduce((a, b) => Math.max(a, b), 0)).toBe(last);
  });

  it('turns the camera all the way round', () => {
    const back = orbitView(Math.PI, 0, 3);
    // Seen from behind, +x on the model points to the left.
    expect(back[0]).toBeCloseTo(-1);
    expect(back[14]).toBeCloseTo(-3);
  });

  it('writes a valid GLB', () => {
    const mesh = buildMesh(new Uint8Array([0, 128, 255, 64]), 2, 2, 1);
    const glb = writeGlb(mesh, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 0.5);
    const view = new DataView(glb.buffer);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(glb.length);
    const jsonLength = view.getUint32(12, true);
    expect(jsonLength % 4).toBe(0);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
    expect(json.accessors[0].count).toBe(mesh.depths.length);
    expect(json.accessors[0].max[2]).toBeCloseTo(0.25);
    expect(json.images[0].mimeType).toBe('image/jpeg');
    expect(json.materials[0].doubleSided).toBe(true);
  });
});
