import { Injectable } from '@angular/core';
import { baseName } from '../../shared/file-utils';
import { ICO_SIZES, readHeic, readTiff, writeAvif, writeBmp, writeGif, writeIco, writeTiff } from './image-formats';

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'gif' | 'bmp' | 'tiff' | 'ico';

export interface FormatInfo {
  value: ImageFormat;
  label: string;
  mime: string;
  /** Has a quality setting. */
  lossy: boolean;
  /** Keeps transparent areas; the others get a white background. */
  alpha: boolean;
}

export const FORMATS: FormatInfo[] = [
  { value: 'png', label: 'PNG', mime: 'image/png', lossy: false, alpha: true },
  { value: 'jpg', label: 'JPG', mime: 'image/jpeg', lossy: true, alpha: false },
  { value: 'webp', label: 'WebP', mime: 'image/webp', lossy: true, alpha: true },
  { value: 'avif', label: 'AVIF', mime: 'image/avif', lossy: true, alpha: true },
  { value: 'gif', label: 'GIF', mime: 'image/gif', lossy: false, alpha: true },
  { value: 'bmp', label: 'BMP', mime: 'image/bmp', lossy: false, alpha: false },
  { value: 'tiff', label: 'TIFF', mime: 'image/tiff', lossy: false, alpha: true },
  { value: 'ico', label: 'ICO', mime: 'image/x-icon', lossy: false, alpha: true },
];

const infoOf = (format: ImageFormat) => FORMATS.find((f) => f.value === format)!;
export const mimeOf = (format: ImageFormat) => infoOf(format).mime;
export const labelOf = (format: ImageFormat) => infoOf(format).label;

/** Default quality for JPG, WebP and AVIF, from 0 to 1. */
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

/** SVG has no fixed pixel size, so small drawings are drawn at least this large. */
export const SVG_MIN_SIDE = 1024;

const isType = (file: File, types: string[], extensions: string[]) =>
  types.includes(file.type) || extensions.some((ext) => file.name.toLowerCase().endsWith(ext));
const isSvg = (file: File) => isType(file, ['image/svg+xml'], ['.svg']);
const isHeic = (file: File) =>
  isType(
    file,
    ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
    ['.heic', '.heif'],
  );
const isTiff = (file: File) => isType(file, ['image/tiff'], ['.tif', '.tiff']);

/** Size of an SVG drawing in pixels, scaled up so the longer side is at least SVG_MIN_SIDE. */
export function svgSize(width: number, height: number): { width: number; height: number } {
  if (!width || !height) return { width: SVG_MIN_SIDE, height: SVG_MIN_SIDE };
  const factor = Math.max(1, SVG_MIN_SIDE / Math.max(width, height));
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

/** Where the image sits inside a square icon: centred, keeping its shape. */
export function fitSquare(width: number, height: number, size: number) {
  const factor = size / Math.max(width, height);
  const w = Math.max(1, Math.round(width * factor));
  const h = Math.max(1, Math.round(height * factor));
  return { x: Math.round((size - w) / 2), y: Math.round((size - h) / 2), width: w, height: h };
}

/**
 * Converts images in the browser, so nothing is uploaded. The canvas reads and
 * writes the common formats; the rest use small libraries loaded on first use.
 * Kept as a service so tests can swap it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class ImageEncoder {
  async convert(
    file: File,
    format: ImageFormat,
    options: ConvertOptions = DEFAULT_OPTIONS,
  ): Promise<ConvertResult> {
    const bitmap = await this.read(file);
    try {
      if (format === 'ico') {
        const blob = await this.icon(bitmap);
        const size = ICO_SIZES[ICO_SIZES.length - 1];
        return {
          blob,
          width: size,
          height: size,
          sourceWidth: bitmap.width,
          sourceHeight: bitmap.height,
        };
      }
      const { width, height } = targetSize(bitmap.width, bitmap.height, options.resize);
      const canvas = this.draw(bitmap, width, height, !infoOf(format).alpha);
      try {
        const blob = await this.write(canvas, format, options.quality);
        return { blob, width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
      } finally {
        // Free the pixel memory now rather than waiting for garbage collection.
        canvas.width = canvas.height = 0;
      }
    } finally {
      bitmap.close();
    }
  }

  /** Opens any supported file as a bitmap. */
  private async read(file: File): Promise<ImageBitmap> {
    if (isSvg(file)) return this.readSvg(file);
    try {
      // Safari opens HEIC and TIFF itself, so try the browser first.
      return await createImageBitmap(file);
    } catch {
      // Fall through to the libraries below.
    }
    try {
      if (isHeic(file)) return await createImageBitmap(await readHeic(await file.arrayBuffer()));
      if (isTiff(file)) return await createImageBitmap(await readTiff(await file.arrayBuffer()));
    } catch {
      throw new ConvertError(
        `This ${isHeic(file) ? 'HEIC' : 'TIFF'} file could not be read. It may be damaged.`,
      );
    }
    throw new ConvertError('This image could not be read. The file may be damaged.');
  }

  private async readSvg(file: File): Promise<ImageBitmap> {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const { width, height } = svgSize(image.naturalWidth, image.naturalHeight);
      const canvas = this.draw(image, width, height, false);
      const bitmap = await createImageBitmap(canvas);
      canvas.width = canvas.height = 0;
      return bitmap;
    } catch {
      throw new ConvertError(
        'This SVG could not be drawn. It may be damaged or use external files.',
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private draw(source: CanvasImageSource, width: number, height: number, whiteBackground: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new ConvertError('Your browser could not prepare the image.');
    // Formats without transparency would turn transparent areas black.
    if (whiteBackground) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  private async write(
    canvas: HTMLCanvasElement,
    format: ImageFormat,
    quality: number,
  ): Promise<Blob> {
    const label = labelOf(format);
    if (format === 'png' || format === 'jpg' || format === 'webp') {
      const mime = mimeOf(format);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, format === 'png' ? undefined : quality),
      );
      if (!blob) throw new ConvertError('The image is too large for your browser to convert.');
      // Browsers that cannot write a format quietly return PNG instead.
      if (blob.type !== mime) throw new ConvertError(`Your browser cannot create ${label} files.`);
      return blob;
    }
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    try {
      if (format === 'bmp') return writeBmp(pixels);
      if (format === 'gif') return await writeGif(pixels);
      if (format === 'tiff') return await writeTiff(pixels);
      return await writeAvif(pixels, quality);
    } catch {
      throw new ConvertError(`The ${label} file could not be created. Try a smaller size.`);
    }
  }

  /** ICO with several square sizes; the image is centred on a transparent square. */
  private async icon(bitmap: ImageBitmap): Promise<Blob> {
    const icons = [];
    for (const size of ICO_SIZES) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new ConvertError('Your browser could not prepare the image.');
      const box = fitSquare(bitmap.width, bitmap.height, size);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, box.x, box.y, box.width, box.height);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new ConvertError('The icon could not be created.');
      icons.push({ size, png: await png.arrayBuffer() });
    }
    return writeIco(icons);
  }
}
