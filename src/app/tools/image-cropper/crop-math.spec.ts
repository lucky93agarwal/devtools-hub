import { Rect, applyRatio, centredRect, dragRect, nudge, roundRect } from './crop-math';

const W = 1000;
const H = 800;
const box: Rect = { x: 100, y: 100, width: 400, height: 300 };

describe('centredRect', () => {
  it('uses 80% of the image when free', () => {
    expect(centredRect(W, H, null)).toEqual({ x: 100, y: 80, width: 800, height: 640 });
  });

  it('uses the largest centred box of the ratio', () => {
    expect(centredRect(W, H, 1)).toEqual({ x: 100, y: 0, width: 800, height: 800 });
    expect(centredRect(W, H, 16 / 9)).toEqual({ x: 0, y: 118.75, width: 1000, height: 562.5 });
  });
});

describe('dragRect', () => {
  it('moves the box and stops at the edges', () => {
    expect(dragRect(box, 'move', 50, -20, W, H, null)).toEqual({ x: 150, y: 80, width: 400, height: 300 });
    expect(dragRect(box, 'move', 5000, 5000, W, H, null)).toEqual({ x: 600, y: 500, width: 400, height: 300 });
  });

  it('resizes from a corner, keeping the opposite corner', () => {
    expect(dragRect(box, 'se', 100, 50, W, H, null)).toEqual({ x: 100, y: 100, width: 500, height: 350 });
    expect(dragRect(box, 'nw', -50, -50, W, H, null)).toEqual({ x: 50, y: 50, width: 450, height: 350 });
  });

  it('never makes the box smaller than the minimum or larger than the image', () => {
    const tiny = dragRect(box, 'e', -1000, 0, W, H, null);
    expect(tiny.width).toBe(8);
    const huge = dragRect(box, 'sw', -1000, 1000, W, H, null);
    expect(huge).toEqual({ x: 0, y: 100, width: 500, height: 700 });
  });

  it('keeps the ratio from a corner', () => {
    const square = { x: 100, y: 100, width: 300, height: 300 };
    const result = dragRect(square, 'se', 200, 50, W, H, 1);
    expect(result.width).toBe(result.height);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('keeps the ratio from a side, centred on the other axis', () => {
    const square = { x: 300, y: 300, width: 200, height: 200 };
    const result = dragRect(square, 'e', 100, 0, W, H, 1);
    expect(result).toEqual({ x: 300, y: 250, width: 300, height: 300 });
  });

  it('shrinks a ratio box that would leave the image', () => {
    const square = { x: 600, y: 600, width: 100, height: 100 };
    const result = dragRect(square, 'se', 900, 900, W, H, 1);
    expect(result).toEqual({ x: 600, y: 600, width: 200, height: 200 });
  });
});

describe('helpers', () => {
  it('nudges inside the image', () => {
    expect(nudge(box, -500, 0, W, H).x).toBe(0);
  });

  it('applies a new ratio around the centre', () => {
    const result = applyRatio(box, 1, W, H);
    expect(result.width).toBeCloseTo(result.height);
    expect(result.x + result.width / 2).toBeCloseTo(300);
  });

  it('rounds to whole pixels inside the image', () => {
    expect(roundRect({ x: 10.4, y: -3, width: 2000.6, height: 99.5 }, W, H)).toEqual({
      x: 10,
      y: 0,
      width: 990,
      height: 100,
    });
  });
});
