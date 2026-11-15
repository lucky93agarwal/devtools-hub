import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { QUALITY_PRESETS } from '../image-converter/image-formats';
import { buildZip } from '../image-converter/zip';
import { encodeIndexedPng, savedPercent } from './png-writer';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image compressor',
  about:
    'Make PNG, JPG and WebP files much smaller without a visible change, like TinyPNG but on your own device. PNGs ' +
    'are reduced to a smart palette of up to 256 colours, which is how pngquant and TinyPNG shrink logos, icons and ' +
    'screenshots by 60 to 80%. JPG and WebP photos are re-encoded at the quality you choose, and hidden metadata ' +
    'such as camera details and GPS location is removed. If a file cannot be made smaller, the original is kept.',
  steps: [
    'Drop up to 50 images or a whole folder.',
    'Pick a quality preset or set the quality and the number of PNG colours yourself.',
    'Compare the before and after sizes, then download one image or all of them as a ZIP.',
  ],
  faq: [
    {
      question: 'Is this really lossless?',
      answer:
        'JPG and WebP compression is lossy, but at 80% quality and above most people cannot see a difference. PNG ' +
        'colour reduction is also lossy in theory; with 256 colours it is invisible for logos and screenshots, but ' +
        'photos saved as PNG may show banding, so lower the PNG setting carefully or convert photos to WebP.',
    },
    {
      question: 'Are my images uploaded like on TinyPNG?',
      answer: 'No. Everything happens in your browser, so private screenshots and photos never leave your device.',
    },
    {
      question: 'Why did a file not get smaller?',
      answer:
        'Some files are already well compressed. When the new file would be bigger, the tool keeps your original ' +
        'and says so, so you never download a worse file.',
    },
  ],
};

const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

type Output = 'same' | 'webp';

interface Item {
  id: number;
  file: File;
  status: 'waiting' | 'working' | 'done' | 'kept' | 'error';
  result?: Blob;
  name?: string;
  message?: string;
}

@Component({
  selector: 'app-image-compressor',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="image-compressor" [content]="content" privacy="Images are compressed on your device and never uploaded.">
      <app-upload-box
        [title]="'Drop up to ' + maxImages + ' images or a folder here'"
        buttonLabel="Choose images"
        [hint]="'PNG, JPG or WebP, up to ' + maxSize + ' each.'"
        [accept]="accept"
        [multiple]="true"
        [folders]="true"
        (filesSelected)="add($event)"
      />
      @if (note()) {
        <p class="mt-3 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm leading-5">{{ note() }}</p>
      }

      <fieldset class="card mt-4 grid gap-4 p-4 text-sm leading-5 sm:grid-cols-3" [disabled]="busy()">
        <legend class="sr-only">Compression settings</legend>
        <label class="flex flex-col gap-1">
          <span class="flex justify-between"><span class="font-semibold">JPG / WebP quality</span>{{ quality() }}%</span>
          <input type="range" min="30" max="95" step="5" class="accent-brand" aria-label="Quality" [value]="quality()" (input)="quality.set($any($event.target).valueAsNumber)" />
          <span class="flex flex-wrap gap-1">
            @for (preset of presets; track preset.value) {
              <button type="button" class="btn-small" [class.!border-brand]="quality() === preset.value" (click)="quality.set(preset.value)">{{ preset.label }}</button>
            }
          </span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold">PNG colours</span>
          <select class="field" aria-label="PNG colours" (change)="colours.set(+$any($event.target).value)">
            @for (n of colourOptions; track n) {
              <option [value]="n" [selected]="colours() === n">{{ n === 0 ? 'Keep all colours (lossless)' : n + ' colours' }}</option>
            }
          </select>
          <span class="text-muted">256 looks the same for logos and screenshots.</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold">Save as</span>
          <select class="field" aria-label="Save as" (change)="output.set($any($event.target).value)">
            <option value="same" [selected]="output() === 'same'">Same format</option>
            <option value="webp" [selected]="output() === 'webp'">WebP (smallest)</option>
          </select>
        </label>
      </fieldset>

      @if (items().length) {
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="compress()">{{ busy() ? 'Compressing…' : 'Compress ' + items().length + (items().length === 1 ? ' image' : ' images') }}</button>
          <button type="button" class="btn-secondary" [disabled]="busy() || !finished().length" (click)="downloadAll()">Download all (ZIP)</button>
          <button type="button" class="btn-small" [disabled]="busy()" (click)="clear()">Clear</button>
          @if (totals(); as t) {
            <span class="font-semibold" role="status">{{ formatBytes(t.before) }} → {{ formatBytes(t.after) }} ({{ t.saved }}% smaller)</span>
          }
        </div>
        <ul class="mt-4 flex flex-col gap-2" aria-label="Images">
          @for (item of items(); track item.id) {
            <li class="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm leading-5">
              <span class="min-w-0 truncate font-semibold">{{ item.file.name }}</span>
              <span class="text-muted">
                @switch (item.status) {
                  @case ('waiting') { {{ formatBytes(item.file.size) }} }
                  @case ('working') { Compressing… }
                  @case ('done') { {{ formatBytes(item.file.size) }} → {{ formatBytes(item.result!.size) }} ({{ saved(item) }}% smaller) }
                  @case ('kept') { {{ formatBytes(item.file.size) }}, already optimised, original kept }
                  @case ('error') { {{ item.message }} }
                }
              </span>
              @if (item.result) {
                <button type="button" class="btn-small" (click)="downloadOne(item)">Download</button>
              }
            </li>
          }
        </ul>
      }
    </app-tool-page>
  `,
})
export class ImageCompressor {
  protected readonly content = CONTENT;
  protected readonly accept = ACCEPT;
  protected readonly maxImages = LIMITS.MAX_IMAGES;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly presets = QUALITY_PRESETS;
  protected readonly colourOptions = [256, 128, 64, 32, 0];
  protected readonly formatBytes = formatBytes;

  protected readonly items = signal<Item[]>([]);
  protected readonly quality = signal(80);
  protected readonly colours = signal(256);
  protected readonly output = signal<Output>('same');
  protected readonly busy = signal(false);
  protected readonly note = signal('');
  protected readonly finished = computed(() => this.items().filter((i) => i.result));
  protected readonly totals = computed(() => {
    const done = this.finished();
    if (!done.length) return null;
    const before = done.reduce((n, i) => n + i.file.size, 0);
    const after = done.reduce((n, i) => n + i.result!.size, 0);
    return { before, after, saved: savedPercent(before, after) };
  });

  private readonly encoder = inject(ImageEncoder);
  private nextId = 0;
  private stopped = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.stopped = true));
  }

  protected saved(item: Item): number {
    return savedPercent(item.file.size, item.result?.size ?? item.file.size);
  }

  protected add(files: File[]): void {
    const room = LIMITS.MAX_IMAGES - this.items().length;
    const tooBig = files.filter((f) => f.size > LIMITS.MAX_IMAGE_BYTES);
    const usable = files.filter((f) => f.size <= LIMITS.MAX_IMAGE_BYTES);
    const kept = usable.slice(0, Math.max(0, room));
    const notes: string[] = [];
    if (tooBig.length) notes.push(`${tooBig.length} over ${this.maxSize} left out.`);
    if (usable.length > kept.length) notes.push(`${usable.length - kept.length} left out: up to ${LIMITS.MAX_IMAGES} at a time.`);
    this.note.set(notes.join(' '));
    this.items.update((list) => [...list, ...kept.map((file) => ({ id: ++this.nextId, file, status: 'waiting' as const }))]);
  }

  protected clear(): void {
    this.items.set([]);
    this.note.set('');
  }

  protected async compress(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    for (const item of this.items()) {
      if (this.stopped) break;
      this.patch(item.id, { status: 'working', result: undefined });
      try {
        const { blob, name } = await this.compressOne(item.file);
        const sameType = blob.type === item.file.type;
        if (sameType && blob.size >= item.file.size) {
          this.patch(item.id, { status: 'kept', result: item.file, name: item.file.name });
        } else {
          this.patch(item.id, { status: 'done', result: blob, name });
        }
      } catch {
        this.patch(item.id, { status: 'error', message: 'This image could not be read.' });
      }
    }
    this.busy.set(false);
  }

  private async compressOne(file: File): Promise<{ blob: Blob; name: string }> {
    const bitmap = await this.encoder.read(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const isPng = file.type === 'image/png';
    const target = this.output() === 'webp' ? 'image/webp' : isPng ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    if (target === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[target];
    const name = `${baseName(file.name)}-min.${extension}`;
    try {
      if (target === 'image/png' && this.colours() > 0) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const { quantize, applyPalette } = await import('gifenc/dist/gifenc.esm.js');
        const hasAlpha = pixels.data.some((value, i) => i % 4 === 3 && value < 255);
        const format = hasAlpha ? 'rgba4444' : 'rgb565';
        const palette = quantize(pixels.data, this.colours(), { format });
        const index = applyPalette(pixels.data, palette, format);
        return { blob: await encodeIndexedPng(canvas.width, canvas.height, index, palette), name };
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, target, this.quality() / 100));
      if (!blob) throw new Error('encode');
      return { blob, name };
    } finally {
      canvas.width = canvas.height = 0;
    }
  }

  private patch(id: number, change: Partial<Item>): void {
    this.items.update((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  protected downloadOne(item: Item): void {
    if (item.result) downloadBlob(item.result, item.name ?? item.file.name);
  }

  protected async downloadAll(): Promise<void> {
    const files = this.finished().map((item) => ({ name: item.name ?? item.file.name, blob: item.result! }));
    if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
    else downloadBlob(await buildZip(files), 'compressed-images.zip');
  }
}
