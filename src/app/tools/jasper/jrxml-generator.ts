import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { downloadText } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { HANDOFF_KEY, JrxmlError, addMissingDeclarations, analyze, parseJrxml } from './jrxml';

const CONTENT: ToolContent = {
  aboutHeading: 'About this AI JRXML generator',
  about:
    'Get a working JasperReports template in seconds. Describe the report in plain words ("monthly sales by region with ' +
    'totals"), paste the HTML and CSS of an existing layout, or upload a picture of a sample invoice or report, and the AI ' +
    'writes a .jrxml with fields, a column header, a detail row, totals and page numbers. The result is checked right away: ' +
    'missing declarations are added for you, remaining problems are listed, and you can open it in the previewer with your data.',
  steps: ['Describe the report, paste HTML, or upload a picture.', 'Pick the page size and press Generate.', 'Check, preview with sample data, then copy or download the .jrxml.'],
  faq: [
    { question: 'Which AI is used?', answer: 'Cloudflare Workers AI (Llama 3.3, and LLaVA to read pictures). Your text or picture is sent only for this request.' },
    { question: 'Is there a limit?', answer: '10 generations a day without an account, 40 a day when logged in.' },
    { question: 'Is the template always correct?', answer: 'It is a strong first draft. The checker fixes missing declarations and lists layout problems; review it in the previewer before using it in production.' },
  ],
};

type Mode = 'text' | 'html' | 'image';

@Component({
  selector: 'app-jrxml-generator',
  imports: [ToolPage, CopyButton, UploadBox],
  template: `
    <app-tool-page path="jrxml-generator" [content]="content" [wide]="true" privacy="Your description or picture is sent to Cloudflare Workers AI for this request only.">
      <div class="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Start from">
        @for (m of modes; track m.id) {
          <button type="button" role="tab" class="btn-small" [attr.aria-selected]="mode() === m.id" [class.!bg-brand]="mode() === m.id" [class.!text-on-brand]="mode() === m.id" (click)="mode.set(m.id)">{{ m.label }}</button>
        }
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-3">
          @if (mode() === 'image') {
            <app-upload-box title="Drop a picture of the report" buttonLabel="Choose picture" accept="image/png,image/jpeg,image/webp" (filesSelected)="pickImage($event)" />
            @if (image()) { <img [src]="image()" alt="Report picture" class="max-h-64 rounded-lg border border-line object-contain" /> }
          }
          <textarea class="field min-h-56 text-sm" [class.font-mono]="mode() === 'html'" [attr.aria-label]="mode() === 'html' ? 'HTML and CSS' : mode() === 'image' ? 'Extra notes' : 'Report description'"
            [placeholder]="placeholders[mode()]" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
          <div class="flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 font-semibold">Page
              <select class="field font-normal" aria-label="Page size" (change)="page.set($any($event.target).value)"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A5">A5</option></select>
            </label>
            <label class="flex items-center gap-2"><input type="checkbox" [checked]="landscape()" (change)="landscape.set($any($event.target).checked)" /> Landscape</label>
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Generating… (up to a minute)' : 'Generate JRXML' }}</button>
            <button type="button" class="btn-small" (click)="clear()">Clear</button>
          </div>
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          @if (jrxml()) {
            <p class="flex flex-wrap gap-2 text-sm" role="status">
              @if (check().parseError) { <span class="chip !border-danger !text-danger">Invalid XML: {{ check().parseError }}</span> }
              @else {
                <span class="chip !border-danger !text-danger">{{ check().errors }} errors</span>
                <span class="chip !border-warning !text-warning">{{ check().warnings }} warnings</span>
                @if (fixedCount()) { <span class="chip !border-success !text-success">{{ fixedCount() }} missing declarations added</span> }
              }
            </p>
            <textarea class="field min-h-[28rem] font-mono text-xs" aria-label="Generated JRXML" spellcheck="false" [value]="jrxml()" (input)="jrxml.set($any($event.target).value)"></textarea>
            <div class="flex flex-wrap gap-2">
              <app-copy-button [text]="jrxml()" label="Copy" />
              <button type="button" class="btn-small" (click)="download()">Download .jrxml</button>
              <button type="button" class="btn-secondary" (click)="openIn('/jrxml-preview')">Preview with data</button>
              <button type="button" class="btn-small" (click)="openIn('/jrxml-debugger')">Check in debugger</button>
            </div>
          } @else {
            <div class="card grid min-h-72 place-items-center p-6 text-center text-sm text-muted">The generated template appears here.</div>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JrxmlGenerator {
  protected readonly content = CONTENT;
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly modes: { id: Mode; label: string }[] = [
    { id: 'text', label: 'Describe it' },
    { id: 'html', label: 'From HTML / CSS' },
    { id: 'image', label: 'From a picture' },
  ];
  protected readonly placeholders: Record<Mode, string> = {
    text: 'e.g. Sales invoice with company name and invoice number at the top, customer details, a table of items (product, quantity, unit price, amount), subtotal, 18% GST and grand total, and page numbers in the footer.',
    html: '<table>…</table> with <style>…</style>',
    image: 'Optional: anything the picture does not show (field names, page size, totals)…',
  };
  protected readonly mode = signal<Mode>('text');
  protected readonly text = signal('');
  protected readonly image = signal('');
  protected readonly page = signal('A4');
  protected readonly landscape = signal(false);
  protected readonly jrxml = signal('');
  protected readonly fixedCount = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly check = computed(() => {
    try {
      const issues = analyze(parseJrxml(this.jrxml()));
      return { parseError: '', errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length };
    } catch (e) {
      return { parseError: e instanceof JrxmlError ? e.message : String(e), errors: 0, warnings: 0 };
    }
  });

  /** Shrinks the picture to at most 1280px wide as JPEG, so it stays under the upload limit. */
  protected async pickImage(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    this.image.set(canvas.toDataURL('image/jpeg', 0.85));
  }

  protected async generate(): Promise<void> {
    if (this.mode() === 'image' && !this.image()) return this.error.set('Choose a picture first.');
    if (this.mode() !== 'image' && !this.text().trim()) return this.error.set(this.mode() === 'html' ? 'Paste the HTML first.' : 'Describe the report first.');
    this.busy.set(true);
    this.error.set('');
    try {
      const { jrxml } = await this.auth.call<{ jrxml: string }>('POST', '/api/jasper/generate', {
        mode: this.mode(),
        text: this.text(),
        image: this.mode() === 'image' ? this.image() : undefined,
        page: this.page(),
        landscape: this.landscape(),
      });
      let result = jrxml;
      let added = 0;
      try {
        const fixed = addMissingDeclarations(jrxml, parseJrxml(jrxml));
        added = (fixed.match(/<(field|parameter) /g) ?? []).length - (jrxml.match(/<(field|parameter) /g) ?? []).length;
        result = fixed;
      } catch {
        // Invalid XML: shown as it is, with the error.
      }
      this.fixedCount.set(added);
      this.jrxml.set(result);
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'The template could not be generated. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    let name = 'report';
    try {
      name = parseJrxml(this.jrxml()).name || name;
    } catch {
      // Keep the default name.
    }
    downloadText(this.jrxml(), `${name}.jrxml`, 'application/xml');
  }

  protected openIn(path: string): void {
    try {
      sessionStorage.setItem(HANDOFF_KEY, this.jrxml());
    } catch {
      // Storage blocked: the page opens with its sample.
    }
    void this.router.navigate([path], { queryParams: { from: 'generator' } });
  }

  protected clear(): void {
    this.text.set('');
    this.image.set('');
    this.jrxml.set('');
    this.error.set('');
  }
}
