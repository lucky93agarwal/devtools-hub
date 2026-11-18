import { Component, DestroyRef, inject, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { buildZip } from '../image-converter/zip';

const CONTENT: ToolContent = {
  aboutHeading: 'About this PDF to image converter',
  about:
    'Turn every page of a PDF into a JPG or PNG image, for slides, social posts, previews or apps that do not open ' +
    'PDFs. Choose the resolution (72 to 300 DPI), the format and which pages you need, then download one page or ' +
    'all of them as a ZIP. The PDF is rendered in your browser with Mozilla\'s pdf.js, so contracts, bank statements ' +
    'and other private documents never leave your device. Password-protected PDFs work if you know the password.',
  steps: [
    'Drop a PDF file.',
    'Pick the format and resolution; enter the password if the PDF asks for one.',
    'Download single pages or all pages as a ZIP.',
  ],
  faq: [
    {
      question: 'Which resolution should I choose?',
      answer: '150 DPI suits screens and slides. Use 300 DPI for printing or to zoom into small text; files get about four times bigger.',
    },
    { question: 'Is my PDF uploaded?', answer: 'No. Pages are drawn in your browser.' },
  ],
};

/** Very long PDFs are cut to this many pages so the browser does not run out of memory. */
const MAX_PAGES = 200;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

interface PageImage {
  number: number;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  extension: 'jpg' | 'png';
}

@Component({
  selector: 'app-pdf-to-image',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="pdf-to-image" [content]="content" [wide]="true" privacy="Pages are drawn in your browser. Your PDF is never uploaded.">
      <fieldset class="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm" [disabled]="busy()">
        <legend class="sr-only">Image settings</legend>
        <label class="flex flex-col gap-1"><span class="font-semibold">Format</span>
          <select class="field" aria-label="Format" (change)="format.set($any($event.target).value)">
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Resolution</span>
          <select class="field" aria-label="Resolution" (change)="dpi.set(+$any($event.target).value)">
            <option value="72">72 DPI (small)</option>
            <option value="150" selected>150 DPI (screen)</option>
            <option value="300">300 DPI (print)</option>
          </select>
        </label>
        @if (needsPassword()) {
          <label class="flex flex-col gap-1"><span class="font-semibold">Password</span>
            <input class="field" type="password" aria-label="PDF password" autocomplete="off" [value]="password()" (input)="password.set($any($event.target).value)" (keydown.enter)="retry()" />
          </label>
          <button type="button" class="btn-primary" (click)="retry()">Open</button>
        }
      </fieldset>
      <app-upload-box title="Drop a PDF here" buttonLabel="Choose PDF" [hint]="'Up to ' + maxSize + ' and ' + maxPages + ' pages.'" accept="application/pdf,.pdf" (filesSelected)="open($event)" />
      @if (status()) { <p class="mt-3 text-sm" role="status">{{ status() }}</p> }
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
      @if (pages().length) {
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="downloadAll()">Download all ({{ pages().length }} {{ format().toUpperCase() }} as ZIP)</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
        </div>
        <ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Pages">
          @for (page of pages(); track page.number) {
            <li class="card flex flex-col items-center gap-2 p-2 text-xs">
              <img [src]="page.url" [alt]="'Page ' + page.number" class="h-40 w-full object-contain" />
              <span>Page {{ page.number }} · {{ page.width }}×{{ page.height }} · {{ formatBytes(page.blob.size) }}</span>
              <button type="button" class="btn-small" (click)="downloadOne(page)">Download</button>
            </li>
          }
        </ul>
      }
    </app-tool-page>
  `,
})
export class PdfToImage {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(MAX_PDF_BYTES);
  protected readonly maxPages = MAX_PAGES;
  protected readonly formatBytes = formatBytes;
  protected readonly format = signal<'jpg' | 'png'>('jpg');
  protected readonly dpi = signal(150);
  protected readonly pages = signal<PageImage[]>([]);
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly needsPassword = signal(false);
  protected readonly password = signal('');
  private file: File | null = null;
  private stopped = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopped = true;
      this.clear();
    });
  }

  protected open(files: File[]): void {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) {
      this.error.set(`This PDF is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    this.file = file;
    this.password.set('');
    void this.render();
  }

  protected retry(): void {
    if (this.file) void this.render();
  }

  private async render(): Promise<void> {
    const file = this.file;
    if (!file || this.busy()) return;
    this.clear();
    this.busy.set(true);
    this.error.set('');
    this.status.set('Opening the PDF…');
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      const task = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        password: this.password() || undefined,
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/',
      });
      const pdf = await task.promise;
      this.needsPassword.set(false);
      const count = Math.min(pdf.numPages, MAX_PAGES);
      const type = this.format() === 'png' ? 'image/png' : 'image/jpeg';
      for (let number = 1; number <= count && !this.stopped; number++) {
        this.status.set(`Drawing page ${number} of ${count}…`);
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: this.dpi() / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d')!;
        // PDF pages are white unless they say otherwise.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await canvasToBlob(canvas, type, 0.9);
        this.pages.update((list) => [...list, { number, url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height, extension: this.format() }]);
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
      await task.destroy();
      this.status.set(pdf.numPages > MAX_PAGES ? `Showing the first ${MAX_PAGES} of ${pdf.numPages} pages.` : '');
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'PasswordException') {
        this.needsPassword.set(true);
        this.status.set('');
        this.error.set(this.password() ? 'That password is not right. Try again.' : 'This PDF is protected. Enter its password above.');
      } else {
        this.status.set('');
        this.error.set('This PDF could not be opened. It may be damaged.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadOne(page: PageImage): void {
    downloadBlob(page.blob, `${baseName(this.file?.name ?? 'document')}-page-${page.number}.${page.extension}`);
  }

  protected async downloadAll(): Promise<void> {
    const base = baseName(this.file?.name ?? 'document');
    const files = this.pages().map((p) => ({ name: `${base}-page-${p.number}.${p.extension}`, blob: p.blob }));
    downloadBlob(await buildZip(files), `${base}-pages.zip`);
  }

  protected clear(): void {
    for (const page of this.pages()) URL.revokeObjectURL(page.url);
    this.pages.set([]);
  }
}
