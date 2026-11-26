import { Component, PLATFORM_ID, computed, effect, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { downloadBlob, downloadText } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { pagesToHtml, pagesToPdf, rowsToCsv, rowsToDocx, rowsToXlsx } from './export';
import { fill, parseData, recordTable, type DataRecord, type FillResult } from './fill';
import { JrxmlError, parseJrxml, takeHandoff, type JrReport } from './jrxml';
import { SAMPLE_DATA, SAMPLE_JRXML } from './sample';

const CONTENT: ToolContent = {
  aboutHeading: 'About this JRXML previewer',
  about:
    'Preview a JasperReports template without opening Jaspersoft Studio. Paste or open a .jrxml file with sample JSON, ' +
    'CSV or XML data and see the pages right away: title, column and page headers, one detail row per record, page ' +
    'breaks, page numbers ("Page 1 of 3"), totals, patterns such as #,##0.00 and dd/MM/yyyy, and common Java ' +
    'expressions. Export the result as PDF or HTML, and the data rows as Excel, CSV or Word. Everything runs in your ' +
    'browser. It is a fast approximation for checking layouts and data mapping, not the JasperReports engine itself.',
  steps: ['Paste or open your .jrxml template.', 'Paste sample data (JSON array, CSV or XML) and any parameters.', 'Check the pages, then export PDF, HTML, Excel, CSV or Word.'],
  faq: [
    { question: 'How close is it to real JasperReports output?', answer: 'Positions, bands, page breaks, patterns and simple expressions match. Charts, subreports, crosstabs, images and custom fonts are shown as placeholders; use the JasperReports engine for the final file.' },
    { question: 'My expression shows in red', answer: 'The previewer could not evaluate it (for example a custom Java class). The rest of the page still works; check it with the Expression Helper.' },
    { question: 'Is my template uploaded?', answer: 'No. It is read and drawn in your browser.' },
  ],
};

type DataFormat = 'json' | 'csv' | 'xml';

@Component({
  selector: 'app-jrxml-preview',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="jrxml-preview" [content]="content" [wide]="true" privacy="Your template and data stay in your browser.">
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div class="flex min-w-0 flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm font-semibold">JRXML template
            <textarea class="field min-h-72 font-mono text-xs font-normal" aria-label="JRXML template" spellcheck="false" [value]="jrxml()" (input)="jrxml.set($any($event.target).value)"></textarea>
          </label>
          <div class="flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 font-semibold">Data format
              <select class="field font-normal" aria-label="Data format" (change)="format.set($any($event.target).value)">
                <option value="json" [selected]="format() === 'json'">JSON</option>
                <option value="csv" [selected]="format() === 'csv'">CSV</option>
                <option value="xml" [selected]="format() === 'xml'">XML</option>
              </select>
            </label>
            <button type="button" class="btn-small" (click)="loadSample()">Sample report</button>
            <app-copy-button [text]="jrxml()" label="Copy JRXML" />
            <button type="button" class="btn-small" (click)="clear()">Clear</button>
          </div>
          <label class="flex flex-col gap-1 text-sm font-semibold">Data
            <textarea class="field min-h-40 font-mono text-xs font-normal" aria-label="Data" spellcheck="false" [value]="data()" (input)="data.set($any($event.target).value)"></textarea>
          </label>
          <label class="flex flex-col gap-1 text-sm font-semibold">Parameters (JSON, optional)
            <input class="field font-mono text-xs font-normal" aria-label="Parameters" placeholder='{"COMPANY": "My Company"}' [value]="params()" (input)="params.set($any($event.target).value)" />
          </label>
          <app-upload-box title="Or drop a .jrxml and a data file" buttonLabel="Open files" [multiple]="true" accept=".jrxml,.xml,.json,.csv" (filesSelected)="openFiles($event)" />
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
          @if (result(); as r) {
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-semibold" role="status">{{ r.pages.length }} page{{ r.pages.length === 1 ? '' : 's' }} · {{ records().length }} record{{ records().length === 1 ? '' : 's' }}</span>
              <span class="flex-1"></span>
              <button type="button" class="btn-primary !py-1.5" [disabled]="busy()" (click)="exportPdf()">PDF</button>
              <button type="button" class="btn-small" [disabled]="busy()" (click)="exportXlsx()">Excel</button>
              <button type="button" class="btn-small" (click)="exportCsv()">CSV</button>
              <button type="button" class="btn-small" (click)="exportHtml()">HTML</button>
              <button type="button" class="btn-small" [disabled]="busy()" (click)="exportDocx()">Word</button>
            </div>
            @if (r.warnings.length) {
              <details class="rounded-xl border border-warning bg-warning/10 px-4 py-2 text-sm">
                <summary class="cursor-pointer font-semibold">{{ r.warnings.length }} note{{ r.warnings.length === 1 ? '' : 's' }} about this preview</summary>
                <ul class="mt-2 list-disc pl-5">@for (w of r.warnings; track $index) { <li>{{ w }}</li> }</ul>
              </details>
            }
            <div class="max-h-[80vh] overflow-auto rounded-xl border border-line bg-[#e5e7eb] p-4" aria-label="Report preview" role="region">
              <div [style.zoom]="zoom()" [innerHTML]="previewHtml()"></div>
            </div>
            <label class="flex items-center gap-2 text-sm">Zoom
              <input type="range" min="0.4" max="1.5" step="0.1" aria-label="Zoom" [value]="zoom()" (input)="zoom.set(+$any($event.target).value)" /> {{ (zoom() * 100).toFixed(0) }}%</label>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JrxmlPreview {
  protected readonly content = CONTENT;
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly jrxml = signal(SAMPLE_JRXML);
  protected readonly data = signal(SAMPLE_DATA);
  protected readonly params = signal('');
  protected readonly format = signal<DataFormat>('json');
  protected readonly report = signal<JrReport | null>(null);
  protected readonly records = signal<DataRecord[]>([]);
  protected readonly result = signal<FillResult | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly zoom = signal(0.8);
  /** The pages are built from escaped text only (see export.ts), so they are safe to show as HTML. */
  protected readonly previewHtml = computed<SafeHtml>(() => {
    const r = this.result();
    const report = this.report();
    return r && report ? this.sanitizer.bypassSecurityTrustHtml(pagesToHtml(r.pages, report)) : '';
  });

  constructor() {
    const handed = takeHandoff();
    if (handed) this.jrxml.set(handed);
    // The template is read with the browser's XML parser, so only in the browser.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      if (browser) void this.render(this.jrxml(), this.data(), this.format(), this.params());
    });
  }

  private async render(source: string, data: string, format: DataFormat, params: string): Promise<void> {
    try {
      const report = parseJrxml(source);
      let parameters: Record<string, unknown> = {};
      if (params.trim()) {
        try {
          parameters = JSON.parse(params);
        } catch {
          throw new Error('Parameters must be JSON, for example {"COMPANY": "Acme"}.');
        }
      }
      let records: DataRecord[];
      try {
        records = await parseData(data, format);
      } catch (e) {
        throw new Error(`The ${format.toUpperCase()} data could not be read: ${(e as Error).message}`);
      }
      this.report.set(report);
      this.records.set(records);
      this.result.set(fill(report, records, parameters));
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof JrxmlError && e.line ? `Line ${e.line}: ${e.message}` : (e as Error).message);
    }
  }

  protected loadSample(): void {
    this.jrxml.set(SAMPLE_JRXML);
    this.data.set(SAMPLE_DATA);
    this.format.set('json');
    this.params.set('');
  }

  protected clear(): void {
    this.jrxml.set('');
    this.data.set('');
    this.params.set('');
    this.result.set(null);
  }

  protected async openFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const text = await file.text();
      if (/\.jrxml$/i.test(file.name) || /<jasperReport\b/.test(text)) this.jrxml.set(text);
      else {
        this.format.set(/\.csv$/i.test(file.name) ? 'csv' : /\.xml$/i.test(file.name) ? 'xml' : 'json');
        this.data.set(text);
      }
    }
  }

  private get base(): string {
    return this.report()?.name || 'report';
  }

  protected async exportPdf(): Promise<void> {
    const r = this.result();
    const report = this.report();
    if (!r || !report) return;
    this.busy.set(true);
    try {
      const bytes = await pagesToPdf(r.pages, report);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${this.base}.pdf`);
    } finally {
      this.busy.set(false);
    }
  }

  protected exportHtml(): void {
    const r = this.result();
    const report = this.report();
    if (r && report) downloadText(pagesToHtml(r.pages, report, true), `${this.base}.html`, 'text/html');
  }

  protected exportCsv(): void {
    const report = this.report();
    if (report) downloadText(rowsToCsv(recordTable(report, this.records())), `${this.base}.csv`, 'text/csv');
  }

  protected async exportXlsx(): Promise<void> {
    const report = this.report();
    if (report) downloadBlob(await rowsToXlsx(recordTable(report, this.records()), this.base), `${this.base}.xlsx`);
  }

  protected async exportDocx(): Promise<void> {
    const report = this.report();
    if (report) downloadBlob(await rowsToDocx(recordTable(report, this.records()), this.base), `${this.base}.docx`);
  }
}
