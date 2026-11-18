import { matrixFor, simulate } from './simulate';

describe('colour blindness simulation', () => {
  it('turns red and green into similar colours for deuteranopia', () => {
    const red = simulate(new Uint8ClampedArray([255, 0, 0, 255]), 'deuteranopia');
    const green = simulate(new Uint8ClampedArray([0, 128, 0, 255]), 'deuteranopia');
    // Both lose their difference in hue: blue stays low and red and green get close.
    expect(Math.abs(red[0] - red[1])).toBeLessThan(80);
    expect(Math.abs(green[0] - green[1])).toBeLessThan(60);
  });

  it('makes greys for achromatopsia and keeps alpha', () => {
    const out = simulate(new Uint8ClampedArray([200, 50, 10, 77]), 'achromatopsia');
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[3]).toBe(77);
  });

  it('leaves colours alone at zero severity', () => {
    expect(matrixFor('protanopia', 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect([...simulate(new Uint8ClampedArray([10, 200, 90, 255]), 'tritanopia', 0)]).toEqual([10, 200, 90, 255]);
  });
});
