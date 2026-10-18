import { Injectable, inject } from '@angular/core';
import { FORMATS, ImageEncoder, ImageFormat } from '../image-converter/image-encoder';
import { SizeSpec, layout, shrinkToSize } from './resize-math';

export interface ResizeOptions {
  format: ImageFormat;
  /** 0 to 1, for JPG, WebP and AVIF. */
  quality: number;
  /** Colour for padding, and for transparent areas in formats without transparency. */
  background: string;
  /** Keep the file at or below this many bytes, or null for no limit. */
  maxBytes: number | null;
}

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** False when a size limit was asked for and could not be reached. */
  reachedLimit: boolean;
}

/**
 * Resizes with the browser's canvas, reading and writing through the Image
 * Converter's encoder, so every format it opens works here too. Kept as a
 * service so tests can swap it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class Resizer {
  private readonly encoder = inject(ImageEncoder);

  async resize(file: File, spec: SizeSpec, options: ResizeOptions): Promise<ResizeResult> {
    const bitmap = await this.encoder.read(file);
    try {
      const plan = layout(bitmap.width, bitmap.height, spec);
      const info = FORMATS.find((f) => f.value === options.format)!;
      const base = document.createElement('canvas');
      base.width = plan.width;
      base.height = plan.height;
      const context = base.getContext('2d')!;
      const padded = plan.target.width < plan.width || plan.target.height < plan.height;
      if (padded || !info.alpha) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, plan.width, plan.height);
      }
      context.imageSmoothingQuality = 'high';
      const { source: s, target: t } = plan;
      context.drawImage(bitmap, s.x, s.y, s.width, s.height, t.x, t.y, t.width, t.height);

      const encode = (scale: number, quality: number) => this.encoder.write(scaled(base, scale), options.format, quality);
      if (!options.maxBytes) {
        const blob = await encode(1, options.quality);
        return { blob, ...size(base, 1), sourceWidth: bitmap.width, sourceHeight: bitmap.height, reachedLimit: true };
      }
      const shrunk = await shrinkToSize(encode, options.maxBytes, info.lossy, info.lossy ? options.quality : 1);
      return {
        blob: shrunk.blob,
        ...size(base, shrunk.scale),
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        reachedLimit: shrunk.reached,
      };
    } finally {
      bitmap.close();
    }
  }
}

const size = (canvas: HTMLCanvasElement, scale: number) => ({
  width: Math.max(1, Math.round(canvas.width * scale)),
  height: Math.max(1, Math.round(canvas.height * scale)),
});

/** The canvas itself at scale 1, otherwise a smaller copy. */
function scaled(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale >= 1) return canvas;
  const { width, height } = size(canvas, scale);
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, width, height);
  return copy;
}
