import { Component, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { MAX_PDF_BYTES, openWithPdfjs } from './pdf-core';

const CONTENT: ToolContent = {
  aboutHeading: 'About this PDF compressor',
  about:
    'Make a PDF smaller for email, upload forms or API limits. "Light" rewrites the file more compactly and keeps text ' +
    'selectable. "Strong" redraws each page as a JPEG at the resolution and quality you pick, which shrinks scanned and ' +
    'image-heavy PDFs a lot (text then becomes part of the image). You see the size before and after. Everything runs in your browser.',
  steps: ['Drop a PDF.', 'Choose Light or Strong and, for Strong, the resolution and quality.', 'Compress and download.'],
  faq: [
    { question: 'Which level should I use?', answer: 'Try Light first. If the file is mostly scans or photos, Strong at 100 DPI and 60% quality usually cuts it by 70-90%.' },
    { question: 'Why did my file not get smaller?', answer: 'Text-only PDFs are already small. Light cannot shrink much more, and Strong may even make them bigger.' },
    { question: 'Is my PDF uploaded?', answer: 'No. It is compressed in your browser.' },
  ],
};

@Component({
  selector: 'app-pdf-compress',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="compress-pdf" [content]="content" privacy="Compressed in your browser. Your PDF is never uploaded.">
      <fieldset class="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm" [disabled]="busy()">
        <legend class="sr-only">Compression settings</legend>
        <label class="flex flex-col gap-1"><span class="font-semibold">Level</span>
          <select class="field" aria-label="Compression level" (change)="level.set($any($event.target).value)">
            <option value="light">Light (keeps text)</option>
            <option value="strong">Strong (pages as images)</option>
          </select>
        </label>
        @if (level() === 'strong') {
          <label class="flex flex-col gap-1"><span class="font-semibold">Resolution</span>
            <select class="field" aria-label="Resolution" (change)="dpi.set(+$any($event.target).value)">
              <option value="72">72 DPI (smallest)</option>
              <option value="100" selected>100 DPI</option>
              <option value="150">150 DPI (sharper)</option>
            </select>
          </label>
          <label class="flex flex-col gap-1"><span class="font-semibold">Quality {{ quality() }}%</span>
            <input type="range" min="30" max="90" step="5" aria-label="JPEG quality" [value]="quality()" (input)="quality.set(+$any($event.target).value)" />
          </label>
        }
      </fieldset>
      <app-upload-box title="Drop a PDF here" buttonLabel="Choose PDF" accept="application/pdf,.pdf" [hint]="'Up to ' + maxSize + '.'" (filesSelected)="open($event)" />
      @if (status()) { <p class="mt-3 text-sm" role="status">{{ status() }}</p> }
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
      @if (file()) {
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="compress()">{{ busy() ? 'Compressing…' : 'Compress' }}</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
        </div>
      }
      @if (result(); as r) {
        <div class="card mt-4 flex flex-wrap items-center gap-4 p-4 text-sm" aria-label="Result">
          <span>Before: <strong>{{ formatBytes(file()!.size) }}</strong></span>
          <span>After: <strong>{{ formatBytes(r.size) }}</strong></span>
          <span [class]="r.size < file()!.size ? 'text-success' : 'text-warning'">{{ change(r.size) }}</span>
          <button type="button" class="btn-secondary" (click)="download()">Download</button>
        </div>
      }
    </app-tool-page>
  `,
})
export class PdfCompress {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(MAX_PDF_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly level = signal<'light' | 'strong'>('light');
  protected readonly dpi = signal(100);
  protected readonly quality = signal(60);
  protected readonly file = signal<File | null>(null);
  protected readonly result = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');

  protected open(files: File[]): void {
    const file = files[0];
    this.clear();
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) return this.error.set(`This PDF is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
    this.file.set(file);
    void this.compress();
  }

  protected change(after: number): string {
    const before = this.file()?.size ?? after;
    const percent = Math.round((1 - after / before) * 100);
    return percent > 0 ? `${percent}% smaller` : percent < 0 ? `${-percent}% bigger: keep the original` : 'Same size';
  }

  protected async compress(): Promise<void> {
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let output: Uint8Array;
      if (this.level() === 'light') {
        this.status.set('Rewriting the PDF…');
        const doc = await PDFDocument.load(bytes);
        output = await doc.save({ useObjectStreams: true });
      } else {
        const { task, pdf } = await openWithPdfjs(bytes);
        const out = await PDFDocument.create();
        for (let n = 1; n <= pdf.numPages; n++) {
          this.status.set(`Drawing page ${n} of ${pdf.numPages}…`);
          const page = await pdf.getPage(n);
          const size = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: this.dpi() / 72 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const jpeg = await canvasToBlob(canvas, 'image/jpeg', this.quality() / 100);
          const image = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
          out.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
        await task.destroy();
        output = await out.save({ useObjectStreams: true });
      }
      this.result.set(new Blob([output as BlobPart], { type: 'application/pdf' }));
      this.status.set('');
    } catch (e) {
      this.status.set('');
      const name = (e as { name?: string })?.name;
      this.error.set(name === 'PasswordException' || /encrypt/i.test(String(e)) ? 'This PDF is password-protected. Remove the password first.' : 'This PDF could not be compressed. It may be damaged.');
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.result();
    if (blob) downloadBlob(blob, `${baseName(this.file()?.name ?? 'document')}-compressed.pdf`);
  }

  protected clear(): void {
    this.file.set(null);
    this.result.set(null);
    this.error.set('');
    this.status.set('');
  }
}
