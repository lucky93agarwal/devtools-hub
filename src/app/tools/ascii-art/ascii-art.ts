import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { CHARSETS, Charset, asHtml, asMarkdown, rowsFor, toAscii } from './ascii';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image to ASCII art converter',
  about:
    'Turn a logo, icon or photo into ASCII art made of characters such as #, @ and *. Choose the width in ' +
    'characters, a character set from simple to detailed or block shading, and whether the art is for a light or a ' +
    'dark background. Copy it as plain text for a terminal banner or a code comment, as a Markdown code block for a ' +
    'README, or as an HTML <pre> block.',
  steps: [
    'Drop an image. Logos and high-contrast pictures work best.',
    'Set the width and character set; use Invert for light text on a dark terminal.',
    'Copy the art as text, Markdown or HTML, or download it as a .txt file.',
  ],
  faq: [
    {
      question: 'Why does my art look stretched in some places?',
      answer:
        'Characters are about twice as tall as they are wide, which the tool allows for. If your editor or terminal ' +
        'uses a different font or line spacing, the shape changes a little. Use a monospaced font.',
    },
    {
      question: 'How do I show ASCII art in a GitHub README?',
      answer: 'Use Copy Markdown. It wraps the art in a code block so GitHub keeps every space.',
    },
    { question: 'Is my image uploaded?', answer: 'No. The image is read in your browser.' },
  ],
};

@Component({
  selector: 'app-ascii-art',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="ascii-art" [content]="content" [wide]="true" privacy="The image is read in your browser and never uploaded.">
      @if (!pixels()) {
        <app-upload-box title="Drop an image here" buttonLabel="Choose image" [hint]="'Logos and high-contrast images work best. Up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="flex flex-wrap items-end gap-4 text-sm">
          <label class="flex flex-col gap-1"><span class="font-semibold">Width: {{ columns() }} characters</span>
            <input type="range" min="20" max="200" step="2" class="w-48 accent-brand" aria-label="Width in characters" [value]="columns()" (input)="columns.set($any($event.target).valueAsNumber)" />
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">Characters</span>
            <select class="field" aria-label="Character set" (change)="charset.set($any($event.target).value)">
              @for (c of charsets; track c) { <option [value]="c" [selected]="c === charset()">{{ c }}</option> }
            </select>
          </label>
          <label class="flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="invert()" (change)="invert.set($any($event.target).checked)" /> Invert (for dark backgrounds)</label>
          <button type="button" class="btn-small" (click)="reset()">Another image</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <app-copy-button [text]="art()" label="Copy text" />
          <app-copy-button [text]="markdown()" label="Copy Markdown" />
          <app-copy-button [text]="html()" label="Copy HTML" />
          <button type="button" class="btn-small" (click)="download()">Download .txt</button>
        </div>
        <pre class="mt-3 overflow-auto rounded-xl border border-line p-3 font-mono text-[8px] leading-[1]" [class]="invert() ? 'bg-black text-white' : 'bg-white text-black'" aria-label="ASCII art">{{ art() }}</pre>
      }
    </app-tool-page>
  `,
})
export class AsciiArt {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly charsets = Object.keys(CHARSETS) as Charset[];
  protected readonly columns = signal(100);
  protected readonly charset = signal<Charset>('standard');
  protected readonly invert = signal(false);
  protected readonly error = signal('');
  /** The image, kept small; each width is drawn from it. */
  protected readonly pixels = signal<HTMLCanvasElement | null>(null);
  protected readonly art = computed(() => {
    const source = this.pixels();
    if (!source) return '';
    const columns = this.columns();
    const rows = rowsFor(source.width, source.height, columns);
    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, 0, 0, columns, rows);
    return toAscii(context.getImageData(0, 0, columns, rows).data, columns, rows, CHARSETS[this.charset()], this.invert());
  });
  protected readonly markdown = computed(() => asMarkdown(this.art()));
  protected readonly html = computed(() => asHtml(this.art()));
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
      this.pixels.set(bitmapToCanvas(bitmap, 800));
      bitmap.close();
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  protected download(): void {
    downloadText(this.art() + '\n', 'ascii-art.txt', 'text/plain');
  }

  protected reset(): void {
    const canvas = this.pixels();
    if (canvas) canvas.width = canvas.height = 0;
    this.pixels.set(null);
  }
}
