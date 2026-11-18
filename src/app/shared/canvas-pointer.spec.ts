import { rectBetween } from './canvas-pointer';

describe('canvas pointer', () => {
  it('makes a rectangle from any drag direction, kept inside the image', () => {
    expect(rectBetween({ x: 50, y: 40 }, { x: 10, y: 10 }, 100, 100)).toEqual({ x: 10, y: 10, width: 40, height: 30 });
    expect(rectBetween({ x: -5, y: 90 }, { x: 20, y: 150 }, 100, 100)).toEqual({ x: 0, y: 90, width: 20, height: 10 });
  });
});
