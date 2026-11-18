/** Small canvas helpers shared by the image tools. */

/** A canvas holding the bitmap, scaled down so its longer side is at most `maxSide`. */
export function bitmapToCanvas(bitmap: ImageBitmap, maxSide = Infinity): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The canvas as a file; JPG gets a white background so transparent parts do not turn black. */
export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  let source = canvas;
  if (type === 'image/jpeg') {
    source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const context = source.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, source.width, source.height);
    context.drawImage(canvas, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, type, quality));
  if (source !== canvas) source.width = source.height = 0;
  if (!blob) throw new Error('The image could not be saved.');
  return blob;
}

/** Output type and extension that keep the input's format when the browser can write it. */
export function sameOutput(inputType: string): { type: string; extension: string } {
  if (inputType === 'image/jpeg') return { type: 'image/jpeg', extension: 'jpg' };
  if (inputType === 'image/webp') return { type: 'image/webp', extension: 'webp' };
  return { type: 'image/png', extension: 'png' };
}

/** Copies one canvas into the clipboard as a PNG; false when the browser cannot. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToBlob(canvas) })]);
    return true;
  } catch {
    return false;
  }
}
