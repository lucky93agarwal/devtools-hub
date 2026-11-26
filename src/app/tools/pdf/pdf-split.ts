import { Component, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { buildZip } from '../image-converter/zip';
import { MAX_PDF_BYTES, chunkPages, parsePageRanges } from './pdf-core';

const CONTENT: ToolContent = {
  aboutHeading: 'About this PDF splitter',
  about:
    'Pull the pages you need out of a large PDF, or cut it into smaller files. Extract a list of pages such as ' +
    '"1-3, 7, 10-" into one new PDF, split every N pages, or save each page as its own file in a ZIP. Useful for ' +
    'sending only part of a document, or for making small test files from a big one. The PDF is processed in your browser.',
  steps: ['Drop a PDF.', 'Choose extract pages, split every N pages, or one file per page.', 'Download the PDF or ZIP.'],
  faq: [
    { question: 'How do I write page ranges?', answer: 'Use commas and dashes: "1-3, 5" gives pages 1, 2, 3 and 5. "8-" means page 8 to the end. "3-1" gives pages in reverse.' },
    { question: 'Is my PDF uploaded?', answer: 'No. Pages are copied in your browser.' },
  ],
};

type Mode = 'extract' | 'every' | 'each';

@Component({
  selector: 'app-pdf-split',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="split-pdf" [content]="content" privacy="Pages are copied in your browser. Nothing is uploaded.">
      <app-upload-box title="Drop a PDF here" buttonLabel="Choose PDF" accept="application/pdf,.pdf" [hint]="'Up to ' + maxSize + '.'" (filesSelected)="open($event)" />
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
      @if (pageCount()) {
        <p class="mt-3 text-sm" role="status"><strong>{{ fileName() }}</strong> · {{ pageCount() }} pages</p>
        <fieldset class="card mt-3 flex flex-col gap-3 p-4 text-sm" [disabled]="busy()">
          <legend class="sr-only">How to split</legend>
          <label class="flex items-center gap-2"><input type="radio" name="mode" [checked]="mode() === 'extract'" (change)="mode.set('extract')" /> Extract pages into one PDF</label>
          @if (mode() === 'extract') {
            <input class="field ml-6 max-w-sm" aria-label="Pages to extract" placeholder="for example 1-3, 5, 8-" [value]="ranges()" (input)="ranges.set($any($event.target).value)" />
          }
          <label class="flex items-center gap-2"><input type="radio" name="mode" [checked]="mode() === 'every'" (change)="mode.set('every')" /> Split every
            <input class="field !w-20 !py-1" type="number" min="1" aria-label="Pages per file" [value]="every()" (input)="every.set(+$any($event.target).value || 1)" /> pages (ZIP)</label>
          <label class="flex items-center gap-2"><input type="radio" name="mode" [checked]="mode() === 'each'" (change)="mode.set('each')" /> One PDF per page (ZIP)</label>
        </fieldset>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="split()">{{ busy() ? 'Working…' : 'Split and download' }}</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
        </div>
        @if (done()) { <p class="mt-3 text-sm text-success" role="status">{{ done() }}</p> }
      }
    </app-tool-page>
  `,
})
export class PdfSplit {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(MAX_PDF_BYTES);
  protected readonly pageCount = signal(0);
  protected readonly fileName = signal('');
  protected readonly mode = signal<Mode>('extract');
  protected readonly ranges = signal('');
  protected readonly every = signal(2);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal('');
  private bytes: ArrayBuffer | null = null;

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    this.clear();
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) return this.error.set(`This PDF is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
    try {
      const { PDFDocument } = await import('pdf-lib');
      this.bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(this.bytes);
      this.fileName.set(file.name);
      this.pageCount.set(doc.getPageCount());
      this.ranges.set(doc.getPageCount() > 1 ? `1-${Math.min(3, doc.getPageCount())}` : '1');
    } catch (e) {
      this.bytes = null;
      this.error.set(/encrypt/i.test(String(e)) ? 'This PDF is password-protected. Remove the password first.' : 'This PDF could not be opened. It may be damaged.');
    }
  }

  protected async split(): Promise<void> {
    if (!this.bytes) return;
    this.error.set('');
    this.done.set('');
    let groups: number[][];
    try {
      groups = this.mode() === 'extract' ? [parsePageRanges(this.ranges(), this.pageCount())] : chunkPages(this.pageCount(), this.mode() === 'each' ? 1 : Math.max(1, this.every()));
    } catch (e) {
      this.error.set((e as Error).message);
      return;
    }
    this.busy.set(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const source = await PDFDocument.load(this.bytes);
      const base = baseName(this.fileName());
      const files: { name: string; blob: Blob }[] = [];
      for (const group of groups) {
        const out = await PDFDocument.create();
        for (const page of await out.copyPages(source, group.map((n) => n - 1))) out.addPage(page);
        const bytes = await out.save({ useObjectStreams: true });
        const label = group.length === 1 ? `page-${group[0]}` : `pages-${group[0]}-${group[group.length - 1]}`;
        files.push({ name: `${base}-${label}.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) });
      }
      if (files.length === 1) {
        downloadBlob(files[0].blob, files[0].name);
        this.done.set(`Saved ${groups[0].length} page${groups[0].length === 1 ? '' : 's'} (${formatBytes(files[0].blob.size)}).`);
      } else {
        const zip = await buildZip(files);
        downloadBlob(zip, `${base}-split.zip`);
        this.done.set(`Saved ${files.length} PDFs in a ZIP (${formatBytes(zip.size)}).`);
      }
    } catch {
      this.error.set('The pages could not be copied. The PDF may be damaged.');
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    this.bytes = null;
    this.pageCount.set(0);
    this.fileName.set('');
    this.error.set('');
    this.done.set('');
  }
}
