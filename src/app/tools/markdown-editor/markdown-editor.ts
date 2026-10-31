import { Component, DestroyRef, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { Align, parseCells, renderMarkdown, toMarkdownTable } from './markdown';

const SAMPLE = `# Release 2.4

Faster checkout and **dark mode**. See the [changelog](https://example.com/changelog).

## What changed

- [x] Dark mode for every screen
- [x] 30% faster checkout
- [ ] Offline cart (next release)

| Platform | Version | Status |
| -------- | ------- | ------ |
| Android  | 2.4.0   | Live   |
| iOS      | 2.4.0   | Review |

\`\`\`kotlin
val total = cart.items.sumOf { it.price * it.qty }
\`\`\`

> Thanks to everyone who reported bugs!
`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this Markdown editor',
  about:
    'Write README files, pull request descriptions, release notes and docs in Markdown and see the result as you type, ' +
    'with GitHub-flavoured extras: tables, task lists, strikethrough and fenced code. The table maker turns cells copied ' +
    'from Excel or Google Sheets, or CSV, into a neatly aligned Markdown table. Copy the Markdown or the HTML, or ' +
    'download either. The preview removes scripts, so pasted Markdown cannot run code.',
  steps: [
    'Write or paste Markdown on the left, or start from the sample.',
    'Check the preview on the right.',
    'To make a table, paste spreadsheet cells under Table maker and insert the result.',
    'Copy or download the Markdown, or copy the HTML for an email or a CMS.',
  ],
  faq: [
    { question: 'Is this the same Markdown as GitHub?', answer: 'It follows GitHub-flavoured Markdown: tables, task lists, autolinks and fenced code blocks. GitHub-only features such as @mentions and issue links are not resolved.' },
    { question: 'Is the HTML safe to use?', answer: 'Yes. Scripts, event handlers and other active content are removed with DOMPurify before showing or copying.' },
    { question: 'Is my text saved?', answer: 'No. Use Download to keep a copy. Nothing is uploaded.' },
  ],
};

@Component({
  selector: 'app-markdown-editor',
  imports: [CodeEditor, CopyButton, ShareButton, ToolPage],
  template: `
    <app-tool-page path="markdown-editor" [content]="content" [wide]="true">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-small" (click)="setText(sample)">Try a sample</button>
        <button type="button" class="btn-small" [disabled]="!text()" (click)="setText('')">Clear</button>
        <app-copy-button [text]="text()" label="Copy Markdown" />
        <app-copy-button [text]="html()" label="Copy HTML" />
        <button type="button" class="btn-small" [disabled]="!text()" (click)="download('md')">Download .md</button>
        <button type="button" class="btn-small" [disabled]="!text()" (click)="download('html')">Download .html</button>
        <app-share-button path="markdown-editor" [data]="text() ? { input: text() } : null" />
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Markdown</span>
          <app-code-editor class="h-[32rem]" ariaLabel="Markdown" placeholder="# Write Markdown here" [value]="text()" (valueChange)="onText($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Preview</span>
          <article class="markdown-body card h-[32rem] overflow-auto p-5" aria-label="Preview" [innerHTML]="safeHtml()"></article>
        </div>
      </div>

      <section class="mt-10" aria-labelledby="table-heading">
        <h2 id="table-heading" class="text-xl leading-7">Table maker</h2>
        <p class="mt-1 text-sm text-muted">Paste cells from Excel or Google Sheets, or CSV. The first row becomes the header.</p>
        <div class="mt-3 grid gap-4 lg:grid-cols-2">
          <textarea rows="6" class="field-code" aria-label="Table cells" placeholder="Name&#9;Role&#10;Ada&#9;Engineer" [value]="cells()" (input)="cells.set($any($event.target).value)"></textarea>
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <select class="field py-1" aria-label="Alignment" [value]="align()" (change)="align.set($any($event.target).value)">
                <option value="none">Default alignment</option>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
              <app-copy-button [text]="table()" label="Copy table" />
              <button type="button" class="btn-small" [disabled]="!table()" (click)="insertTable()">Insert into editor</button>
            </div>
            <pre class="field-code max-h-44 overflow-auto" aria-label="Markdown table">{{ table() }}</pre>
          </div>
        </div>
      </section>
    </app-tool-page>
  `,
})
export class MarkdownEditor {
  protected readonly content = CONTENT;
  protected readonly sample = SAMPLE;
  protected readonly text = signal(SAMPLE);
  protected readonly html = signal('');
  protected readonly cells = signal('');
  protected readonly align = signal<Align>('none');
  protected readonly table = computed(() => toMarkdownTable(parseCells(this.cells()), this.align()));
  /** Already cleaned by DOMPurify; Angular's own sanitizer would also strip task-list checkboxes. */
  protected readonly safeHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.html()));

  private readonly sanitizer = inject(DomSanitizer);
  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;

  constructor() {
    // Browser only: DOMPurify needs a real document, which the prerender does not have.
    afterRenderEffect(() => {
      const text = this.text();
      const id = ++this.run;
      void renderMarkdown(text).then((html) => id === this.run && this.html.set(html));
    });
    onSharedInput((d) => this.setText(d['input'] ?? ''));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onText(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.text.set(value), 150);
  }

  protected setText(value: string): void {
    clearTimeout(this.timer);
    this.text.set(value);
  }

  protected insertTable(): void {
    this.setText(`${this.text().replace(/\s*$/, '')}\n\n${this.table()}`);
  }

  protected download(kind: 'md' | 'html'): void {
    if (kind === 'md') downloadText(this.text(), 'README.md', 'text/markdown');
    else downloadText(`<!doctype html>\n<meta charset="utf-8">\n${this.html()}`, 'document.html', 'text/html');
  }
}
