import { Component, DestroyRef, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { PageSize, PdfPage, buildPdf, placeOnPage } from './pdf-writer';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image to PDF converter',
  about:
    'Combine photos, scans and screenshots into one PDF, one image per page. Put the pages in the order you want, ' +
    'choose A4, Letter or pages that match each image, add a margin and pick the quality. Wide images turn their ' +
    'page to landscape automatically. HEIC photos from iPhones work too. The PDF is made in your browser, so ' +
    'private documents such as ID cards or bills are never uploaded.',
  steps: [
    'Drop your images, or a folder of scans.',
    'Drag them into order with the arrows, then choose the page size, margin and quality.',
    'Download the PDF.',
  ],
  faq: [
    {
      question: 'How big will the PDF be?',
      answer: 'Roughly the size of the images as JPGs. Lower the quality or the image size to make the PDF smaller.',
    },
    { question: 'Are my documents uploaded?', answer: 'No. The PDF is built on your device.' },
  ],
};

interface Item {
  id: number;
  file: File;
  thumb: string;
}

@Component({
  selector: 'app-image-to-pdf',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="image-to-pdf" [content]="content" privacy="The PDF is made in your browser. Your images are never uploaded.">
      <app-upload-box [title]="'Drop up to ' + maxImages + ' images or a folder here'" buttonLabel="Choose images" [hint]="'JPG, PNG, HEIC, WebP and more, up to ' + maxSize + ' each.'" [accept]="accept" [multiple]="true" [folders]="true" [filter]="false" (filesSelected)="add($event)" />
      @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      @if (items().length) {
        <fieldset class="card mt-4 flex flex-wrap items-end gap-4 p-4 text-sm" [disabled]="busy()">
          <legend class="sr-only">PDF settings</legend>
          <label class="flex flex-col gap-1"><span class="font-semibold">Page size</span>
            <select class="field" aria-label="Page size" (change)="size.set($any($event.target).value)">
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
              <option value="fit">Same as image</option>
            </select>
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">Margin</span>
            <select class="field" aria-label="Margin" (change)="margin.set(+$any($event.target).value)">
              <option value="0">None</option>
              <option value="18" selected>Small</option>
              <option value="36">Large</option>
            </select>
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">Quality {{ quality() }}%</span>
            <input type="range" min="50" max="95" step="5" class="w-32 accent-brand" aria-label="Quality" [value]="quality()" (input)="quality.set($any($event.target).valueAsNumber)" />
          </label>
          <button type="button" class="btn-primary" (click)="make()">{{ busy() ? 'Making PDF…' : 'Download PDF (' + items().length + (items().length === 1 ? ' page)' : ' pages)') }}</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
        </fieldset>
        <ol class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Pages">
          @for (item of items(); track item.id; let i = $index; let last = $last) {
            <li class="card flex flex-col items-center gap-1 p-2 text-xs">
              <img [src]="item.thumb" alt="" class="h-28 w-full object-contain" />
              <span class="w-full truncate text-center">{{ i + 1 }}. {{ item.file.name }}</span>
              <span class="flex gap-1">
                <button type="button" class="btn-small" [disabled]="i === 0" [attr.aria-label]="'Move ' + item.file.name + ' up'" (click)="move(i, -1)">←</button>
                <button type="button" class="btn-small" [disabled]="last" [attr.aria-label]="'Move ' + item.file.name + ' down'" (click)="move(i, 1)">→</button>
                <button type="button" class="btn-small" [attr.aria-label]="'Remove ' + item.file.name" (click)="remove(i)">✕</button>
              </span>
            </li>
          }
        </ol>
      }
    </app-tool-page>
  `,
})
export class ImageToPdf {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxImages = LIMITS.MAX_IMAGES;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly items = signal<Item[]>([]);
  protected readonly size = signal<PageSize>('a4');
  protected readonly margin = signal(18);
  protected readonly quality = signal(85);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly encoder = inject(ImageEncoder);
  private nextId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected async add(files: File[]): Promise<void> {
    const room = LIMITS.MAX_IMAGES - this.items().length;
    const picked = files.filter((f) => f.size <= LIMITS.MAX_IMAGE_BYTES).slice(0, Math.max(0, room));
    const added: Item[] = [];
    let failed = 0;
    for (const file of picked) {
      try {
        const bitmap = await this.encoder.read(file);
        const canvas = bitmapToCanvas(bitmap, 240);
        bitmap.close();
        added.push({ id: ++this.nextId, file, thumb: URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.8)) });
        canvas.width = canvas.height = 0;
      } catch {
        failed++;
      }
    }
    const notes = [];
    if (failed) notes.push(`${failed} could not be read.`);
    if (picked.length < files.length) notes.push(`Some files were left out: up to ${LIMITS.MAX_IMAGES} images of ${this.maxSize} each.`);
    this.error.set(notes.join(' '));
    this.items.update((list) => [...list, ...added]);
  }

  protected move(index: number, by: number): void {
    this.items.update((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  protected remove(index: number): void {
    URL.revokeObjectURL(this.items()[index].thumb);
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  protected clear(): void {
    for (const item of this.items()) URL.revokeObjectURL(item.thumb);
    this.items.set([]);
  }

  protected async make(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const pages: PdfPage[] = [];
      for (const item of this.items()) {
        const bitmap = await this.encoder.read(item.file);
        // Very large photos are scaled to about 300 DPI on A4, plenty for printing.
        const canvas = bitmapToCanvas(bitmap, 3600);
        bitmap.close();
        const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', this.quality() / 100)).arrayBuffer());
        pages.push({ jpeg, pixelWidth: canvas.width, pixelHeight: canvas.height, ...placeOnPage(canvas.width, canvas.height, this.size(), this.margin()) });
        canvas.width = canvas.height = 0;
      }
      const pdf = buildPdf(pages, 'Images');
      downloadBlob(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'images.pdf');
    } catch {
      this.error.set('The PDF could not be made. Try fewer or smaller images.');
    } finally {
      this.busy.set(false);
    }
  }
}
