import { Injectable, inject } from '@angular/core';
import { ImageEncoder, ImageFormat } from '../image-converter/image-encoder';
import { Rect } from './crop-math';

/**
 * Canvas work for the cropper: opening any format the converter reads, turning,
 * flipping and cutting. Kept as a service so tests can swap it out (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class CropCanvas {
  private readonly encoder = inject(ImageEncoder);

  async open(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await this.encoder.read(file);
    try {
      const canvas = this.blank(bitmap.width, bitmap.height);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      return canvas;
    } finally {
      bitmap.close();
    }
  }

  /** A quarter turn, clockwise or anticlockwise. */
  rotate(source: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
    const canvas = this.blank(source.height, source.width);
    const context = canvas.getContext('2d')!;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(((clockwise ? 1 : -1) * Math.PI) / 2);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
  }

  flip(source: HTMLCanvasElement, horizontal: boolean): HTMLCanvasElement {
    const canvas = this.blank(source.width, source.height);
    const context = canvas.getContext('2d')!;
    if (horizontal) context.setTransform(-1, 0, 0, 1, source.width, 0);
    else context.setTransform(1, 0, 0, -1, 0, source.height);
    context.drawImage(source, 0, 0);
    return canvas;
  }

  /** Cuts out `rect`; a circle leaves the corners transparent, for profile pictures. */
  async crop(
    source: HTMLCanvasElement,
    rect: Rect,
    circle: boolean,
    format: ImageFormat,
    quality: number,
  ): Promise<Blob> {
    const canvas = this.blank(rect.width, rect.height);
    const context = canvas.getContext('2d')!;
    if (circle) {
      context.beginPath();
      context.ellipse(rect.width / 2, rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
      context.clip();
    }
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return this.encoder.write(canvas, format, quality);
  }

  /** PNG of the whole canvas, for the on-screen preview. */
  async preview(source: HTMLCanvasElement): Promise<Blob> {
    return this.encoder.write(source, 'png', 1);
  }

  private blank(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
}
