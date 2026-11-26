import { Component, computed, signal } from '@angular/core';
import { baseName, downloadText, formatBytes } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { MAX_PDF_BYTES, openWithPdfjs, pageTable, pageText, rowsToObjects, toCsv, type TextPiece } from './pdf-core';

const CONTENT: ToolContent = {
  aboutHeading: 'About this PDF text and table extractor',
  about:
    'Get the text out of a PDF, or its tables as CSV or JSON, to check what a report or invoice generator really ' +
    'produced, compare it with your database, or feed it to a test. Text is read line by line in reading order; table ' +
    'columns are found from the gaps between words, and you can tune the gap. Works with text-based PDFs (not scans), ' +
    'including password-protected ones, entirely in your browser.',
  steps: ['Drop a PDF.', 'Choose Text, CSV or JSON, and one page or all pages.', 'Copy or download the result.'],
  faq: [
    { question: 'Why is the text empty?', answer: 'The PDF is probably a scan (a picture of text). It has no text layer to read; it needs OCR.' },
    { question: 'Columns are merged or split wrongly', answer: 'Change "Column gap": a smaller gap splits more columns, a larger one joins them.' },
    { question: 'Is my PDF uploaded?', answer: 'No. It is read in your browser.' },
  ],
};

type View = 'text' | 'csv' | 'json';

@Component({
  selector: 'app-pdf-extract',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="pdf-text-extractor" [content]="content" [wide]="true" privacy="Read in your browser. Your PDF is never uploaded.">
      <app-upload-box title="Drop a PDF here" buttonLabel="Choose PDF" accept="application/pdf,.pdf" [hint]="'Up to ' + maxSize + '.'" (filesSelected)="open($event)" />
      @if (needsPassword()) {
        <div class="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label class="flex flex-col gap-1"><span class="font-semibold">Password</span>
            <input class="field" type="password" aria-label="PDF password" autocomplete="off" [value]="password()" (input)="password.set($any($event.target).value)" (keydown.enter)="read()" />
          </label>
          <button type="button" class="btn-primary" (click)="read()">Open</button>
        </div>
      }
      @if (status()) { <p class="mt-3 text-sm" role="status">{{ status() }}</p> }
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
      @if (pages().length) {
        <div class="card mt-4 flex flex-wrap items-end gap-4 p-4 text-sm">
          <div class="flex gap-1" role="tablist" aria-label="Output">
            @for (v of views; track v.id) {
              <button type="button" role="tab" class="btn-small" [attr.aria-selected]="view() === v.id" [class.!bg-brand]="view() === v.id" [class.!text-on-brand]="view() === v.id" (click)="view.set(v.id)">{{ v.label }}</button>
            }
          </div>
          <label class="flex flex-col gap-1"><span class="font-semibold">Page</span>
            <select class="field" aria-label="Page" (change)="pageIndex.set(+$any($event.target).value)">
              <option value="-1">All pages</option>
              @for (p of pages(); track $index) { <option [value]="$index">Page {{ $index + 1 }}</option> }
            </select>
          </label>
          @if (view() !== 'text') {
            <label class="flex flex-col gap-1"><span class="font-semibold">Column gap {{ gap() }} pt</span>
              <input type="range" min="4" max="40" aria-label="Column gap" [value]="gap()" (input)="gap.set(+$any($event.target).value)" />
            </label>
          }
        </div>
        <textarea class="field mt-3 min-h-96 w-full font-mono text-sm" readonly aria-label="Extracted output" [value]="output()"></textarea>
        <div class="mt-2 flex flex-wrap gap-2">
          <app-copy-button [text]="output()" label="Copy" />
          <button type="button" class="btn-small" (click)="download()">Download .{{ view() === 'text' ? 'txt' : view() }}</button>
          <button type="button" class="btn-small" (click)="clear()">Clear</button>
          <span class="self-center text-xs text-muted">{{ output().length.toLocaleString() }} characters</span>
        </div>
      }
    </app-tool-page>
  `,
})
export class PdfExtract {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(MAX_PDF_BYTES);
  protected readonly views: { id: View; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'csv', label: 'Table (CSV)' },
    { id: 'json', label: 'Table (JSON)' },
  ];
  protected readonly view = signal<View>('text');
  protected readonly pages = signal<TextPiece[][]>([]);
  protected readonly pageIndex = signal(-1);
  protected readonly gap = signal(12);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly needsPassword = signal(false);
  protected readonly password = signal('');
  private file: File | null = null;

  protected readonly output = computed(() => {
    const all = this.pages();
    const chosen = this.pageIndex() < 0 ? all : [all[this.pageIndex()] ?? []];
    const label = (i: number) => (this.pageIndex() < 0 ? i + 1 : this.pageIndex() + 1);
    if (this.view() === 'text') return chosen.map((p, i) => (all.length > 1 ? `--- Page ${label(i)} ---\n` : '') + pageText(p)).join('\n\n');
    const rows = chosen.flatMap((p) => pageTable(p, this.gap()));
    if (this.view() === 'csv') return toCsv(rows);
    const objects = rowsToObjects(rows);
    return JSON.stringify(objects.length ? objects : rows, null, 2);
  });

  protected open(files: File[]): void {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) return this.error.set(`This PDF is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
    this.file = file;
    this.password.set('');
    void this.read();
  }

  protected async read(): Promise<void> {
    if (!this.file) return;
    this.pages.set([]);
    this.error.set('');
    this.status.set('Reading the PDF…');
    try {
      const { task, pdf } = await openWithPdfjs(new Uint8Array(await this.file.arrayBuffer()), this.password());
      this.needsPassword.set(false);
      const pages: TextPiece[][] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        this.status.set(`Reading page ${n} of ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const text = await page.getTextContent();
        pages.push(
          (text.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
            .filter((i) => typeof i.str === 'string' && i.transform)
            .map((i) => ({ text: i.str!, x: i.transform![4], y: i.transform![5], width: i.width ?? 0, height: i.height || Math.hypot(i.transform![2], i.transform![3]) || 10 })),
        );
        page.cleanup();
      }
      await task.destroy();
      this.pages.set(pages);
      this.status.set(pages.every((p) => !p.length) ? 'No text found. This PDF is probably a scan (an image of text).' : '');
    } catch (e) {
      this.status.set('');
      if ((e as { name?: string })?.name === 'PasswordException') {
        this.needsPassword.set(true);
        this.error.set(this.password() ? 'That password is not right.' : 'This PDF is protected. Enter its password.');
      } else this.error.set('This PDF could not be read. It may be damaged.');
    }
  }

  protected download(): void {
    const ext = this.view() === 'text' ? 'txt' : this.view();
    downloadText(this.output(), `${baseName(this.file?.name ?? 'document')}.${ext}`, ext === 'json' ? 'application/json' : ext === 'csv' ? 'text/csv' : 'text/plain');
  }

  protected clear(): void {
    this.file = null;
    this.pages.set([]);
    this.status.set('');
    this.error.set('');
  }
}
