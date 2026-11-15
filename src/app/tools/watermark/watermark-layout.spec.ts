import { outputType, placeMark, tileCentres } from './watermark-layout';

describe('watermark layout', () => {
  it('places the mark in each spot with a margin', () => {
    expect(placeMark('top-left', 1000, 500, 100, 50, 10)).toEqual({ x: 10, y: 10 });
    expect(placeMark('bottom-right', 1000, 500, 100, 50, 10)).toEqual({ x: 890, y: 440 });
    expect(placeMark('center', 1000, 500, 100, 50, 10)).toEqual({ x: 450, y: 225 });
    expect(placeMark('top', 1000, 500, 100, 50, 10)).toEqual({ x: 450, y: 10 });
    expect(placeMark('left', 1000, 500, 100, 50, 10)).toEqual({ x: 10, y: 225 });
  });

  it('tiles marks beyond every edge', () => {
    const points = tileCentres(400, 300, 100, 40, 60);
    expect(points.some((p) => p.x < 0 && p.y < 0)).toBe(true);
    expect(points.some((p) => p.x > 400 && p.y > 300)).toBe(true);
  });

  it('keeps JPG and WebP, and saves everything else as PNG', () => {
    expect(outputType('image/jpeg')).toEqual({ type: 'image/jpeg', extension: 'jpg' });
    expect(outputType('image/webp')).toEqual({ type: 'image/webp', extension: 'webp' });
    expect(outputType('image/heic')).toEqual({ type: 'image/png', extension: 'png' });
  });
});
