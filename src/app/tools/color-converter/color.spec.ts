import { contrast, formats, parseColor, rgbToHsl, rgbToOklch, toHex } from './color';

const parse = (text: string) => {
  const result = parseColor(text);
  if (!result.ok) throw new Error(result.error);
  return result.color;
};

describe('color', () => {
  it('reads every common way to write a colour', () => {
    const brand = { r: 79, g: 70, b: 229, a: 1 };
    expect(parse('#4f46e5')).toEqual(brand);
    expect(parse('4F46E5')).toEqual(brand);
    expect(parse('rgb(79, 70, 229)')).toEqual(brand);
    expect(parse('rgb(79 70 229)')).toEqual(brand);
    expect(parse('0xFF4F46E5')).toEqual(brand);
    expect(parse('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parse('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parse('rgb(100% 0% 0% / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parse('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 });
    expect(parse('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parse('hsl(0.5turn 100% 25%)')).toEqual({ r: 0, g: 128, b: 128, a: 1 });
    expect(parse('RebeccaPurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor('nope')).toMatchObject({ ok: false });
  });

  it('round-trips through OKLCH', () => {
    const [L, C, H] = rgbToOklch(parse('#4f46e5'));
    expect(parse(`oklch(${L}% ${C} ${H})`)).toEqual(parse('#4f46e5'));
    expect(rgbToOklch(parse('white'))).toEqual([100, 0, 0]);
  });

  it('writes HSL, hex and app code', () => {
    expect(rgbToHsl(parse('#4f46e5'))).toEqual([243.4, 75.4, 58.6]);
    expect(toHex(parse('rgba(255,0,0,0.5)'))).toBe('#ff000080');
    const list = Object.fromEntries(formats(parse('#4f46e5')).map((f) => [f.label, f.value]));
    expect(list['Jetpack Compose']).toBe('Color(0xFF4F46E5)');
    expect(list['Android XML']).toBe('#FF4F46E5');
    expect(list['SwiftUI']).toBe('Color(red: 0.31, green: 0.275, blue: 0.898, opacity: 1)');
  });

  it('measures WCAG contrast', () => {
    expect(contrast(parse('black'), parse('white'))).toBe(21);
    expect(contrast(parse('white'), parse('white'))).toBe(1);
    expect(contrast(parse('#767676'), parse('white'))).toBe(4.54);
    expect(contrast(parse('rgba(0,0,0,0.5)'), parse('white'))).toBeLessThan(5);
  });
});
