import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { writeIco } from '../image-converter/image-formats';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { buildZip } from '../image-converter/zip';
import { FAVICON_PNGS, ICO_SIZES, fit, headTags, webManifest } from './favicon-plan';

const CONTENT: ToolContent = {
  aboutHeading: 'About this favicon generator',
  about:
    'Make every favicon a modern website needs from one logo: favicon.ico for old browsers and tools, 16 and 32 ' +
    'pixel PNGs for browser tabs, the 180 pixel apple-touch-icon for iPhone home screens, the 192 and 512 pixel ' +
    'Android icons and a site.webmanifest. You also get the exact HTML tags to paste into your page head. Add ' +
    'padding, round the corners or put your logo on a colour, and see it in a browser tab before you download.',
  steps: [
    'Drop a square logo, ideally an SVG or a PNG of at least 512×512 pixels.',
    'Choose a background, padding and corner rounding, and check the tab preview.',
    'Download the ZIP, put the files in your site root and paste the HTML tags into <head>.',
  ],
  faq: [
    {
      question: 'Do I still need favicon.ico?',
      answer:
        'Modern browsers use the PNG links, but many tools, RSS readers and old browsers still ask for /favicon.ico. ' +
        'Keeping both costs nothing and avoids 404 errors in your logs.',
    },
    {
      question: 'Why does the apple-touch-icon have a background?',
      answer:
        'iOS fills transparent parts of home screen icons with black, so the 180 pixel icon is always drawn on your ' +
        'background colour. Tab icons stay transparent.',
    },
    {
      question: 'Is my logo uploaded?',
      answer: 'No. Every icon is drawn in your browser with a canvas, and the ZIP is made on your device.',
    },
  ],
};

@Component({
  selector: 'app-favicon-generator',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="favicon-generator" [content]="content" privacy="Your logo is turned into icons in your browser and never uploaded.">
      @if (error()) {
        <p class="mb-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5">{{ error() }}</p>
      }
      @if (!bitmap()) {
        <app-upload-box
          title="Drop your logo here"
          buttonLabel="Choose image"
          [hint]="'SVG or a square PNG of 512×512 px or more works best. Up to ' + maxSize + '.'"
          [accept]="accept"
          [filter]="false"
          (filesSelected)="choose($event)"
        />
      } @else {
        <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="favicon-preview">
            <h2 id="favicon-preview" class="text-xl leading-7">Preview</h2>
            <div class="mt-3 overflow-hidden rounded-xl border border-line">
              <div class="flex items-end gap-1 bg-surface px-3 pt-2">
                <div class="flex max-w-60 items-center gap-2 rounded-t-lg bg-page px-3 py-2 text-sm">
                  @if (previews()['favicon-32x32.png']; as url) { <img [src]="url" alt="" class="size-4" /> }
                  <span class="truncate">{{ siteName() }}</span>
                </div>
                <div class="px-3 py-2 text-sm text-muted">New tab</div>
              </div>
              <div class="border-t border-line bg-page px-4 py-2 text-sm text-muted">https://example.com</div>
            </div>
            <ul class="mt-4 flex flex-wrap items-end gap-5 text-center text-xs leading-4">
              @for (file of files; track file.name) {
                <li class="flex flex-col items-center gap-2">
                  @if (previews()[file.name]; as url) {
                    <img [src]="url" alt="" [style.width.px]="previewSize(file.size)" [style.height.px]="previewSize(file.size)" class="[image-rendering:pixelated]" />
                  }
                  {{ file.name }}<br />{{ file.size }}×{{ file.size }}
                </li>
              }
            </ul>
            <h3 class="mt-6 font-semibold">HTML for your &lt;head&gt;</h3>
            <pre class="mt-2 overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-5">{{ html() }}</pre>
            <div class="mt-2"><app-copy-button [text]="html()" label="Copy HTML" /></div>
          </section>

          <fieldset class="card flex flex-col gap-4 p-4 text-sm leading-5">
            <legend class="sr-only">Favicon settings</legend>
            <label class="flex flex-col gap-1">
              <span class="font-semibold">Site name</span>
              <input class="field" [value]="siteName()" (input)="siteName.set($any($event.target).value)" />
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" class="size-4 accent-brand" [checked]="transparent()" (change)="transparent.set($any($event.target).checked)" />
              Transparent tab icons
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="font-semibold">Background colour</span>
              <input type="color" class="h-9 w-16 cursor-pointer rounded-lg border border-line" aria-label="Background colour" [value]="background()" (input)="background.set($any($event.target).value)" />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="font-semibold">Theme colour</span>
              <input type="color" class="h-9 w-16 cursor-pointer rounded-lg border border-line" aria-label="Theme colour" [value]="theme()" (input)="theme.set($any($event.target).value)" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="flex justify-between"><span class="font-semibold">Padding</span>{{ padding() }}%</span>
              <input type="range" min="0" max="30" class="accent-brand" aria-label="Padding" [value]="padding()" (input)="padding.set($any($event.target).valueAsNumber)" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="flex justify-between"><span class="font-semibold">Corner rounding</span>{{ radius() }}%</span>
              <input type="range" min="0" max="50" class="accent-brand" aria-label="Corner rounding" [value]="radius()" (input)="radius.set($any($event.target).valueAsNumber)" />
            </label>
            <button type="button" class="btn-primary" [disabled]="zipping()" (click)="download()">
              {{ zipping() ? 'Making files…' : 'Download ZIP (' + (files.length + 3) + ' files)' }}
            </button>
            <button type="button" class="btn-secondary" (click)="reset()">Choose another logo</button>
          </fieldset>
        </div>
      }
    </app-tool-page>
  `,
})
export class FaviconGenerator {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly files = FAVICON_PNGS;

  protected readonly bitmap = signal<ImageBitmap | null>(null);
  protected readonly error = signal('');
  protected readonly siteName = signal('My Website');
  protected readonly transparent = signal(true);
  protected readonly background = signal('#ffffff');
  protected readonly theme = signal('#4f46e5');
  protected readonly padding = signal(0);
  protected readonly radius = signal(0);
  protected readonly zipping = signal(false);
  protected readonly previews = signal<Record<string, string>>({});
  protected readonly html = computed(() => headTags(this.theme()));

  private readonly encoder = inject(ImageEncoder);

  constructor() {
    effect(() => {
      const bitmap = this.bitmap();
      // Read every setting so the previews redraw when one changes.
      const settings = [this.transparent(), this.background(), this.padding(), this.radius()];
      if (bitmap && settings) void this.updatePreviews(bitmap);
    });
    inject(DestroyRef).onDestroy(() => {
      this.revoke();
      this.bitmap()?.close();
    });
  }

  protected previewSize(size: number): number {
    return Math.min(96, Math.max(32, size));
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
      this.bitmap()?.close();
      this.bitmap.set(bitmap);
      this.error.set('');
      this.siteName.set(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'My Website');
    } catch {
      this.error.set('This image could not be read. Choose a PNG, JPG, WebP or SVG file.');
    }
  }

  protected reset(): void {
    this.revoke();
    this.bitmap()?.close();
    this.bitmap.set(null);
  }

  private draw(bitmap: ImageBitmap, size: number, opaque: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    const radius = (this.radius() / 100) * size;
    if (radius > 0) {
      context.beginPath();
      context.roundRect(0, 0, size, size, radius);
      context.clip();
    }
    if (opaque || !this.transparent()) {
      context.fillStyle = this.background();
      context.fillRect(0, 0, size, size);
    }
    const box = fit(bitmap.width, bitmap.height, size, this.padding() / 100);
    context.drawImage(bitmap, box.x, box.y, box.width, box.height);
    return canvas;
  }

  private async png(bitmap: ImageBitmap, size: number, opaque: boolean): Promise<Blob> {
    const canvas = this.draw(bitmap, size, opaque);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('The icon could not be drawn.');
    return blob;
  }

  private async updatePreviews(bitmap: ImageBitmap): Promise<void> {
    const next: Record<string, string> = {};
    for (const file of FAVICON_PNGS) next[file.name] = URL.createObjectURL(await this.png(bitmap, file.size, file.opaque));
    this.revoke();
    this.previews.set(next);
  }

  private revoke(): void {
    for (const url of Object.values(this.previews())) URL.revokeObjectURL(url);
    this.previews.set({});
  }

  protected async download(): Promise<void> {
    const bitmap = this.bitmap();
    if (!bitmap || this.zipping()) return;
    this.zipping.set(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      for (const file of FAVICON_PNGS) files.push({ name: file.name, blob: await this.png(bitmap, file.size, file.opaque) });
      const icons = [];
      for (const size of ICO_SIZES) icons.push({ size, png: await (await this.png(bitmap, size, false)).arrayBuffer() });
      files.push({ name: 'favicon.ico', blob: writeIco(icons) });
      files.push({ name: 'site.webmanifest', blob: new Blob([webManifest(this.siteName(), this.theme(), this.background())]) });
      files.push({ name: 'favicon-tags.html', blob: new Blob([this.html() + '\n']) });
      downloadBlob(await buildZip(files), 'favicons.zip');
    } catch {
      this.error.set('The favicons could not be made. Try another image.');
    } finally {
      this.zipping.set(false);
    }
  }
}
