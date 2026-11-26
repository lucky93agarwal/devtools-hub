import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { downloadText } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { JrxmlError, addMissingDeclarations, analyze, parseJrxml, takeHandoff, type Issue } from './jrxml';
import { SAMPLE_JRXML } from './sample';

const CONTENT: ToolContent = {
  aboutHeading: 'About this JRXML debugger',
  about:
    'Find what is wrong with a JasperReports template before it fails at runtime. The debugger checks XML syntax and ' +
    'points to the line, finds $F{}, $P{} and $V{} references with no declaration, elements that spill out of their band ' +
    'or past the page width, overlapping text, bands taller than the page (a common cause of blank pages and "band ' +
    'height exceeds" errors), empty bands that add white space, unclosed quotes and brackets in expressions, and unused ' +
    'fields. Each problem comes with a suggested fix, and missing declarations can be added in one click.',
  steps: ['Paste or open your .jrxml.', 'Read the problems, most serious first, with line numbers.', 'Fix them, or click "Add missing declarations", then copy or download.'],
  faq: [
    { question: 'Why do I get blank pages?', answer: 'Usually a band (often the detail or summary band) is taller than the space between the top and bottom margins, or an element sits below its band. Both are reported here.' },
    { question: 'Does it compile the report?', answer: 'No, it checks the template statically in your browser. Java code in expressions is checked for syntax, not compiled.' },
  ],
};

@Component({
  selector: 'app-jrxml-debugger',
  imports: [ToolPage, UploadBox, CopyButton, RouterLink],
  template: `
    <app-tool-page path="jrxml-debugger" [content]="content" [wide]="true" privacy="Checked in your browser. Your template is never uploaded.">
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-2">
          <textarea class="field min-h-[32rem] font-mono text-xs" aria-label="JRXML template" spellcheck="false" [value]="source()" (input)="source.set($any($event.target).value)"></textarea>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-small" (click)="source.set(sampleWithProblems)">Sample with problems</button>
            <app-copy-button [text]="source()" label="Copy" />
            <button type="button" class="btn-small" (click)="download()">Download .jrxml</button>
            <button type="button" class="btn-small" (click)="source.set('')">Clear</button>
          </div>
          <app-upload-box title="Or drop a .jrxml file" buttonLabel="Open .jrxml" accept=".jrxml,.xml" (filesSelected)="open($event)" />
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          @if (parseError(); as e) {
            <div class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">
              <p class="font-semibold">{{ e.line ? 'Line ' + e.line + ': ' : '' }}{{ e.message }}</p>
              <p class="mt-1">Fix the XML first; the other checks run once the file can be read.</p>
            </div>
          } @else if (source().trim()) {
            <div class="flex flex-wrap items-center gap-2 text-sm" role="status">
              <span class="chip !border-danger !text-danger">{{ count('error') }} errors</span>
              <span class="chip !border-warning !text-warning">{{ count('warning') }} warnings</span>
              <span class="chip">{{ count('info') }} notes</span>
              @if (canFix()) { <button type="button" class="btn-primary !py-1.5" (click)="fixDeclarations()">Add missing declarations</button> }
              <a routerLink="/jrxml-preview" class="btn-small">Open the previewer</a>
            </div>
            @if (!issues().length) { <p class="rounded-xl border border-success bg-success/10 px-4 py-3 text-sm">No problems found. 🎉</p> }
            <ul class="flex flex-col gap-2" aria-label="Problems">
              @for (i of issues(); track $index) {
                <li class="card border-l-4 p-3 text-sm" [class.!border-l-danger]="i.severity === 'error'" [class.!border-l-warning]="i.severity === 'warning'">
                  <p class="flex flex-wrap items-baseline gap-2">
                    <span class="text-xs font-bold uppercase" [class.text-danger]="i.severity === 'error'" [class.text-warning]="i.severity === 'warning'" [class.text-muted]="i.severity === 'info'">{{ i.severity }}</span>
                    @if (i.line) { <span class="font-mono text-xs text-muted">line {{ i.line }}</span> }
                  </p>
                  <p class="mt-1">{{ i.message }}</p>
                  <p class="mt-1 text-muted">Fix: {{ i.fix }}</p>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JrxmlDebugger {
  protected readonly content = CONTENT;
  protected readonly sampleWithProblems = SAMPLE_JRXML.replace('$F{customer}]]', '$F{customerName}]]')
    .replace('<reportElement x="470" y="2" width="80" height="16"/>', '<reportElement x="470" y="2" width="120" height="30"/>')
    .replace('<band height="30">', '<band height="830">');
  protected readonly source = signal(takeHandoff() ?? this.sampleWithProblems);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly parsed = computed(() => {
    // Read with the browser's XML parser; the pre-built page shows no result.
    if (!this.browser) return { report: null, error: null };
    try {
      return { report: parseJrxml(this.source()), error: null };
    } catch (e) {
      return { report: null, error: e instanceof JrxmlError ? e : new JrxmlError(String(e), null) };
    }
  });
  protected readonly parseError = computed(() => (this.source().trim() ? this.parsed().error : null));
  protected readonly issues = computed<Issue[]>(() => {
    const r = this.parsed().report;
    return r ? analyze(r) : [];
  });
  protected readonly canFix = computed(() => this.issues().some((i) => /is used .* but no <(field|parameter)/.test(i.message) || /query uses/.test(i.message)));

  protected count(severity: Issue['severity']): number {
    return this.issues().filter((i) => i.severity === severity).length;
  }

  protected fixDeclarations(): void {
    const r = this.parsed().report;
    if (r) this.source.set(addMissingDeclarations(this.source(), r));
  }

  protected async open(files: File[]): Promise<void> {
    if (files[0]) this.source.set(await files[0].text());
  }

  protected download(): void {
    downloadText(this.source(), `${this.parsed().report?.name ?? 'report'}.jrxml`, 'application/xml');
  }
}
