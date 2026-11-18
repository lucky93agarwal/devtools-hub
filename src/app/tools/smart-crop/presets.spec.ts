import { CROP_PRESETS, clampCrop, cropBox, isUpscaled } from './presets';

describe('crop presets', () => {
  it('has the common social sizes', () => {
    expect(CROP_PRESETS.find((p) => p.id === 'youtube')).toMatchObject({ width: 1280, height: 720 });
  });

  it('finds the largest box of the preset shape', () => {
    expect(cropBox(4000, 3000, 1280, 720)).toEqual({ width: 4000, height: 2250 });
    expect(cropBox(4000, 3000, 1080, 1920)).toEqual({ width: 1687, height: 3000 });
  });

  it('keeps crops inside the image and spots enlargement', () => {
    expect(clampCrop({ x: -10, y: 900, width: 100, height: 200 }, 500, 1000)).toEqual({ x: 0, y: 800, width: 100, height: 200 });
    expect(isUpscaled(800, 1280)).toBe(true);
  });
});
