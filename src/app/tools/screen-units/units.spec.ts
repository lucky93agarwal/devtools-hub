import { DEFAULT_SETTINGS, convertUnits } from './units';

describe('units', () => {
  it('turns dp into pixels at every density', () => {
    const c = convertUnits(48, 'dp', DEFAULT_SETTINGS);
    expect(c.devicePx).toBe(144);
    expect(c.perDensity.map((d) => d.px)).toEqual([36, 48, 72, 96, 144, 192]);
    expect(c.rem).toBe(3);
  });

  it('turns device pixels back into dp, and sp with large text', () => {
    expect(convertUnits(300, 'px', { ...DEFAULT_SETTINGS, scale: 2 }).dp).toBe(150);
    const big = convertUnits(16, 'sp', { ...DEFAULT_SETTINGS, fontScale: 1.3 });
    expect(big.dp).toBe(20.8);
    expect(big.sp).toBe(16);
    expect(convertUnits(1.5, 'rem', DEFAULT_SETTINGS).cssPx).toBe(24);
  });
});
