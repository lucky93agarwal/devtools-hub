import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { copyText, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { ExportFormat, Swatch, exportPalette, extractPalette, textOn, toHex, toHsl } from './palette';

const CONTENT: ToolContent = {
  aboutHeading: 'About this colour palette extractor',
  about:
    'Pull the main colours out of any image: a screenshot, a logo, a photo or a design mock-up. The tool finds the ' +
    'most important colours with median cut, shows how much of the image each one covers and gives HEX, RGB and HSL ' +
    'values you can copy with one click. Click anywhere on the image to pick that exact pixel, and export the whole ' +
    'palette as CSS variables, SCSS, a Tailwind colour scale or JSON.',
  steps: [
    'Drop an image.',
    'Choose how many colours you want; click a swatch to copy its HEX code, or click the image to pick a pixel.',
    'Copy the palette as CSS, SCSS, Tailwind or JSON.',
  ],
  faq: [
    {
      question: 'Why are the colours slightly different from my design file?',
      answer:
        'Each swatch is the average of a group of similar pixels, and photos and compressed images have many shades. ' +
        'Use the picker on the image for one exact pixel value.',
    },
    { question: 'Is my image uploaded?', answer: 'No. The colours are worked out in your browser.' },
  ],
};

@Component({
  selector: 'app-color-palette',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="color-palette" [content]="content" privacy="Colours are worked out in your browser. Your image is never uploaded.">
      @if (!imageUrl()) {
        <app-upload-box title="Drop an image here" buttonLabel="Choose image" [hint]="'Any image up to ' + maxSize + '. You can also paste one.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="grid gap-6 md:grid-cols-2">
          <div>
            <img [src]="imageUrl()" alt="Your image; click to pick a colour" class="max-h-96 w-full cursor-crosshair rounded-xl border border-line object-contain" (click)="pick($event)" />
            <p class="mt-2 text-sm text-muted">Click the image to pick one pixel's colour.</p>
            @if (picked(); as p) {
              <div class="mt-2 flex items-center gap-3 text-sm">
                <span class="size-8 rounded-lg border border-line" [style.background]="hex(p)"></span>
                <span class="font-mono">{{ hex(p) }} · rgb({{ p.r }}, {{ p.g }}, {{ p.b }})</span>
                <app-copy-button [text]="hex(p)" ariaLabel="Copy picked colour" />
              </div>
            }
          </div>
          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-3 text-sm font-semibold">Colours: {{ count() }}
              <input type="range" min="3" max="12" class="accent-brand" aria-label="Number of colours" [value]="count()" (input)="count.set($any($event.target).valueAsNumber)" />
            </label>
            <div class="flex h-14 overflow-hidden rounded-xl" aria-hidden="true">
              @for (s of swatches(); track $index) { <span [style.background]="hex(s)" [style.flex-grow]="s.share"></span> }
            </div>
            <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Palette">
              @for (s of swatches(); track $index) {
                <li>
                  <button type="button" class="flex w-full flex-col items-start rounded-xl p-3 text-left text-xs leading-4" [style.background]="hex(s)" [style.color]="text(s)" [attr.aria-label]="'Copy ' + hex(s)" (click)="copy(hex(s))">
                    <span class="font-mono text-sm font-semibold">{{ copied() === hex(s) ? 'Copied' : hex(s) }}</span>
                    <span>rgb({{ s.r }}, {{ s.g }}, {{ s.b }})</span>
                    <span>{{ hsl(s) }}</span>
                    <span>{{ (s.share * 100).toFixed(1) }}%</span>
                  </button>
                </li>
              }
            </ul>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <select class="field" aria-label="Export format" (change)="format.set($any($event.target).value)">
                <option value="css">CSS variables</option>
                <option value="scss">SCSS</option>
                <option value="tailwind">Tailwind</option>
                <option value="json">JSON</option>
              </select>
              <app-copy-button [text]="exported()" label="Copy palette" />
              <button type="button" class="btn-small" (click)="reset()">Another image</button>
            </div>
            <pre class="overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-5" aria-label="Exported palette">{{ exported() }}</pre>
          </div>
        </div>
      }
    </app-tool-page>
  `,
})
export class ColorPalette {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly hex = toHex;
  protected readonly hsl = toHsl;
  protected readonly text = textOn;

  protected readonly imageUrl = signal('');
  protected readonly error = signal('');
  protected readonly count = signal(6);
  protected readonly format = signal<ExportFormat>('css');
  protected readonly picked = signal<{ r: number; g: number; b: number } | null>(null);
  protected readonly copied = signal('');
  private readonly pixels = signal<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  protected readonly swatches = computed<Swatch[]>(() => {
    const p = this.pixels();
    return p ? extractPalette(p.data, this.count()) : [];
  });
  protected readonly exported = computed(() => exportPalette(this.swatches(), this.format()));
  private readonly encoder = inject(ImageEncoder);

  constructor() {
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
      // About 40,000 pixels is plenty to find the main colours, and keeps it instant.
      const scale = Math.min(1, Math.sqrt(40_000 / (bitmap.width * bitmap.height)));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      // The full-size copy is for the pixel picker; very large photos are capped to save memory.
      const fullScale = Math.min(1, 4000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * fullScale);
      canvas.height = Math.round(bitmap.height * fullScale);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      this.fullPixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const small = document.createElement('canvas');
      small.width = width;
      small.height = height;
      const smallContext = small.getContext('2d', { willReadFrequently: true })!;
      smallContext.drawImage(canvas, 0, 0, width, height);
      this.pixels.set({ data: smallContext.getImageData(0, 0, width, height).data, width, height });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = canvas.height = small.width = small.height = 0;
      if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
      this.imageUrl.set(blob ? URL.createObjectURL(blob) : '');
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  private fullPixels: ImageData | null = null;

  /** The exact colour of the pixel under the click. */
  protected pick(event: MouseEvent): void {
    const image = event.target as HTMLImageElement;
    const full = this.fullPixels;
    if (!full) return;
    const rect = image.getBoundingClientRect();
    // object-contain leaves bars around the image; work out where the picture really is.
    const scale = Math.min(rect.width / full.width, rect.height / full.height);
    const left = rect.left + (rect.width - full.width * scale) / 2;
    const top = rect.top + (rect.height - full.height * scale) / 2;
    const x = Math.floor((event.clientX - left) / scale);
    const y = Math.floor((event.clientY - top) / scale);
    if (x < 0 || y < 0 || x >= full.width || y >= full.height) return;
    const i = (y * full.width + x) * 4;
    this.picked.set({ r: full.data[i], g: full.data[i + 1], b: full.data[i + 2] });
  }

  protected async copy(hex: string): Promise<void> {
    if (await copyText(hex)) {
      this.copied.set(hex);
      setTimeout(() => this.copied() === hex && this.copied.set(''), 1500);
    }
  }

  protected reset(): void {
    if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
    this.imageUrl.set('');
    this.pixels.set(null);
    this.picked.set(null);
    this.fullPixels = null;
  }
}
