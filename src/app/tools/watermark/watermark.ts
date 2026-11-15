import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { buildZip } from '../image-converter/zip';
import { MarkPosition, POSITIONS, outputType, placeMark, tileCentres } from './watermark-layout';

const CONTENT: ToolContent = {
  aboutHeading: 'About this watermark tool',
  about:
    'Add a text or logo watermark to many images at once, right in your browser. Type your name, website or a ' +
    'copyright line, or use your logo with transparency, then place it in a corner, in the middle or repeated ' +
    'across the whole image. Set the size, opacity, colour and angle, check the preview and download every image ' +
    'as a ZIP. Each image keeps its format: JPG stays JPG, PNG stays PNG.',
  steps: [
    'Drop up to 50 images or a folder.',
    'Choose Text or Logo, then the position, size, opacity and angle.',
    'Check the preview, then download one image or all of them as a ZIP.',
  ],
  faq: [
    {
      question: 'Can a watermark be removed?',
      answer:
        'A small corner mark can be cropped off. A large, half-transparent mark repeated across the image (Tile) is ' +
        'much harder to remove, so use it for photos you need to protect.',
    },
    {
      question: 'Is the watermark the same size on every image?',
      answer: 'It is sized as a share of each image\'s width, so it looks the same on big and small images.',
    },
    { question: 'Are my images uploaded?', answer: 'No. The watermark is drawn on your device with a canvas.' },
  ],
};

interface MarkSettings {
  kind: 'text' | 'logo';
  text: string;
  colour: string;
  logo: ImageBitmap | null;
  position: MarkPosition;
  size: number;
  opacity: number;
  angle: number;
  margin: number;
}

interface Picked {
  id: number;
  file: File;
}

@Component({
  selector: 'app-watermark',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="watermark" [content]="content" [wide]="true" privacy="Watermarks are added in your browser. Your images are never uploaded.">
      @if (!images().length) {
        <app-upload-box [title]="'Drop up to ' + maxImages + ' images or a folder here'" buttonLabel="Choose images" [hint]="'JPG, PNG, WebP, HEIC and more, up to ' + maxSize + ' each.'" [accept]="accept" [multiple]="true" [folders]="true" (filesSelected)="add($event)" />
      } @else {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <label class="font-semibold">Preview
                <select class="field ml-2" aria-label="Preview image" (change)="selected.set(+$any($event.target).value)">
                  @for (image of images(); track image.id; let i = $index) { <option [value]="i" [selected]="i === selected()">{{ image.file.name }}</option> }
                </select>
              </label>
              <span class="text-muted">{{ images().length }} {{ images().length === 1 ? 'image' : 'images' }}</span>
            </div>
            <div class="mt-3 overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
              <canvas #preview class="mx-auto block max-h-[70vh] max-w-full" role="img" aria-label="Watermark preview"></canvas>
            </div>
            @if (error()) { <p class="mt-2 text-sm text-danger">{{ error() }}</p> }
          </div>

          <fieldset class="card flex flex-col gap-4 p-4 text-sm leading-5" [disabled]="saving()">
            <legend class="sr-only">Watermark settings</legend>
            <div class="flex rounded-full border border-line p-0.5 w-fit" role="radiogroup" aria-label="Watermark type">
              <button type="button" role="radio" class="rounded-full px-4 py-1.5 font-semibold" [class]="kind() === 'text' ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="kind() === 'text'" (click)="kind.set('text')">Text</button>
              <button type="button" role="radio" class="rounded-full px-4 py-1.5 font-semibold" [class]="kind() === 'logo' ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="kind() === 'logo'" (click)="kind.set('logo')">Logo</button>
            </div>
            @if (kind() === 'text') {
              <label class="flex flex-col gap-1"><span class="font-semibold">Text</span>
                <input class="field" aria-label="Watermark text" [value]="text()" (input)="text.set($any($event.target).value)" />
              </label>
              <label class="flex items-center justify-between gap-3"><span class="font-semibold">Colour</span>
                <input type="color" class="h-9 w-16 cursor-pointer rounded-lg border border-line" aria-label="Text colour" [value]="colour()" (input)="colour.set($any($event.target).value)" />
              </label>
            } @else {
              <div class="flex items-center gap-2">
                <button type="button" class="btn-small" (click)="logoInput.click()">{{ logo() ? 'Change logo…' : 'Choose logo…' }}</button>
                <span class="truncate text-muted">{{ logoName() || 'PNG with transparency works best' }}</span>
                <input #logoInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept="image/*,.svg" (change)="chooseLogo(logoInput)" />
              </div>
            }
            <div class="flex flex-col gap-1">
              <span class="font-semibold">Position</span>
              <div class="grid w-fit grid-cols-3 gap-1" role="radiogroup" aria-label="Position">
                @for (p of positions; track p) {
                  <button type="button" role="radio" class="size-9 rounded-lg border" [class]="position() === p ? 'border-brand bg-brand/20' : 'border-line'" [attr.aria-checked]="position() === p" [attr.aria-label]="p" (click)="position.set(p)"></button>
                }
              </div>
              <label class="mt-1 flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="position() === 'tile'" (change)="position.set($any($event.target).checked ? 'tile' : 'bottom-right')" /> Repeat across the image (tile)</label>
            </div>
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Size</span>{{ size() }}% of width</span>
              <input type="range" min="5" max="80" class="accent-brand" aria-label="Size" [value]="size()" (input)="size.set($any($event.target).valueAsNumber)" />
            </label>
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Opacity</span>{{ opacity() }}%</span>
              <input type="range" min="10" max="100" step="5" class="accent-brand" aria-label="Opacity" [value]="opacity()" (input)="opacity.set($any($event.target).valueAsNumber)" />
            </label>
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Angle</span>{{ angle() }}°</span>
              <input type="range" min="-60" max="60" step="5" class="accent-brand" aria-label="Angle" [value]="angle()" (input)="angle.set($any($event.target).valueAsNumber)" />
            </label>
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Margin</span>{{ margin() }}%</span>
              <input type="range" min="0" max="15" class="accent-brand" aria-label="Margin" [value]="margin()" (input)="margin.set($any($event.target).valueAsNumber)" />
            </label>
            <button type="button" class="btn-primary" (click)="downloadAll()">{{ saving() ? 'Saving…' : images().length === 1 ? 'Download image' : 'Download all (ZIP)' }}</button>
            <button type="button" class="btn-secondary" (click)="images.set([])">Choose other images</button>
          </fieldset>
        </div>
      }
    </app-tool-page>
  `,
})
export class Watermark {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxImages = LIMITS.MAX_IMAGES;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly positions = POSITIONS;

  protected readonly images = signal<Picked[]>([]);
  protected readonly selected = signal(0);
  protected readonly kind = signal<'text' | 'logo'>('text');
  protected readonly text = signal('© DevTools24');
  protected readonly colour = signal('#ffffff');
  protected readonly logo = signal<ImageBitmap | null>(null);
  protected readonly logoName = signal('');
  protected readonly position = signal<MarkPosition>('bottom-right');
  protected readonly size = signal(25);
  protected readonly opacity = signal(60);
  protected readonly angle = signal(0);
  protected readonly margin = signal(3);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  private readonly current = computed(() => this.images()[this.selected()] ?? null);
  private readonly previewCanvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private readonly encoder = inject(ImageEncoder);
  private bitmapCache: { id: number; bitmap: ImageBitmap } | null = null;
  private nextId = 0;
  private drawRun = 0;

  constructor() {
    afterRenderEffect(() => {
      const canvas = this.previewCanvas()?.nativeElement;
      const picked = this.current();
      const settings = this.settings();
      if (canvas && picked) void this.drawPreview(canvas, picked, settings);
    });
    inject(DestroyRef).onDestroy(() => {
      this.bitmapCache?.bitmap.close();
      this.logo()?.close();
    });
  }

  /** Every setting, read together so the preview redraws when any of them changes. */
  private readonly settings = computed<MarkSettings>(() => ({
    kind: this.kind(),
    text: this.text(),
    colour: this.colour(),
    logo: this.logo(),
    position: this.position(),
    size: this.size(),
    opacity: this.opacity(),
    angle: this.angle(),
    margin: this.margin(),
  }));

  protected add(files: File[]): void {
    const usable = files.filter((f) => f.size <= LIMITS.MAX_IMAGE_BYTES).slice(0, LIMITS.MAX_IMAGES);
    this.error.set(usable.length < files.length ? `Some files were left out: up to ${LIMITS.MAX_IMAGES} images of ${this.maxSize} each.` : '');
    this.images.set(usable.map((file) => ({ id: ++this.nextId, file })));
    this.selected.set(0);
  }

  protected async chooseLogo(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    try {
      const bitmap = await this.encoder.read(file);
      this.logo()?.close();
      this.logo.set(bitmap);
      this.logoName.set(file.name);
    } catch {
      this.error.set('This logo could not be read.');
    }
  }

  private async bitmapFor(picked: Picked): Promise<ImageBitmap> {
    if (this.bitmapCache?.id === picked.id) return this.bitmapCache.bitmap;
    const bitmap = await this.encoder.read(picked.file);
    this.bitmapCache?.bitmap.close();
    this.bitmapCache = { id: picked.id, bitmap };
    return bitmap;
  }

  private async drawPreview(canvas: HTMLCanvasElement, picked: Picked, settings: MarkSettings): Promise<void> {
    const run = ++this.drawRun;
    try {
      const bitmap = await this.bitmapFor(picked);
      if (run !== this.drawRun) return;
      // The preview is drawn smaller; the mark scales with the image, so it looks the same.
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      this.paint(canvas.getContext('2d')!, bitmap, canvas.width, canvas.height, settings);
    } catch {
      this.error.set(`${picked.file.name} could not be read.`);
    }
  }

  private paint(context: CanvasRenderingContext2D, image: ImageBitmap, width: number, height: number, s: MarkSettings): void {
    context.drawImage(image, 0, 0, width, height);
    const markWidth = (s.size / 100) * width;
    let markHeight: number;
    let drawMark: (x: number, y: number) => void;
    if (s.kind === 'logo') {
      if (!s.logo) return;
      markHeight = (markWidth * s.logo.height) / s.logo.width;
      const logo = s.logo;
      drawMark = (x, y) => context.drawImage(logo, x, y, markWidth, markHeight);
    } else {
      if (!s.text.trim()) return;
      // Fit the text to the chosen share of the width.
      context.font = `600 100px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      const fontSize = (100 * markWidth) / Math.max(1, context.measureText(s.text).width);
      context.font = `600 ${fontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      context.textBaseline = 'top';
      markHeight = fontSize * 1.15;
      drawMark = (x, y) => {
        context.shadowColor = 'rgba(0,0,0,0.35)';
        context.shadowBlur = fontSize / 12;
        context.fillStyle = s.colour;
        context.fillText(s.text, x, y);
      };
    }
    const margin = (s.margin / 100) * Math.min(width, height);
    const centres =
      s.position === 'tile'
        ? tileCentres(width, height, markWidth, markHeight, markWidth * 0.6)
        : [(({ x, y }) => ({ x: x + markWidth / 2, y: y + markHeight / 2 }))(placeMark(s.position, width, height, markWidth, markHeight, margin))];
    context.save();
    context.globalAlpha = s.opacity / 100;
    for (const centre of centres) {
      context.save();
      context.translate(centre.x, centre.y);
      context.rotate((s.angle * Math.PI) / 180);
      drawMark(-markWidth / 2, -markHeight / 2);
      context.restore();
    }
    context.restore();
  }

  private async render(picked: Picked): Promise<{ name: string; blob: Blob }> {
    const bitmap = await this.encoder.read(picked.file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const { type, extension } = outputType(picked.file.type);
    const context = canvas.getContext('2d')!;
    this.paint(context, bitmap, canvas.width, canvas.height, this.settings());
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('save');
    return { name: `${baseName(picked.file.name)}-watermarked.${extension}`, blob };
  }

  protected async downloadAll(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const files = [];
      for (const picked of this.images()) files.push(await this.render(picked));
      if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
      else downloadBlob(await buildZip(files), 'watermarked-images.zip');
    } catch {
      this.error.set('Some images could not be saved. Try fewer or smaller images.');
    } finally {
      this.saving.set(false);
    }
  }
}
