/** Where a watermark goes on an image. */

export type MarkPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'tile';

export const POSITIONS: readonly MarkPosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/** Top-left corner of a mark of size w×h in one of the nine spots, `margin` pixels from the edges. */
export function placeMark(position: Exclude<MarkPosition, 'tile'>, imageW: number, imageH: number, w: number, h: number, margin: number) {
  const [vertical, horizontal] = position === 'center' ? ['center', 'center'] : position.includes('-') ? position.split('-') : ['top', 'bottom'].includes(position) ? [position, 'center'] : ['center', position];
  const x = horizontal === 'left' ? margin : horizontal === 'right' ? imageW - w - margin : (imageW - w) / 2;
  const y = vertical === 'top' ? margin : vertical === 'bottom' ? imageH - h - margin : (imageH - h) / 2;
  return { x, y };
}

/** Centres of repeated marks covering the whole image, in a staggered grid. */
export function tileCentres(imageW: number, imageH: number, w: number, h: number, gap: number): { x: number; y: number }[] {
  const stepX = w + gap;
  const stepY = h + gap;
  const points: { x: number; y: number }[] = [];
  // Go a step past each edge so rotated marks still reach the corners.
  for (let row = -1, y = -stepY / 2; y <= imageH + stepY; row++, y += stepY) {
    const shift = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -stepX + shift; x <= imageW + stepX; x += stepX) points.push({ x, y });
  }
  return points;
}

/** Output type and file extension for a watermarked copy: the input's own type when the browser can write it. */
export function outputType(inputType: string): { type: string; extension: string } {
  if (inputType === 'image/jpeg') return { type: 'image/jpeg', extension: 'jpg' };
  if (inputType === 'image/webp') return { type: 'image/webp', extension: 'webp' };
  return { type: 'image/png', extension: 'png' };
}
