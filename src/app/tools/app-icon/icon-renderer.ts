import { Injectable } from '@angular/core';
import { IconStyle, placement } from './icon-plan';

export interface DrawOptions {
  background: string;
  /** Space around the image, from 0 to 0.4 of the icon. */
  padding: number;
}

/** A source image, ready to be drawn at any size. */
export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

/** SVG has no pixel size of its own; it is drawn at this size so every icon stays sharp. */
const SVG_SIZE = 1024;

/**
 * Draws icons with the browser's canvas. Kept as a service so tests can swap
 * it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class IconRenderer {
  async load(file: File): Promise<LoadedImage> {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const svg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
      const width = svg ? Math.round(ratio >= 1 ? SVG_SIZE : SVG_SIZE * ratio) : image.naturalWidth;
      const height = svg ? Math.round(ratio >= 1 ? SVG_SIZE / ratio : SVG_SIZE) : image.naturalHeight;
      return { source: image, width, height, close: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }

  draw(image: LoadedImage, size: number, style: IconStyle, options: DrawOptions): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    if (style === 'round') {
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      context.clip();
    }
    // The adaptive foreground stays transparent; Android puts the background colour behind it.
    if (style !== 'foreground') {
      context.fillStyle = options.background;
      context.fillRect(0, 0, size, size);
    }
    const box = placement(image.width, image.height, size, style, options.padding);
    context.drawImage(image.source, box.x, box.y, box.width, box.height);
    return canvas;
  }

  async png(image: LoadedImage, size: number, style: IconStyle, options: DrawOptions): Promise<Blob> {
    const canvas = this.draw(image, size, style, options);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('The icon could not be drawn.');
    return blob;
  }
}
