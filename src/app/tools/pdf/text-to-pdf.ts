import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { baseName, downloadBlob } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { blocksToHtml, blocksToPdf, hasUnsupportedCharacters, jsonToBlocks, markdownToBlocks, textToBlocks, type Block } from './text-pdf';

const CONTENT: ToolContent = {
  aboutHeading: 'About this text, Markdown and JSON to PDF converter',
  about:
    'Turn notes, README files and API payloads into clean, readable PDFs. Markdown keeps its headings, lists, code ' +
    'blocks, quotes and tables. JSON is pretty-printed, and an array of records also becomes a table. Plain text becomes ' +
    'paragraphs, or a monospace listing for logs. Download the PDF directly, or use "Print / Save as PDF" for any language ' +
    'and the exact preview styling. Nothing is uploaded.',
  steps: ['Paste text, Markdown or JSON, or open a .md, .txt or .json file.', 'Set the title, page size and font size.', 'Download the PDF or use Print / Save as PDF.'],
  faq: [
    { question: 'Hindi or other non-Latin text shows "?" in the downloaded PDF', answer: 'The built-in PDF fonts cover Latin letters only. Use "Print / Save as PDF": your browser then uses its own fonts, so every language works.' },
    { question: 'Is my text uploaded?', answer: 'No. The PDF is made in your browser.' },
  ],
};

const SAMPLES: Record<Mode, string> = {
  markdown:
    '# Release notes 2.4\n\nThis release adds **export to PDF** and fixes two login bugs.\n\n## Changes\n\n- New PDF export on the reports page\n- Faster search\n- Fixed: session expired too early\n\n## API\n\n```http\nGET /api/reports/42/pdf\nAuthorization: Bearer <token>\n```\n\n| Endpoint | Method | Status |\n|---|---|---|\n| /api/reports | GET | Stable |\n| /api/reports/:id/pdf | GET | New |\n\n> Deploy to staging first, then production.',
  text: 'Daily notes\n\nChecked the payment flow on staging. Refunds work, partial refunds need a fix.\n\nNext: write tests for the refund service and review the UI merge request.',
  json: '[\n  {"id": 101, "customer": "Asha Rao", "amount": 2499, "status": "paid"},\n  {"id": 102, "customer": "Ravi Kumar", "amount": 799, "status": "pending"},\n  {"id": 103, "customer": "Meera Shah", "amount": 1200, "status": "refunded"}\n]',
};

type Mode = 'markdown' | 'text' | 'json';

@Component({
  selector: 'app-text-to-pdf',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="text-to-pdf" [content]="content" [wide]="true" privacy="Made in your browser. Your text is never uploaded.">
      <div class="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm">
        <label class="flex flex-col gap-1"><span class="font-semibold">Input</span>
          <select class="field" aria-label="Input type" (change)="setMode($any($event.target).value)">
            <option value="markdown" [selected]="mode() === 'markdown'">Markdown</option>
            <option value="text" [selected]="mode() === 'text'">Plain text</option>
            <option value="json" [selected]="mode() === 'json'">JSON</option>
          </select>
        </label>
        @if (mode() === 'text') {
          <label class="flex items-center gap-2"><input type="checkbox" [checked]="monospace()" (change)="monospace.set($any($event.target).checked)" /> Monospace (logs, code)</label>
        }
        <label class="flex flex-col gap-1"><span class="font-semibold">Title</span>
          <input class="field" aria-label="Title" [value]="title()" (input)="title.set($any($event.target).value)" />
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Page</span>
          <select class="field" aria-label="Page size" (change)="pageSize.set($any($event.target).value)"><option value="A4">A4</option><option value="Letter">Letter</option></select>
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Font size</span>
          <select class="field" aria-label="Font size" (change)="fontSize.set(+$any($event.target).value)"><option value="10">10</option><option value="11" selected>11</option><option value="12">12</option><option value="14">14</option></select>
        </label>
        <label class="flex items-center gap-2"><input type="checkbox" [checked]="pageNumbers()" (change)="pageNumbers.set($any($event.target).checked)" /> Page numbers</label>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-2">
          <textarea class="field min-h-96 flex-1 font-mono text-sm" aria-label="Text to convert" spellcheck="false" [value]="input()" (input)="input.set($any($event.target).value)"></textarea>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-small" (click)="input.set(samples[mode()])">Sample</button>
            <app-copy-button [text]="input()" label="Copy" />
            <button type="button" class="btn-small" (click)="input.set('')">Clear</button>
          </div>
          <app-upload-box title="Or drop a .md, .txt or .json file" buttonLabel="Open file" accept=".md,.markdown,.txt,.json,.log,text/plain,application/json" (filesSelected)="openFile($event)" />
        </div>
        <div class="flex min-w-0 flex-col gap-2">
          <iframe #preview class="min-h-96 flex-1 rounded-xl border border-line bg-white" title="Preview" sandbox="allow-same-origin allow-modals"></iframe>
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-2 text-sm" role="alert">{{ error() }}</p> }
          @if (nonLatin()) { <p class="text-sm text-warning" role="status">This text has letters the downloaded PDF cannot show (they become "?"). Use Print / Save as PDF for them.</p> }
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" [disabled]="busy() || !blocks().length" (click)="download()">{{ busy() ? 'Making PDF…' : 'Download PDF' }}</button>
            <button type="button" class="btn-secondary" [disabled]="!blocks().length" (click)="print()">Print / Save as PDF</button>
          </div>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class TextToPdf {
  protected readonly content = CONTENT;
  protected readonly samples = SAMPLES;
  protected readonly mode = signal<Mode>('markdown');
  protected readonly input = signal(SAMPLES.markdown);
  protected readonly monospace = signal(false);
  protected readonly title = signal('');
  protected readonly pageSize = signal<'A4' | 'Letter'>('A4');
  protected readonly fontSize = signal(11);
  protected readonly pageNumbers = signal(true);
  protected readonly blocks = signal<Block[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly html = computed(() => blocksToHtml(this.blocks(), this.title()));
  protected readonly nonLatin = computed(() => hasUnsupportedCharacters(this.input() + this.title()));
  private readonly preview = viewChild<ElementRef<HTMLIFrameElement>>('preview');
  private fileName = 'document';

  constructor() {
    // Set directly: an Angular binding would sanitize the HTML and drop its <style> blocks. The frame
    // is sandboxed without scripts, so nothing in it can run.
    effect(() => {
      const frame = this.preview()?.nativeElement;
      if (frame) frame.srcdoc = this.html();
    });
    effect(() => {
      const text = this.input();
      const mode = this.mode();
      const mono = this.monospace();
      void this.parse(text, mode, mono);
    });
  }

  private async parse(text: string, mode: Mode, mono: boolean): Promise<void> {
    try {
      this.blocks.set(mode === 'markdown' ? await markdownToBlocks(text) : mode === 'json' ? (text.trim() ? jsonToBlocks(text) : []) : textToBlocks(text, mono));
      this.error.set('');
    } catch (e) {
      this.error.set(`This is not valid JSON: ${(e as Error).message}`);
    }
  }

  protected setMode(mode: Mode): void {
    if (!this.input().trim() || Object.values(SAMPLES).includes(this.input())) this.input.set(SAMPLES[mode]);
    this.mode.set(mode);
  }

  protected async openFile(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    this.fileName = baseName(file.name);
    const text = await file.text();
    this.mode.set(/\.json$/i.test(file.name) ? 'json' : /\.(md|markdown)$/i.test(file.name) ? 'markdown' : 'text');
    this.input.set(text);
    if (!this.title()) this.title.set(this.fileName);
  }

  protected async download(): Promise<void> {
    this.busy.set(true);
    try {
      const bytes = await blocksToPdf(this.blocks(), { size: this.pageSize(), fontSize: this.fontSize(), title: this.title(), pageNumbers: this.pageNumbers() });
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${(this.title() || this.fileName).replace(/[^\w\- ]+/g, '').trim() || 'document'}.pdf`);
    } catch {
      this.error.set('The PDF could not be made.');
    } finally {
      this.busy.set(false);
    }
  }

  protected print(): void {
    this.preview()?.nativeElement.contentWindow?.print();
  }
}
