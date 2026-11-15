import { exportPalette, extractPalette, textOn, toHex, toHsl } from './palette';

function pixels(colours: [number, number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colours.flat());
}

describe('palette', () => {
  it('finds the main colours, most common first, skipping transparent pixels', () => {
    const data = pixels([
      ...Array(6).fill([255, 0, 0, 255]),
      ...Array(3).fill([0, 0, 255, 255]),
      [0, 255, 0, 0],
    ]);
    const swatches = extractPalette(data, 2);
    expect(swatches.map(toHex)).toEqual(['#ff0000', '#0000ff']);
    expect(swatches[0].share).toBeCloseTo(6 / 9);
  });

  it('returns nothing for a fully transparent image', () => {
    expect(extractPalette(pixels([[1, 2, 3, 0]]), 5)).toEqual([]);
  });

  it('formats colours and picks readable text', () => {
    expect(toHex({ r: 79, g: 70, b: 229 })).toBe('#4f46e5');
    expect(toHsl({ r: 255, g: 0, b: 0 })).toBe('hsl(0 100% 50%)');
    expect(textOn({ r: 255, g: 255, b: 255 })).toBe('#111827');
    expect(textOn({ r: 0, g: 0, b: 0 })).toBe('#ffffff');
  });

  it('exports CSS, SCSS, Tailwind and JSON', () => {
    const swatches = [{ r: 255, g: 0, b: 0, share: 1 }];
    expect(exportPalette(swatches, 'css')).toBe(':root {\n  --color-1: #ff0000;\n}\n');
    expect(exportPalette(swatches, 'scss')).toBe('$color-1: #ff0000;\n');
    expect(exportPalette(swatches, 'tailwind')).toContain("100: '#ff0000',");
    expect(JSON.parse(exportPalette(swatches, 'json'))).toEqual(['#ff0000']);
  });
});
