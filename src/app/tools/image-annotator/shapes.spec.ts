import { arrowHead, contrast, wrapText } from './shapes';

describe('annotation shapes', () => {
  it('points the arrowhead back along the line', () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(a.y).toBeCloseTo(-b.y);
  });

  it('wraps meme text to the width', () => {
    const measure = { measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics };
    expect(wrapText(measure, 'one two three four', 90)).toEqual(['one two', 'three', 'four']);
  });

  it('picks readable text colours', () => {
    expect(contrast('#ffffff')).toBe('#000000');
    expect(contrast('#ef4444')).toBe('#ffffff');
  });
});
