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

/** Quality used for JPG and WebP until the quality slider exists (0 to 1). */
export const DEFAULT_QUALITY = 0.9;

/** "holiday.jpeg" converted to WebP becomes "holiday.webp". */
export function outputName(fileName: string, format: ImageFormat): string {
  return `${baseName(fileName)}.${format}`;
}

/** Thrown with a message that can be shown to the user as it is. */
export class ConvertError extends Error {}

/**
 * Converts images with the browser's own canvas, so nothing is uploaded and no
 * library is needed. Kept as a service so tests can swap it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class ImageEncoder {
  async convert(file: File, format: ImageFormat, quality = DEFAULT_QUALITY): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new ConvertError('This image could not be read. The file may be damaged.');
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new ConvertError('Your browser could not prepare the image.');

      // JPG has no transparency; without a fill, transparent areas turn black.
      if (format === 'jpg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(bitmap, 0, 0);

      const mime = mimeOf(format);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, format === 'png' ? undefined : quality),
      );
      if (!blob) throw new ConvertError('The image is too large for your browser to convert.');
      // Browsers that cannot write a format quietly return PNG instead.
      if (blob.type !== mime) throw new ConvertError(`Your browser cannot create ${labelOf(format)} files.`);
      // Free the pixel memory now rather than waiting for garbage collection.
      canvas.width = canvas.height = 0;
      return blob;
    } finally {
      bitmap.close();
    }
  }
}
