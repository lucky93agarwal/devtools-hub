import { Component, DestroyRef, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { BeforeAfter } from '../background-remover/before-after';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';

const CONTENT: ToolContent = {
  aboutHeading: 'About this AI image upscaler',
  about:
    'Make a small or blurry image two or four times bigger with an AI super-resolution model (ESRGAN) that runs in ' +
    'your browser. Instead of just stretching the pixels, the model adds back sharp edges and fine detail, which ' +
    'works well for old photos, small logos, screenshots and product pictures. The model is under 1 MB and stays ' +
    'in your browser after the first use. Compare the result with a normal enlargement using the slider.',
  steps: [
    'Drop a small image (up to 1000 px for 2x, 512 px for 4x).',
    'Choose 2x or 4x and press Upscale. It takes a few seconds to a minute.',
    'Compare before and after, then download the PNG.',
  ],
  faq: [
    {
      question: 'Why is there a size limit?',
      answer:
        'The AI runs on your device, and every pixel takes work. Larger images would take minutes and could run out ' +
        'of memory on phones. Crop to the part you need first, or resize a big image down before upscaling.',
    },
    {
      question: 'Can it recover any detail?',
      answer:
        'It sharpens edges and textures it can infer, but it cannot invent text or faces that are not in the image. ' +
        'Very tiny or heavily compressed images improve less.',
    },
    { question: 'Is my image uploaded?', answer: 'No. The model and your image stay in your browser.' },
  ],
};

/** Longest input side per scale, to keep the work and memory reasonable. */
export const MAX_INPUT = { 2: 1000, 4: 512 } as const;

@Component({
  selector: 'app-image-upscaler',
  imports: [ToolPage, UploadBox, BeforeAfter],
  template: `
    <app-tool-page path="image-upscaler" [content]="content" privacy="The AI runs in your browser. Your image is never uploaded.">
      @if (!source()) {
        <app-upload-box title="Drop a small image here" buttonLabel="Choose image" [hint]="'Best for images up to 1000 px. Up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        @let s = source()!;
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Scale">
            @for (n of [2, 4]; track n) {
              <button type="button" role="radio" class="rounded-full px-4 py-1.5 font-semibold" [class]="scale() === n ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="scale() === n" [disabled]="working()" (click)="setScale($any(n))">{{ n }}x</button>
            }
          </div>
          <button type="button" class="btn-primary" [disabled]="working()" (click)="upscale()">{{ working() ? 'Upscaling… ' + progress() + '%' : 'Upscale' }}</button>
          <button type="button" class="btn-secondary" [disabled]="working()" (click)="reset()">Another image</button>
          <span class="text-muted">{{ s.width }}×{{ s.height }} → {{ s.width * scale() }}×{{ s.height * scale() }} px</span>
        </div>
        @if (note()) { <p class="mt-2 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm">{{ note() }}</p> }
        @if (error()) { <p class="mt-2 text-sm text-danger">{{ error() }}</p> }
        @if (working()) {
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label="Upscaling progress" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-brand transition-[width]" [style.width.%]="progress()"></div>
          </div>
        }
        @if (result(); as r) {
          <div class="mt-4 flex flex-col gap-3">
            <app-before-after [before]="s.url" [after]="r.url" [width]="r.width" [height]="r.height" />
            <p class="text-sm text-muted">Left: normal enlargement. Right: AI upscaled. {{ r.width }}×{{ r.height }} px, {{ formatBytes(r.blob.size) }}, in {{ r.seconds }} s.</p>
            <button type="button" class="btn-primary self-start" (click)="download()">Download PNG</button>
          </div>
        } @else {
          <img [src]="s.url" alt="Original image" class="mt-4 max-h-96 rounded-xl border border-line" />
        }
      }
    </app-tool-page>
  `,
})
export class ImageUpscaler {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly source = signal<{ canvas: HTMLCanvasElement; url: string; width: number; height: number } | null>(null);
  protected readonly result = signal<{ url: string; blob: Blob; width: number; height: number; seconds: number } | null>(null);
  protected readonly scale = signal<2 | 4>(2);
  protected readonly working = signal(false);
  protected readonly progress = signal(0);
  protected readonly note = signal('');
  protected readonly error = signal('');
  private readonly encoder = inject(ImageEncoder);
  private original: ImageBitmap | null = null;
  private fileName = 'image';
  private upscalers = new Map<number, { upscale: (input: string, options: object) => Promise<string>; dispose: () => Promise<void> }>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.reset();
      for (const u of this.upscalers.values()) void u.dispose();
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
      this.original?.close();
      this.original = await this.encoder.read(file);
      this.fileName = baseName(file.name);
      this.error.set('');
      await this.prepare();
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  protected async setScale(scale: 2 | 4): Promise<void> {
    this.scale.set(scale);
    await this.prepare();
  }

  /** The input at the size this scale allows, shrunk if needed. */
  private async prepare(): Promise<void> {
    const original = this.original;
    if (!original) return;
    this.clearResult();
    const old = this.source();
    if (old) URL.revokeObjectURL(old.url);
    const limit = MAX_INPUT[this.scale()];
    const canvas = bitmapToCanvas(original, limit);
    this.note.set(
      canvas.width < original.width
        ? `This image is ${original.width}×${original.height} px, so it was reduced to ${canvas.width}×${canvas.height} px before ${this.scale()}x upscaling, to keep it fast. Crop it first to upscale a part at full detail.`
        : '',
    );
    const url = URL.createObjectURL(await canvasToBlob(canvas));
    this.source.set({ canvas, url, width: canvas.width, height: canvas.height });
  }

  private async upscaler(scale: 2 | 4) {
    const existing = this.upscalers.get(scale);
    if (existing) return existing;
    const [{ default: Upscaler }, model] = await Promise.all([
      import('upscaler'),
      scale === 2 ? import('@upscalerjs/esrgan-slim/2x') : import('@upscalerjs/esrgan-slim/4x'),
    ]);
    // Load the model from this site instead of a CDN.
    const instance = new Upscaler({ model: { ...model.default, path: `/upscale/x${scale}/model.json` } });
    const wrapped = {
      upscale: (input: string, options: object) => instance.upscale(input, options) as Promise<string>,
      dispose: () => instance.dispose(),
    };
    this.upscalers.set(scale, wrapped);
    return wrapped;
  }

  protected async upscale(): Promise<void> {
    const source = this.source();
    if (!source || this.working()) return;
    this.working.set(true);
    this.progress.set(0);
    this.error.set('');
    const started = performance.now();
    try {
      const upscaler = await this.upscaler(this.scale());
      const dataUrl = await upscaler.upscale(source.url, {
        output: 'base64',
        patchSize: 64,
        padding: 4,
        awaitNextFrame: true,
        progress: (amount: number) => this.progress.set(Math.round(amount * 100)),
      });
      const blob = await (await fetch(dataUrl)).blob();
      this.clearResult();
      this.result.set({
        url: URL.createObjectURL(blob),
        blob,
        width: source.width * this.scale(),
        height: source.height * this.scale(),
        seconds: Math.round((performance.now() - started) / 100) / 10,
      });
    } catch {
      this.error.set('The image could not be upscaled. Try a smaller image or 2x.');
    } finally {
      this.working.set(false);
    }
  }

  protected download(): void {
    const result = this.result();
    if (result) downloadBlob(result.blob, `${this.fileName}-${this.scale()}x.png`);
  }

  private clearResult(): void {
    const result = this.result();
    if (result) URL.revokeObjectURL(result.url);
    this.result.set(null);
  }

  protected reset(): void {
    this.clearResult();
    const source = this.source();
    if (source) URL.revokeObjectURL(source.url);
    this.source.set(null);
    this.original?.close();
    this.original = null;
    this.note.set('');
  }
}
