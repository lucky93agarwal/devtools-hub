import { Injectable } from '@angular/core';
import { baseName } from '../../shared/file-utils';

export type ImageFormat = 'png' | 'jpg' | 'webp';

export const FORMATS: { value: ImageFormat; label: string; mime: string; lossy: boolean }[] = [
  { value: 'png', label: 'PNG', mime: 'image/png', lossy: false },
  { value: 'jpg', label: 'JPG', mime: 'image/jpeg', lossy: true },
  { value: 'webp', label: 'WebP', mime: 'image/webp', lossy: true },
];

export const mimeOf = (format: ImageFormat) => FORMATS.find((f) => f.value === format)!.mime;
export const labelOf = (format: ImageFormat) => FORMATS.find((f) => f.value === format)!.label;

/** Default quality for JPG and WebP, from 0 to 1. */
export const DEFAULT_QUALITY = 0.9;

/** How to change the image size while converting. */
export type Resize =
  | { mode: 'original' }
  /** Scale both sides by this percentage, for example 50. */
  | { mode: 'scale'; percent: number }
  /** Make the image at most this many pixels wide, keeping the shape. Never enlarges. */
  | { mode: 'width'; width: number };

export interface ConvertOptions {
  quality: number;
  resize: Resize;
}

export const DEFAULT_OPTIONS: ConvertOptions = { quality: DEFAULT_QUALITY, resize: { mode: 'original' } };

/** Output dimensions for a resize setting. Always at least 1x1, and never larger than the original. */
export function targetSize(width: number, height: number, resize: Resize): { width: number; height: number } {
  let factor = 1;
  if (resize.mode === 'scale') factor = resize.percent / 100;
  if (resize.mode === 'width' && resize.width > 0 && width > resize.width) factor = resize.width / width;
  factor = Math.min(factor, 1);
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

/** "holiday.jpeg" converted to WebP becomes "holiday.webp", or "holiday-converted.webp" with a suffix. */
export function outputName(fileName: string, format: ImageFormat, suffix = ''): string {
  return `${baseName(fileName)}${suffix}.${format}`;
}

/** A converted image and its size in pixels before and after. */
export interface ConvertResult {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Thrown with a message that can be shown to the user as it is. */
export class ConvertError extends Error {}

/**
 * Converts images with the browser's own canvas, so nothing is uploaded and no
 * library is needed. Kept as a service so tests can swap it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class ImageEncoder {
  async convert(file: File, format: ImageFormat, options: ConvertOptions = DEFAULT_OPTIONS): Promise<ConvertResult> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new ConvertError('This image could not be read. The file may be damaged.');
    }

    try {
      const { width, height } = targetSize(bitmap.width, bitmap.height, options.resize);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new ConvertError('Your browser could not prepare the image.');

      // JPG has no transparency; without a fill, transparent areas turn black.
      if (format === 'jpg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);

      const mime = mimeOf(format);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, format === 'png' ? undefined : options.quality),
      );
      if (!blob) throw new ConvertError('The image is too large for your browser to convert.');
      // Browsers that cannot write a format quietly return PNG instead.
      if (blob.type !== mime) throw new ConvertError(`Your browser cannot create ${labelOf(format)} files.`);
      // Free the pixel memory now rather than waiting for garbage collection.
      canvas.width = canvas.height = 0;
      return { blob, width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
}
