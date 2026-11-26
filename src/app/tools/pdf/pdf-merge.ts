import { Component, signal } from '@angular/core';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { MAX_PDF_BYTES } from './pdf-core';

const CONTENT: ToolContent = {
  aboutHeading: 'About this PDF merger',
  about:
    'Combine several PDFs into one file in the order you choose: reports, invoices, scanned pages or test fixtures for ' +
    'an upload form. Drop the files, move them up or down, remove any you do not need and download the merged PDF. ' +
    'Everything happens in your browser with the open-source pdf-lib library, so your documents never leave your device.',
  steps: ['Drop two or more PDF files.', 'Put them in the order you want.', 'Press Merge and download the PDF.'],
  faq: [
    { question: 'Are links and form fields kept?', answer: 'Page content, text, images and links are kept. Form fields and bookmarks from the original files may not carry over.' },
    { question: 'Can I merge password-protected PDFs?', answer: 'Not yet. Remove the password first, then merge.' },
    { question: 'Is my PDF uploaded?', answer: 'No. The files are combined in your browser.' },
  ],
};

interface Item {
  id: number;
  file: File;
  pages: number | null;
  error: string;
}

@Component({
  selector: 'app-pdf-merge',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="merge-pdf" [content]="content" privacy="Files are merged in your browser. Nothing is uploaded.">
      <app-upload-box title="Drop PDF files here" buttonLabel="Choose PDFs" [multiple]="true" accept="application/pdf,.pdf" [hint]="'Up to ' + maxSize + ' each.'" (filesSelected)="add($event)" />
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
      @if (items().length) {
        <ol class="mt-4 flex flex-col gap-2" aria-label="Files to merge">
          @for (item of items(); track item.id; let i = $index, last = $last) {
            <li class="card flex flex-wrap items-center gap-3 p-3 text-sm">
              <span class="w-6 text-muted">{{ i + 1 }}.</span>
              <span class="min-w-0 flex-1 truncate font-semibold" [title]="item.file.name">{{ item.file.name }}</span>
              <span class="text-muted">
                @if (item.error) { <span class="text-danger">{{ item.error }}</span> }
                @else { {{ item.pages === null ? 'Reading…' : item.pages + (item.pages === 1 ? ' page' : ' pages') }} · {{ formatBytes(item.file.size) }} }
              </span>
              <span class="flex gap-1">
                <button type="button" class="btn-small !px-2.5" [attr.aria-label]="'Move ' + item.file.name + ' up'" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
                <button type="button" class="btn-small !px-2.5" [attr.aria-label]="'Move ' + item.file.name + ' down'" [disabled]="last" (click)="move(i, 1)">↓</button>
                <button type="button" class="btn-small !px-2.5" [attr.aria-label]="'Remove ' + item.file.name" (click)="remove(item.id)">✕</button>
              </span>
            </li>
          }
        </ol>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" class="btn-primary" [disabled]="busy() || goodItems() < 2" (click)="merge()">{{ busy() ? 'Merging…' : 'Merge ' + goodItems() + ' PDFs' }}</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
          @if (result(); as r) {
            <button type="button" class="btn-secondary" (click)="download()">Download merged PDF ({{ r.pages }} pages, {{ formatBytes(r.blob.size) }})</button>
          }
        </div>
      }
    </app-tool-page>
  `,
})
export class PdfMerge {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(MAX_PDF_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly items = signal<Item[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<{ blob: Blob; pages: number } | null>(null);
  private nextId = 1;

  protected goodItems(): number {
    return this.items().filter((i) => !i.error && i.pages !== null).length;
  }

  protected async add(files: File[]): Promise<void> {
    this.error.set('');
    this.result.set(null);
    const added: Item[] = [];
    for (const file of files) {
      if (file.size > MAX_PDF_BYTES) {
        this.error.set(`${file.name} is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
        continue;
      }
      added.push({ id: this.nextId++, file, pages: null, error: '' });
    }
    this.items.update((list) => [...list, ...added]);
    const { PDFDocument } = await import('pdf-lib');
    for (const item of added) {
      try {
        const doc = await PDFDocument.load(await item.file.arrayBuffer(), { ignoreEncryption: false });
        this.patch(item.id, { pages: doc.getPageCount() });
      } catch (e) {
        this.patch(item.id, { error: /encrypt/i.test(String(e)) ? 'Password-protected' : 'Could not be read' });
      }
    }
  }

  private patch(id: number, change: Partial<Item>): void {
    this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  protected move(index: number, by: number): void {
    this.result.set(null);
    this.items.update((list) => {
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(index + by, 0, item);
      return copy;
    });
  }

  protected remove(id: number): void {
    this.result.set(null);
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  protected async merge(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const out = await PDFDocument.create();
      for (const item of this.items().filter((i) => !i.error)) {
        const source = await PDFDocument.load(await item.file.arrayBuffer());
        const pages = await out.copyPages(source, source.getPageIndices());
        for (const page of pages) out.addPage(page);
      }
      const bytes = await out.save({ useObjectStreams: true });
      this.result.set({ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() });
      this.download();
    } catch {
      this.error.set('The PDFs could not be merged. One of them may be damaged.');
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) downloadBlob(r.blob, 'merged.pdf');
  }

  protected clear(): void {
    this.items.set([]);
    this.result.set(null);
    this.error.set('');
  }
}
