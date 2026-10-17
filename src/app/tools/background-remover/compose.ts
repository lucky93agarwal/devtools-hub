/** Putting a new background behind a cut-out image. */

export type NewBackground =
  | { kind: 'transparent' }
  | { kind: 'colour'; colour: string }
  | { kind: 'image'; file: Blob };

/** Ready-made colours offered next to the colour picker. */
export const BACKGROUND_COLOURS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Light grey', value: '#f3f4f6' },
  { label: 'Black', value: '#000000' },
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Sky blue', value: '#bae6fd' },
  { label: 'Mint', value: '#bbf7d0' },
] as const;

/**
 * The part of a source image to draw so it fills the target completely without
 * stretching, cropping evenly from both sides (like CSS object-fit: cover).
 */
export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sw = targetWidth / scale;
  const sh = targetHeight / scale;
  return { sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh };
}

/** Draws the background, then the cut-out on top, at the cut-out's size. Returns a PNG. */
export async function composeBackground(cutout: Blob, background: NewBackground): Promise<Blob> {
  if (background.kind === 'transparent') return cutout;

  const subject = await createImageBitmap(cutout);
  try {
    const canvas = new OffscreenCanvas(subject.width, subject.height);
    const context = canvas.getContext('2d')!;
    if (background.kind === 'colour') {
      context.fillStyle = background.colour;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const image = await createImageBitmap(background.file);
      try {
        const { sx, sy, sw, sh } = coverRect(image.width, image.height, canvas.width, canvas.height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } finally {
        image.close();
      }
    }
    context.drawImage(subject, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    subject.close();
  }
}
