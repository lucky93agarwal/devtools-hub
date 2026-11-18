/** Pointer helpers for tools where the user drags on an image shown smaller than its real size. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The pointer position in the canvas's own pixels, whatever size it is shown at. */
export function canvasPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * canvas.width) / box.width,
    y: ((event.clientY - box.top) * canvas.height) / box.height,
  };
}

/** The rectangle between two corners, in any drag direction, kept inside the image. */
export function rectBetween(a: Point, b: Point, width: number, height: number): Rect {
  const x1 = Math.max(0, Math.min(a.x, b.x));
  const y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(width, Math.max(a.x, b.x));
  const y2 = Math.min(height, Math.max(a.y, b.y));
  return { x: Math.round(x1), y: Math.round(y1), width: Math.round(Math.max(0, x2 - x1)), height: Math.round(Math.max(0, y2 - y1)) };
}
