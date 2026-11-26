import { Component, signal } from '@angular/core';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { makeDummyPdf, type DummyOptions } from './dummy-pdf';

const CONTENT: ToolContent = {
  aboutHeading: 'About this dummy PDF generator',
  about:
    'Make sample PDFs for testing file uploads, size limits, previews and parsers. Choose the number of pages, A4 or ' +
    'Letter, text, tables or both, and an exact file size such as 1 MB, 5 MB or 10 MB. The size is matched to the byte, ' +
    'so you can test "file too large" errors right at the limit. Files are made in your browser.',
  steps: ['Choose pages, page size and content.', 'Pick a file size, or leave it natural.', 'Generate and download.'],
  faq: [
    { question: 'How is the exact size reached?', answer: 'Random data is stored in an unused part of the file. Viewers ignore it, so the PDF opens normally but has exactly the size you chose.' },
    { question: 'Is 1 MB 1,000,000 or 1,048,576 bytes?', answer: 'Choose either: the size list has both MB (1,000,000) and MiB (1,048,576) options.' },
  ],
};

const SIZES: { label: string; bytes: number }[] = [
  { label: 'Natural size (no padding)', bytes: 0 },
  { label: '100 KB', bytes: 100_000 },
  { label: '500 KB', bytes: 500_000 },
  { label: '1 MB (1,000,000 bytes)', bytes: 1_000_000 },
  { label: '1 MiB (1,048,576 bytes)', bytes: 1_048_576 },
  { label: '2 MB', bytes: 2_000_000 },
  { label: '5 MB', bytes: 5_000_000 },
  { label: '5 MiB', bytes: 5 * 1_048_576 },
  { label: '10 MB', bytes: 10_000_000 },
  { label: '10 MiB', bytes: 10 * 1_048_576 },
  { label: '25 MB', bytes: 25_000_000 },
  { label: '50 MB', bytes: 50_000_000 },
];

/** "1MB", "5MiB" or "2.5MB", for file names. */
export function sizeLabel(bytes: number): string {
  if (bytes % 1_048_576 === 0) return `${bytes / 1_048_576}MiB`;
  if (bytes >= 1_000_000) return `${+(bytes / 1_000_000).toFixed(2)}MB`;
  return `${+(bytes / 1000).toFixed(1)}KB`;
}

@Component({
  selector: 'app-dummy-pdf-generator',
  imports: [ToolPage],
  template: `
    <app-tool-page path="dummy-pdf-generator" [content]="content" privacy="Made in your browser. Nothing is uploaded.">
      <fieldset class="card grid gap-4 p-4 text-sm sm:grid-cols-2" [disabled]="busy()">
        <legend class="sr-only">PDF settings</legend>
        <label class="flex flex-col gap-1"><span class="font-semibold">Title</span>
          <input class="field" aria-label="Title" [value]="title()" (input)="title.set($any($event.target).value)" />
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Pages (1–500)</span>
          <input class="field" type="number" min="1" max="500" aria-label="Pages" [value]="pages()" (input)="pages.set(clamp(+$any($event.target).value))" />
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Page size</span>
          <select class="field" aria-label="Page size" (change)="size.set($any($event.target).value)">
            <option value="A4" [selected]="size() === 'A4'">A4</option>
            <option value="Letter" [selected]="size() === 'Letter'">US Letter</option>
          </select>
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Content</span>
          <select class="field" aria-label="Content" (change)="contentType.set($any($event.target).value)">
            <option value="both" [selected]="contentType() === 'both'">Text and a table</option>
            <option value="text" [selected]="contentType() === 'text'">Text only</option>
            <option value="table" [selected]="contentType() === 'table'">Table only</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 sm:col-span-2"><span class="font-semibold">File size</span>
          <select class="field" aria-label="File size" (change)="target.set(+$any($event.target).value)">
            @for (s of sizes; track s.bytes) { <option [value]="s.bytes" [selected]="target() === s.bytes">{{ s.label }}</option> }
            <option value="-1">Custom…</option>
          </select>
          @if (target() === -1) {
            <span class="mt-1 flex items-center gap-2"><input class="field !w-32" type="number" min="0.01" step="0.01" aria-label="Custom size in MB" [value]="customMb()" (input)="customMb.set(+$any($event.target).value)" /> MB</span>
          }
        </label>
      </fieldset>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" class="btn-primary" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Generating…' : 'Generate and download' }}</button>
        <button type="button" class="btn-small" (click)="reset()">Reset</button>
      </div>
      @if (done()) { <p class="mt-3 text-sm text-success" role="status">{{ done() }}</p> }
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
    </app-tool-page>
  `,
})
export class DummyPdfGenerator {
  protected readonly content = CONTENT;
  protected readonly sizes = SIZES;
  protected readonly title = signal('Sample document');
  protected readonly pages = signal(5);
  protected readonly size = signal<DummyOptions['size']>('A4');
  protected readonly contentType = signal<DummyOptions['content']>('both');
  protected readonly target = signal(0);
  protected readonly customMb = signal(3);
  protected readonly busy = signal(false);
  protected readonly done = signal('');
  protected readonly error = signal('');

  protected clamp(n: number): number {
    return Math.min(500, Math.max(1, Math.floor(n) || 1));
  }

  protected async generate(): Promise<void> {
    const targetBytes = this.target() === -1 ? Math.round(this.customMb() * 1_000_000) : this.target();
    if (targetBytes > 100_000_000) return this.error.set('The largest size is 100 MB.');
    this.busy.set(true);
    this.error.set('');
    this.done.set('');
    try {
      const bytes = await makeDummyPdf({ pages: this.pages(), size: this.size(), content: this.contentType(), targetBytes, title: this.title() });
      const name = `dummy-${this.pages()}p${targetBytes ? '-' + sizeLabel(targetBytes) : ''}.pdf`;
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name);
      const note = targetBytes && bytes.length > targetBytes ? ` The pages alone are bigger than the size you chose.` : '';
      this.done.set(`Downloaded ${name}: ${this.pages()} pages, ${bytes.length.toLocaleString()} bytes (${formatBytes(bytes.length)}).${note}`);
    } catch {
      this.error.set('The PDF could not be made. Try fewer pages or a smaller size.');
    } finally {
      this.busy.set(false);
    }
  }

  protected reset(): void {
    this.title.set('Sample document');
    this.pages.set(5);
    this.target.set(0);
    this.size.set('A4');
    this.contentType.set('both');
    this.done.set('');
    this.error.set('');
  }
}
