import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { Point, Rect, canvasPoint, rectBetween } from '../../shared/canvas-pointer';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob, copyCanvas, sameOutput } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';

export type Effect = 'pixelate' | 'blur' | 'black';

export interface Region extends Rect {
  effect: Effect;
  strength: number;
}

/** Pixel block size or blur radius for a strength of 1 to 10, scaled to the image size. */
export function effectSize(strength: number, imageWidth: number, imageHeight: number): number {
  return Math.max(2, Math.round((strength / 10) * Math.max(imageWidth, imageHeight) * 0.03));
}

const CONTENT: ToolContent = {
  aboutHeading: 'About this blur and pixelate tool',
  about:
    'Hide private details before you share a screenshot or photo: passwords, email addresses, phone numbers, API ' +
    'keys, faces and number plates. Drag a box over each area and choose pixelate, blur or a solid black bar. The ' +
    'effect is drawn into the pixels of the saved image, so the hidden text cannot be revealed by removing a layer.',
  steps: [
    'Drop or paste a screenshot or photo.',
    'Pick Pixelate, Blur or Black bar and its strength, then drag boxes over the private parts.',
    'Download the image or copy it straight into a chat or ticket.',
  ],
  faq: [
    {
      question: 'Which is safest: blur, pixelate or a black bar?',
      answer:
        'A solid black bar is the only effect that removes the information completely. Light blur or small pixels on ' +
        'short text can sometimes be guessed back, so use a strong setting or the black bar for passwords and keys.',
    },
    { question: 'Is my screenshot uploaded?', answer: 'No. Everything is drawn in your browser.' },
  ],
};

@Component({
  selector: 'app-image-redactor',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="image-redactor" [content]="content" [wide]="true" privacy="Your image is edited in your browser and never uploaded.">
      @if (!image()) {
        <app-upload-box title="Drop or paste a screenshot here" buttonLabel="Choose image" [hint]="'Up to ' + maxSize + '. Press Ctrl+V or Cmd+V to paste a screenshot.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Effect">
            @for (e of effects; track e.id) {
              <button type="button" role="radio" class="rounded-full px-3 py-1.5 font-semibold" [class]="effect() === e.id ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="effect() === e.id" (click)="effect.set(e.id)">{{ e.label }}</button>
            }
          </div>
          @if (effect() !== 'black') {
            <label class="flex items-center gap-2 font-semibold">Strength
              <input type="range" min="1" max="10" class="w-32 accent-brand" aria-label="Strength" [value]="strength()" (input)="strength.set($any($event.target).valueAsNumber)" />
            </label>
          }
          <button type="button" class="btn-small" [disabled]="!regions().length" (click)="undo()">Undo</button>
          <button type="button" class="btn-small" [disabled]="!regions().length" (click)="regions.set([])">Clear all</button>
          <span class="text-muted">{{ regions().length }} {{ regions().length === 1 ? 'area' : 'areas' }} hidden</span>
        </div>
        <p class="mt-2 text-sm text-muted">Drag on the image to hide an area.</p>
        <div class="mt-2 overflow-auto rounded-xl border border-line">
          <canvas #canvas class="mx-auto block max-h-[75vh] max-w-full cursor-crosshair touch-none" role="img" aria-label="Image being redacted" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)"></canvas>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" (click)="download()">Download</button>
          <button type="button" class="btn-secondary" (click)="copy()">{{ copied() ? 'Copied' : 'Copy image' }}</button>
          <button type="button" class="btn-secondary" (click)="reset()">Another image</button>
        </div>
      }
    </app-tool-page>
  `,
})
export class ImageRedactor {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly effects: { id: Effect; label: string }[] = [
    { id: 'pixelate', label: 'Pixelate' },
    { id: 'blur', label: 'Blur' },
    { id: 'black', label: 'Black bar' },
  ];
  protected readonly image = signal<HTMLCanvasElement | null>(null);
  protected readonly regions = signal<Region[]>([]);
  protected readonly effect = signal<Effect>('pixelate');
  protected readonly strength = signal(6);
  protected readonly error = signal('');
  protected readonly copied = signal(false);
  private readonly draft = signal<Rect | null>(null);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly encoder = inject(ImageEncoder);
  private start: Point | null = null;
  private file: File | null = null;

  constructor() {
    afterRenderEffect(() => {
      const canvas = this.canvas()?.nativeElement;
      const image = this.image();
      const regions = this.regions();
      const draft = this.draft();
      if (canvas && image) this.render(canvas, image, regions, draft);
    });
    inject(DestroyRef).onDestroy(() => this.reset());
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
      this.image.set(bitmapToCanvas(bitmap));
      bitmap.close();
      this.file = file;
      this.regions.set([]);
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  private render(canvas: HTMLCanvasElement, image: HTMLCanvasElement, regions: Region[], draft: Rect | null): void {
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    for (const region of regions) applyEffect(context, image, region);
    if (draft) {
      context.save();
      context.strokeStyle = '#4f46e5';
      context.lineWidth = Math.max(2, image.width / 400);
      context.setLineDash([8, 6]);
      context.strokeRect(draft.x, draft.y, draft.width, draft.height);
      context.restore();
    }
  }

  protected down(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    canvas.setPointerCapture?.(event.pointerId);
    this.start = canvasPoint(canvas, event);
  }

  protected move(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !this.start) return;
    this.draft.set(rectBetween(this.start, canvasPoint(canvas, event), canvas.width, canvas.height));
  }

  protected up(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !this.start) return;
    const rect = rectBetween(this.start, canvasPoint(canvas, event), canvas.width, canvas.height);
    this.start = null;
    this.draft.set(null);
    if (rect.width > 3 && rect.height > 3) this.regions.update((list) => [...list, { ...rect, effect: this.effect(), strength: this.strength() }]);
  }

  protected undo(): void {
    this.regions.update((list) => list.slice(0, -1));
  }

  protected async download(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !this.file) return;
    const { type, extension } = sameOutput(this.file.type);
    downloadBlob(await canvasToBlob(canvas, type, 0.95), `${baseName(this.file.name)}-redacted.${extension}`);
  }

  protected async copy(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (canvas && (await copyCanvas(canvas))) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } else {
      this.error.set('This browser cannot copy images. Use Download instead.');
    }
  }

  protected reset(): void {
    const image = this.image();
    if (image) image.width = image.height = 0;
    this.image.set(null);
    this.regions.set([]);
    this.file = null;
  }
}

/** Draws one hidden area onto the context, reading the original pixels from `image`. */
export function applyEffect(context: CanvasRenderingContext2D, image: HTMLCanvasElement, region: Region): void {
  const { x, y, width, height } = region;
  if (region.effect === 'black') {
    context.fillStyle = '#000000';
    context.fillRect(x, y, width, height);
    return;
  }
  const size = effectSize(region.strength, image.width, image.height);
  if (region.effect === 'pixelate') {
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(width / size));
    small.height = Math.max(1, Math.ceil(height / size));
    small.getContext('2d')!.drawImage(image, x, y, width, height, 0, 0, small.width, small.height);
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(small, 0, 0, small.width, small.height, x, y, width, height);
    context.restore();
    small.width = small.height = 0;
    return;
  }
  // Blur: take a margin around the area so the edges blur with their surroundings, then clip.
  const margin = size * 2;
  const piece = document.createElement('canvas');
  piece.width = width + margin * 2;
  piece.height = height + margin * 2;
  const pieceContext = piece.getContext('2d')!;
  pieceContext.filter = `blur(${size}px)`;
  if (pieceContext.filter === `blur(${size}px)`) {
    pieceContext.drawImage(image, x - margin, y - margin, piece.width, piece.height, 0, 0, piece.width, piece.height);
  } else {
    // Browsers without canvas filters: shrink and enlarge with smoothing, which blurs as well.
    const tiny = document.createElement('canvas');
    tiny.width = Math.max(1, Math.round(piece.width / size));
    tiny.height = Math.max(1, Math.round(piece.height / size));
    tiny.getContext('2d')!.drawImage(image, x - margin, y - margin, piece.width, piece.height, 0, 0, tiny.width, tiny.height);
    pieceContext.imageSmoothingQuality = 'high';
    pieceContext.drawImage(tiny, 0, 0, piece.width, piece.height);
    tiny.width = tiny.height = 0;
  }
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(piece, x - margin, y - margin);
  context.restore();
  piece.width = piece.height = 0;
}
