import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { canvasPoint } from '../../shared/canvas-pointer';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob, sameOutput } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { strokePoints } from '../background-remover/mask-editor';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { dilate } from './inpaint';
import type { InpaintRequest } from './inpaint.worker';

const CONTENT: ToolContent = {
  aboutHeading: 'About this object remover',
  about:
    'Remove unwanted things from a photo: a watermark or date stamp, a power line, a stain, a sign or a small ' +
    'object in the background. Paint over it and the gap is filled with matching texture copied from around it, ' +
    'using exemplar-based inpainting. It works best on grass, sky, walls, sand, water and plain backgrounds. Large ' +
    'objects in front of detailed scenes may need a few smaller passes. Nothing is uploaded and no AI model is ' +
    'downloaded, so it is quick even on phones.',
  steps: [
    'Drop a photo.',
    'Paint over what you want to remove, a little past its edges.',
    'Press Remove; repeat for other spots, use Undo if needed, then download.',
  ],
  faq: [
    {
      question: 'Why does the fill look wrong sometimes?',
      answer:
        'The fill copies texture from nearby, so it cannot invent things it cannot see, such as the hidden half of a ' +
        'face. Work in smaller parts, paint a little wider, or remove one object at a time.',
    },
    {
      question: 'Is it legal to remove a watermark?',
      answer: 'Only from your own images or ones you have the rights to. Removing a photographer\'s watermark to reuse their work is not allowed.',
    },
    { question: 'Is my photo uploaded?', answer: 'No. The fill is worked out on your device.' },
  ],
};

/** The hole is worked on at most this many pixels across, which keeps the fill fast. */
const WORK_SIDE = 160;
const MAX_UNDO = 6;

@Component({
  selector: 'app-object-remover',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="object-remover" [content]="content" [wide]="true" privacy="Everything happens on your device. Your photo is never uploaded.">
      @if (!image()) {
        <app-upload-box title="Drop a photo here" buttonLabel="Choose image" [hint]="'JPG, PNG, HEIC, WebP and more, up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <label class="flex items-center gap-2 font-semibold">Brush {{ brush() }}px
            <input type="range" min="6" max="120" class="w-32 accent-brand" aria-label="Brush size" [value]="brush()" (input)="brush.set($any($event.target).valueAsNumber)" />
          </label>
          <button type="button" class="btn-primary" [disabled]="!painted() || working()" (click)="remove()">{{ working() ? 'Removing…' : 'Remove' }}</button>
          <button type="button" class="btn-small" [disabled]="!painted() || working()" (click)="clearMask()">Clear paint</button>
          <button type="button" class="btn-small" [disabled]="!history().length || working()" (click)="undo()">Undo</button>
        </div>
        <p class="mt-2 text-sm text-muted">Paint over the object, a little past its edges, then press Remove.</p>
        <div class="relative mt-2 overflow-hidden rounded-xl border border-line" (pointerleave)="cursor.set(null)">
          <canvas #view class="mx-auto block max-h-[75vh] max-w-full touch-none" [style.cursor]="'none'" role="img" aria-label="Photo being edited" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)"></canvas>
          @if (cursor(); as c) {
            <span class="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" [style.left.px]="c.x - brush() / 2" [style.top.px]="c.y - brush() / 2" [style.width.px]="brush()" [style.height.px]="brush()"></span>
          }
        </div>
        @if (error()) { <p class="mt-2 text-sm text-danger">{{ error() }}</p> }
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" [disabled]="working()" (click)="download()">Download</button>
          <button type="button" class="btn-secondary" (click)="reset()">Another photo</button>
        </div>
      }
    </app-tool-page>
  `,
})
export class ObjectRemover {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly image = signal<HTMLCanvasElement | null>(null);
  protected readonly history = signal<HTMLCanvasElement[]>([]);
  protected readonly brush = signal(36);
  protected readonly painted = signal(false);
  protected readonly working = signal(false);
  protected readonly error = signal('');
  protected readonly cursor = signal<{ x: number; y: number } | null>(null);
  /** Bumped after painting, so the view redraws. */
  private readonly paintTick = signal(0);
  private readonly view = viewChild<ElementRef<HTMLCanvasElement>>('view');
  private readonly encoder = inject(ImageEncoder);
  private mask: HTMLCanvasElement | null = null;
  private last: { x: number; y: number } | null = null;
  private file: File | null = null;
  private worker?: Worker;

  constructor() {
    afterRenderEffect(() => {
      const view = this.view()?.nativeElement;
      const image = this.image();
      this.paintTick();
      if (!view || !image) return;
      view.width = image.width;
      view.height = image.height;
      const context = view.getContext('2d')!;
      context.drawImage(image, 0, 0);
      if (this.mask) {
        context.globalAlpha = 0.5;
        context.drawImage(this.mask, 0, 0);
        context.globalAlpha = 1;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.worker?.terminate();
      this.reset();
    });
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    try {
      const bitmap = await this.encoder.read(file);
      const canvas = bitmapToCanvas(bitmap, 4096);
      bitmap.close();
      this.file = file;
      this.history.set([]);
      this.newMask(canvas.width, canvas.height);
      this.image.set(canvas);
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  private newMask(width: number, height: number): void {
    this.mask = document.createElement('canvas');
    this.mask.width = width;
    this.mask.height = height;
    this.painted.set(false);
    this.paintTick.update((n) => n + 1);
  }

  private paintAt(event: PointerEvent): void {
    const view = this.view()?.nativeElement;
    if (!view || !this.mask) return;
    const point = canvasPoint(view, event);
    const radius = ((this.brush() / 2) * view.width) / view.getBoundingClientRect().width;
    const points = this.last ? strokePoints(this.last, point, radius) : [point];
    const context = this.mask.getContext('2d')!;
    context.fillStyle = '#ff2d55';
    context.beginPath();
    for (const p of points) {
      context.moveTo(p.x + radius, p.y);
      context.arc(p.x, p.y, radius, 0, Math.PI * 2);
    }
    context.fill();
    this.last = point;
    this.painted.set(true);
    this.paintTick.update((n) => n + 1);
  }

  protected down(event: PointerEvent): void {
    if (this.working()) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.last = null;
    this.paintAt(event);
  }

  protected move(event: PointerEvent): void {
    const view = this.view()?.nativeElement;
    if (view) {
      const box = view.parentElement!.getBoundingClientRect();
      this.cursor.set({ x: event.clientX - box.left, y: event.clientY - box.top });
    }
    if (this.last) this.paintAt(event);
  }

  protected up(event: PointerEvent): void {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.last = null;
  }

  protected clearMask(): void {
    const image = this.image();
    if (image) this.newMask(image.width, image.height);
  }

  protected async remove(): Promise<void> {
    const image = this.image();
    const mask = this.mask;
    if (!image || !mask || this.working()) return;
    this.working.set(true);
    this.error.set('');
    try {
      const result = await this.fill(image, mask);
      this.history.update((list) => [...list, image].slice(-MAX_UNDO));
      this.image.set(result);
      this.newMask(result.width, result.height);
    } catch {
      this.error.set('The area could not be filled. Try painting a smaller area.');
    } finally {
      this.working.set(false);
    }
  }

  /** Fills the painted area of `image` and returns a new canvas. */
  private async fill(image: HTMLCanvasElement, mask: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    const { width, height } = image;
    const alpha = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return image;
    const holeSide = Math.max(maxX - minX + 1, maxY - minY + 1);
    // Work on the hole plus its surroundings, scaled so the hole is at most WORK_SIDE pixels.
    const margin = Math.max(48, Math.round(holeSide * 0.8));
    const crop = { x: Math.max(0, minX - margin), y: Math.max(0, minY - margin), x2: Math.min(width, maxX + 1 + margin), y2: Math.min(height, maxY + 1 + margin) };
    const cropW = crop.x2 - crop.x;
    const cropH = crop.y2 - crop.y;
    const scale = Math.min(1, WORK_SIDE / holeSide);
    const w = Math.max(8, Math.round(cropW * scale));
    const h = Math.max(8, Math.round(cropH * scale));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const smallContext = small.getContext('2d', { willReadFrequently: true })!;
    smallContext.drawImage(image, crop.x, crop.y, cropW, cropH, 0, 0, w, h);
    const pixels = smallContext.getImageData(0, 0, w, h);
    const maskSmall = document.createElement('canvas');
    maskSmall.width = w;
    maskSmall.height = h;
    const maskContext = maskSmall.getContext('2d', { willReadFrequently: true })!;
    maskContext.drawImage(mask, crop.x, crop.y, cropW, cropH, 0, 0, w, h);
    const maskAlpha = maskContext.getImageData(0, 0, w, h).data;
    const holes = dilate(Uint8Array.from({ length: w * h }, (_, i) => (maskAlpha[i * 4 + 3] > 0 ? 1 : 0)), w, h, 1);

    const filled = await this.runWorker({
      data: pixels.data,
      width: w,
      height: h,
      mask: holes,
      options: { patchRadius: scale < 1 ? 3 : 4, searchMargin: Math.max(24, Math.round(margin * scale)), searchStep: 2 },
    });
    smallContext.putImageData(new ImageData(new Uint8ClampedArray(filled), w, h), 0, 0);

    // Paste the filled part back at full size, only where the user painted, with a soft edge.
    const patch = document.createElement('canvas');
    patch.width = cropW;
    patch.height = cropH;
    const patchContext = patch.getContext('2d')!;
    patchContext.imageSmoothingQuality = 'high';
    patchContext.drawImage(small, 0, 0, cropW, cropH);
    patchContext.globalCompositeOperation = 'destination-in';
    patchContext.filter = `blur(${Math.max(1, Math.round(holeSide / 100))}px)`;
    patchContext.drawImage(mask, crop.x, crop.y, cropW, cropH, 0, 0, cropW, cropH);
    patchContext.drawImage(mask, crop.x, crop.y, cropW, cropH, 0, 0, cropW, cropH);
    const result = document.createElement('canvas');
    result.width = width;
    result.height = height;
    const resultContext = result.getContext('2d', { willReadFrequently: true })!;
    resultContext.drawImage(image, 0, 0);
    resultContext.drawImage(patch, crop.x, crop.y);
    small.width = small.height = maskSmall.width = maskSmall.height = patch.width = patch.height = 0;
    return result;
  }

  private runWorker(request: InpaintRequest): Promise<Uint8ClampedArray> {
    this.worker ??= new Worker(new URL('./inpaint.worker', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<Uint8ClampedArray>) => resolve(data);
      worker.onerror = () => {
        this.worker?.terminate();
        this.worker = undefined;
        reject(new Error('fill failed'));
      };
      worker.postMessage(request, [request.data.buffer]);
    });
  }

  protected undo(): void {
    const list = this.history();
    const previous = list.at(-1);
    if (!previous) return;
    this.history.set(list.slice(0, -1));
    this.image.set(previous);
    this.newMask(previous.width, previous.height);
  }

  protected async download(): Promise<void> {
    const image = this.image();
    if (!image || !this.file) return;
    const { type, extension } = sameOutput(this.file.type);
    downloadBlob(await canvasToBlob(image, type, 0.95), `${baseName(this.file.name)}-edited.${extension}`);
  }

  protected reset(): void {
    this.image.set(null);
    this.history.set([]);
    this.mask = null;
    this.file = null;
    this.painted.set(false);
  }
}
