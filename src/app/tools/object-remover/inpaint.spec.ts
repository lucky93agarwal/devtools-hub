import { diffuse, dilate, inpaint } from './inpaint';

/** A 40×40 image: left half red, right half blue, with a white square painted over the middle. */
function scene() {
  const width = 40;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const red = x < 20;
      data.set(red ? [220, 20, 20, 255] : [20, 20, 220, 255], i);
      if (x >= 15 && x < 25 && y >= 15 && y < 25) {
        data.set([255, 255, 255, 255], i);
        mask[y * width + x] = 1;
      }
    }
  }
  return { data, mask, width, height };
}

describe('inpainting', () => {
  it('fills the hole from the surrounding texture, keeping each side its colour', () => {
    const { data, mask, width, height } = scene();
    inpaint(data, width, height, mask, { patchRadius: 2, searchMargin: 12, searchStep: 1 });
    const at = (x: number, y: number) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
    expect(at(16, 20)).toEqual([220, 20, 20]);
    expect(at(23, 20)).toEqual([20, 20, 220]);
    for (let i = 0; i < mask.length; i++) if (mask[i]) expect(data[i * 4] === 255 && data[i * 4 + 1] === 255).toBe(false);
  });

  it('falls back to diffusion when there is nothing to copy', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]);
    const unknown = new Uint8Array([0, 1]);
    diffuse(data, 2, 1, unknown);
    expect([...data.slice(4)]).toEqual([100, 100, 100, 255]);
  });

  it('grows a mask by a radius', () => {
    const mask = new Uint8Array(25);
    mask[12] = 1;
    expect(dilate(mask, 5, 5, 1).reduce((n, v) => n + v, 0)).toBe(5);
  });
});
