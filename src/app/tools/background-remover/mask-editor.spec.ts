import { strokePoints, undoDepth } from './mask-editor';

describe('mask editor', () => {
  it('fills the gap between two pointer positions', () => {
    const points = strokePoints({ x: 0, y: 0 }, { x: 30, y: 0 }, 9);
    expect(points.length).toBe(10);
    expect(points.at(-1)).toEqual({ x: 30, y: 0 });
  });

  it('keeps fewer undo steps for big images', () => {
    expect(undoDepth(1000, 1000)).toBe(15);
    expect(undoDepth(2000, 2000)).toBe(6);
    expect(undoDepth(4000, 4000)).toBe(3);
  });
});
