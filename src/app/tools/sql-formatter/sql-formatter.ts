import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { SQL_CONTENT, SQL_SAMPLE } from './content';
import { DIALECTS, Dialect, KeywordCase, compactSql, formatSql } from './sql';

const DEBOUNCE_MS = 250;

@Component({
  selector: 'app-sql-formatter',
  imports: [Icon, CodeEditor, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Database</span>
          <select class="field" [value]="dialect()" (change)="dialect.set($any($event.target).value)">
            @for (d of dialects; track d.value) {
              <option [value]="d.value">{{ d.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Keywords</span>
          <select class="field" [value]="keywordCase()" (change)="keywordCase.set($any($event.target).value)">
            <option value="upper">UPPERCASE</option>
            <option value="lower">lowercase</option>
            <option value="preserve">As written</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Indent</span>
          <select class="field" [value]="indent()" (change)="indent.set(+$any($event.target).value)">
            <option [value]="2">2 spaces</option>
            <option [value]="4">4 spaces</option>
            <option [value]="0">Tab</option>
          </select>
        </label>
        <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Output">
          @for (option of [false, true]; track option) {
            <button
              type="button"
              role="radio"
              class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
              [class]="oneLine() === option ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
              [attr.aria-checked]="oneLine() === option"
              (click)="oneLine.set(option)"
            >
              {{ option ? 'One line' : 'Formatted' }}
            </button>
          }
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!input()" (click)="setInput('')">Clear</button>
        </div>
      </div>

      <div id="sql-status" class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (output()) {
          <p class="flex items-center gap-2 font-semibold">
            <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
            {{ oneLine() ? 'Collapsed to one line.' : 'Formatted.' }}
          </p>
        } @else {
          <p class="text-muted">Paste a query on the left. It is formatted as you type.</p>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">SQL</span>
          <app-code-editor
            #inputEditor
            class="h-80 lg:h-[32rem]"
            language="sql"
            ariaLabel="SQL input"
            placeholder="Paste SQL here, for example select * from orders where status = 'paid'"
            [invalid]="!!error()"
            [value]="input()"
            (valueChange)="onInput($event)"
          />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Result</span>
            <div class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
                <app-icon [path]="icons.download" [size]="16" />
                Download
              </button>
            </div>
          </div>
          <app-code-editor class="h-80 lg:h-[32rem]" language="sql" ariaLabel="Formatted SQL" placeholder="The formatted SQL appears here." [readOnly]="true" [value]="output()" />
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Your queries are formatted in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class SqlFormatter {
  protected readonly tool = TOOLS.find((t) => t.path === 'sql-formatter')!;
  protected readonly content = SQL_CONTENT;
  protected readonly icons = ICONS;
  protected readonly dialects = DIALECTS;

  protected readonly input = signal('');
  private readonly settled = signal('');
  protected readonly dialect = signal<Dialect>('sql');
  protected readonly keywordCase = signal<KeywordCase>('upper');
  protected readonly indent = signal(2);
  protected readonly oneLine = signal(false);
  protected readonly output = signal('');
  protected readonly error = signal<string | null>(null);

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;

  constructor() {
    effect(() => {
      const sql = this.settled();
      const options = { dialect: this.dialect(), keywordCase: this.keywordCase(), indent: this.indent() };
      const oneLine = this.oneLine();
      void this.format(sql, options, oneLine);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.input.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set(value), DEBOUNCE_MS);
  }

  protected setInput(value: string): void {
    clearTimeout(this.timer);
    this.input.set(value);
    this.settled.set(value);
  }

  protected loadSample(): void {
    this.setInput(SQL_SAMPLE);
    this.analytics.track('sql-sample', {});
  }

  protected download(): void {
    downloadText(this.output() + '\n', 'query.sql', 'application/sql');
  }

  private async format(sql: string, options: Parameters<typeof formatSql>[1], oneLine: boolean): Promise<void> {
    const run = ++this.run;
    if (!sql.trim()) {
      this.output.set('');
      this.error.set(null);
      this.inputEditor().clearError();
      return;
    }
    if (oneLine) {
      this.output.set(compactSql(sql));
      this.error.set(null);
      this.inputEditor().clearError();
      return;
    }
    const result = await formatSql(sql, options);
    if (run !== this.run) return;
    if (result.ok) {
      this.output.set(result.output);
      this.error.set(null);
      this.inputEditor().clearError();
    } else {
      this.output.set('');
      this.error.set(result.error);
      if (result.line) this.inputEditor().showError(result.line, result.column ?? 1, result.error);
    }
  }
}
