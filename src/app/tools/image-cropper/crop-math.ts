/** Geometry of the crop box, in image pixels. Pure, so it is easy to test. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Which part of the box is being dragged: the middle, a side or a corner. */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** The smallest crop, in image pixels, so the box can always be grabbed. */
export const MIN_SIZE = 8;

export interface AspectPreset {
  id: string;
  label: string;
  /** Width divided by height, or null for any shape. */
  ratio: number | null;
}

export const ASPECTS: AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1 square', ratio: 1 },
  { id: '4:5', label: '4:5 portrait', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9 wide', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 story', ratio: 9 / 16 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A starting box: the largest centred one of the ratio, or 80% of the image when free. */
export function centredRect(width: number, height: number, ratio: number | null): Rect {
  if (!ratio) {
    return { x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.8 };
  }
  const w = Math.min(width, height * ratio);
  const h = w / ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

/** Whole pixels, inside the image. */
export function roundRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(Math.round(rect.x), 0, width - 1);
  const y = clamp(Math.round(rect.y), 0, height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, width - x),
    height: clamp(Math.round(rect.height), 1, height - y),
  };
}

/**
 * The box after dragging `handle` by (dx, dy) image pixels from `start`. With a
 * ratio, the opposite corner (or the middle of the opposite side) stays put and
 * the box keeps its shape, shrinking if it would leave the image.
 */
export function dragRect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
  ratio: number | null,
): Rect {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, imageWidth - start.width),
      y: clamp(start.y + dy, 0, imageHeight - start.height),
    };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_SIZE);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_SIZE, imageWidth);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_SIZE, imageHeight);
  if (!ratio) return { x: left, y: top, width: right - left, height: bottom - top };

  // Which way the box is anchored on each axis.
  const anchorX = handle.includes('w') ? 'right' : handle.includes('e') ? 'left' : 'centre';
  const anchorY = handle.includes('n') ? 'bottom' : handle.includes('s') ? 'top' : 'centre';
  const centreX = start.x + start.width / 2;
  const centreY = start.y + start.height / 2;

  let width = right - left;
  let height = bottom - top;
  if (anchorX === 'centre') width = height * ratio;
  else if (anchorY === 'centre') height = width / ratio;
  else if (width / height > ratio) width = height * ratio;
  else height = width / ratio;

  // Room available from the anchor, so the box stays inside the image.
  const roomX = anchorX === 'left' ? imageWidth - left : anchorX === 'right' ? right : 2 * Math.min(centreX, imageWidth - centreX);
  const roomY = anchorY === 'top' ? imageHeight - top : anchorY === 'bottom' ? bottom : 2 * Math.min(centreY, imageHeight - centreY);
  width = Math.max(Math.min(width, roomX, roomY * ratio), MIN_SIZE);
  height = width / ratio;

  const x = anchorX === 'left' ? left : anchorX === 'right' ? right - width : centreX - width / 2;
  const y = anchorY === 'top' ? top : anchorY === 'bottom' ? bottom - height : centreY - height / 2;
  return { x, y, width, height };
}

/** Moves the box by keyboard, staying inside the image. */
export function nudge(rect: Rect, dx: number, dy: number, imageWidth: number, imageHeight: number): Rect {
  return dragRect(rect, 'move', dx, dy, imageWidth, imageHeight, null);
}

/** Changes the box to a new ratio, keeping its centre and fitting inside the image. */
export function applyRatio(rect: Rect, ratio: number | null, imageWidth: number, imageHeight: number): Rect {
  if (!ratio) return rect;
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  let width = Math.sqrt(rect.width * rect.height * ratio);
  width = Math.min(width, imageWidth, imageHeight * ratio);
  const height = width / ratio;
  return {
    x: clamp(centreX - width / 2, 0, imageWidth - width),
    y: clamp(centreY - height / 2, 0, imageHeight - height),
    width,
    height,
  };
}
