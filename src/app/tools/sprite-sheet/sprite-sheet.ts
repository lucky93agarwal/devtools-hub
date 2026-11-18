import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadBlob } from '../../shared/file-utils';
import { canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { buildZip, uniqueNames } from '../image-converter/zip';
import { Layout, layoutSprites, spriteCss, spriteJson } from './sprite-layout';

const CONTENT: ToolContent = {
  aboutHeading: 'About this sprite sheet generator',
  about:
    'Combine many small images, such as icons, flags or game animation frames, into one sprite sheet image, so a ' +
    'page or game loads one file instead of dozens. Choose a grid, a single row or column, or tight packing, set the ' +
    'padding, and get the sheet as a PNG with ready-made CSS classes for each image and a JSON atlas in the format ' +
    'Phaser, PixiJS and TexturePacker use.',
  steps: [
    'Drop your icons or frames, or a whole folder.',
    'Pick the layout, padding and CSS class prefix; check the preview.',
    'Download a ZIP with the sheet, the CSS and the JSON, or copy the CSS.',
  ],
  faq: [
    {
      question: 'Are sprite sheets still useful with HTTP/2?',
      answer:
        'For websites they matter less than before, but they still help with many tiny icons and are standard for ' +
        'games, where one texture is much faster to draw than many.',
    },
    {
      question: 'What does the Retina option do?',
      answer: 'Use it when your images are drawn at twice their display size. The CSS then shows the sheet at half size, so icons stay sharp on high-density screens.',
    },
    { question: 'Are my images uploaded?', answer: 'No. The sheet is made in your browser.' },
  ],
};

interface Sprite {
  name: string;
  bitmap: ImageBitmap;
}

const MAX_SPRITES = 300;

@Component({
  selector: 'app-sprite-sheet',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="sprite-sheet-generator" [content]="content" [wide]="true" privacy="The sprite sheet is made in your browser. Your images are never uploaded.">
      <app-upload-box [title]="'Drop up to ' + maxSprites + ' images or a folder here'" buttonLabel="Choose images" hint="PNG with transparency works best. You can add more later." [accept]="accept" [multiple]="true" [folders]="true" [filter]="false" (filesSelected)="add($event)" />
      @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      @if (sprites().length) {
        <div class="mt-4 flex flex-wrap items-end gap-4 text-sm">
          <label class="flex flex-col gap-1"><span class="font-semibold">Layout</span>
            <select class="field" aria-label="Layout" (change)="layout.set($any($event.target).value)">
              <option value="packed">Packed (smallest)</option>
              <option value="grid">Grid</option>
              <option value="horizontal">One row</option>
              <option value="vertical">One column</option>
            </select>
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">Padding: {{ padding() }}px</span>
            <input type="range" min="0" max="16" class="w-32 accent-brand" aria-label="Padding" [value]="padding()" (input)="padding.set($any($event.target).valueAsNumber)" />
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">CSS prefix</span>
            <input class="field w-28" aria-label="CSS prefix" [value]="prefix()" (input)="prefix.set($any($event.target).value || 'icon')" />
          </label>
          <label class="flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="retina()" (change)="retina.set($any($event.target).checked)" /> Retina (2x)</label>
          <span class="text-muted">{{ sprites().length }} images · sheet {{ sheet().width }}×{{ sheet().height }} px</span>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
        </div>
        <div class="mt-3 overflow-auto rounded-xl border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2">
          <canvas #canvas class="block max-w-full" role="img" aria-label="Sprite sheet preview"></canvas>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" (click)="download()">Download ZIP (PNG, CSS, JSON)</button>
          <app-copy-button [text]="css()" label="Copy CSS" />
          <app-copy-button [text]="json()" label="Copy JSON" />
        </div>
        <pre class="mt-3 max-h-64 overflow-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-5" aria-label="CSS">{{ css() }}</pre>
      }
    </app-tool-page>
  `,
})
export class SpriteSheet {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSprites = MAX_SPRITES;
  protected readonly sprites = signal<Sprite[]>([]);
  protected readonly layout = signal<Layout>('packed');
  protected readonly padding = signal(2);
  protected readonly prefix = signal('icon');
  protected readonly retina = signal(false);
  protected readonly error = signal('');
  protected readonly sheet = computed(() =>
    layoutSprites(
      this.sprites().map((s) => ({ name: s.name, width: s.bitmap.width, height: s.bitmap.height })),
      this.layout(),
      this.padding(),
    ),
  );
  protected readonly css = computed(() => spriteCss(this.sheet(), this.prefix().replace(/[^\w-]/g, '') || 'icon', 'sprites.png', this.retina()));
  protected readonly json = computed(() => spriteJson(this.sheet(), 'sprites.png'));
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly encoder = inject(ImageEncoder);

  constructor() {
    afterRenderEffect(() => {
      const canvas = this.canvas()?.nativeElement;
      const sheet = this.sheet();
      if (canvas) this.draw(canvas, sheet);
    });
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  private draw(canvas: HTMLCanvasElement, sheet: ReturnType<typeof layoutSprites>): void {
    canvas.width = Math.max(1, sheet.width);
    canvas.height = Math.max(1, sheet.height);
    const context = canvas.getContext('2d')!;
    const byName = new Map(this.sprites().map((s) => [s.name, s.bitmap]));
    for (const placed of sheet.sprites) {
      const bitmap = byName.get(placed.name);
      if (bitmap) context.drawImage(bitmap, placed.x, placed.y);
    }
  }

  protected async add(files: File[]): Promise<void> {
    const room = MAX_SPRITES - this.sprites().length;
    const picked = files.slice(0, Math.max(0, room));
    const names = uniqueNames([...this.sprites().map((s) => s.name), ...picked.map((f) => f.name)]).slice(this.sprites().length);
    const added: Sprite[] = [];
    let failed = 0;
    for (const [i, file] of picked.entries()) {
      try {
        added.push({ name: names[i], bitmap: await this.encoder.read(file) });
      } catch {
        failed++;
      }
    }
    const notes = [];
    if (failed) notes.push(`${failed} could not be read.`);
    if (files.length > picked.length) notes.push(`Up to ${MAX_SPRITES} images; ${files.length - picked.length} left out.`);
    this.error.set(notes.join(' '));
    this.sprites.update((list) => [...list, ...added]);
  }

  protected clear(): void {
    for (const s of this.sprites()) s.bitmap.close();
    this.sprites.set([]);
  }

  protected async download(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    const files = [
      { name: 'sprites.png', blob: await canvasToBlob(canvas) },
      { name: 'sprites.css', blob: new Blob([this.css()], { type: 'text/css' }) },
      { name: 'sprites.json', blob: new Blob([this.json()], { type: 'application/json' }) },
    ];
    downloadBlob(await buildZip(files), 'sprite-sheet.zip');
  }
}
