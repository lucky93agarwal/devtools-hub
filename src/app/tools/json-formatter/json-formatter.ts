import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { Analytics, sizeBucket } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { baseName, copyText, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { JsonRunner } from './json-runner';
import { Indent, JsonError, JsonJob, JsonResult, countLines } from './json-tools';
import { COMMON_ERRORS, FORMATTER_CONTENT } from './content';
import { JSON_SAMPLES } from './samples';

type Action = 'Formatted' | 'Minified';

type Status =
  | { kind: 'empty' }
  | { kind: 'ready' }
  | { kind: 'working'; action: Action }
  | { kind: 'valid'; action: Action }
  | { kind: 'error'; error: JsonError }
  | { kind: 'problem'; message: string };

/** How long the "Copied" confirmation stays, in ms. */
const COPIED_MS = 2000;

@Component({
  selector: 'app-json-formatter',
  imports: [Icon, CodeEditor, ToolInfoSection],
  templateUrl: './json-formatter.html',
})
export class JsonFormatter {
  protected readonly tool = TOOLS.find((t) => t.path === 'json-formatter')!;
  protected readonly icons = ICONS;
  protected readonly indents: { value: Indent; label: string }[] = [
    { value: 2, label: '2 spaces' },
    { value: 4, label: '4 spaces' },
    { value: '\t', label: 'Tab' },
  ];
  protected readonly accept = '.json,application/json,text/plain';
  protected readonly commonErrors = COMMON_ERRORS;
  protected readonly content = FORMATTER_CONTENT;

  protected readonly input = signal('');
  protected readonly output = signal('');
  protected readonly indent = signal<Indent>(2);
  protected readonly status = signal<Status>({ kind: 'empty' });
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  /** Name of the uploaded file, used for the download name. */
  private readonly fileName = signal<string | null>(null);

  protected readonly error = computed(() => {
    const status = this.status();
    return status.kind === 'error' ? status.error : null;
  });
  protected readonly action = computed(() => {
    const status = this.status();
    return status.kind === 'valid' ? status.action : null;
  });
  protected readonly problem = computed(() => {
    const status = this.status();
    return status.kind === 'problem' ? status.message : null;
  });
  protected readonly working = computed(() => this.status().kind === 'working');
  protected readonly workingLabel = computed(() => {
    const status = this.status();
    if (status.kind !== 'working') return '';
    const verb = status.action === 'Formatted' ? 'Formatting' : 'Minifying';
    return `${verb} ${formatBytes(this.input().length)} of JSON…`;
  });
  protected readonly outputLines = computed(() => countLines(this.output()));

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly runner = inject(JsonRunner);
  private readonly analytics = inject(Analytics);
  private copyTimer?: ReturnType<typeof setTimeout>;
  /** Increases with every new job, so a slow result for older text is ignored. */
  private jobId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copyTimer));
  }

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.jobId++;
    this.input.set(value);
    this.status.set(value.trim() ? { kind: 'ready' } : { kind: 'empty' });
    // The old error position no longer matches the edited text.
    this.inputEditor().clearError();
  }

  protected format(): Promise<void> {
    return this.run({ op: 'format', text: this.input(), indent: this.indent() }, 'Formatted');
  }

  protected minify(): Promise<void> {
    return this.run({ op: 'minify', text: this.input(), indent: this.indent() }, 'Minified');
  }

  /** Changing the indent re-formats right away if the output is formatted. */
  protected setIndent(indent: Indent): void {
    this.indent.set(indent);
    if (this.action() === 'Formatted') void this.format();
  }

  protected loadSample(kind: keyof typeof JSON_SAMPLES): void {
    this.fileName.set(null);
    this.setInput(JSON_SAMPLES[kind]);
    void this.format();
  }

  protected async onFileChosen(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
    if (!file) return;

    if (file.size > LIMITS.MAX_JSON_BYTES) {
      this.analytics.limitHit('json-formatter', 'file-size');
      this.status.set({
        kind: 'problem',
        message: `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_JSON_BYTES)}.`,
      });
      return;
    }
    try {
      const text = await file.text();
      this.fileName.set(file.name);
      this.setInput(text);
      void this.format();
    } catch {
      this.status.set({
        kind: 'problem',
        message: `${file.name} could not be read. Try another file.`,
      });
    }
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.output());
    this.copyState.set(ok ? 'copied' : 'failed');
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), COPIED_MS);
  }

  protected download(): void {
    const base = this.fileName() ? baseName(this.fileName()!) : 'data';
    const suffix = this.action() === 'Minified' ? 'min' : 'formatted';
    downloadText(this.output(), `${base}.${suffix}.json`);
  }

  protected clear(): void {
    this.jobId++;
    this.fileName.set(null);
    this.input.set('');
    this.output.set('');
    this.status.set({ kind: 'empty' });
    this.inputEditor().clearError();
  }

  /** Scrolls the input to the problem, puts the cursor there and flashes the line. */
  protected goToError(): void {
    const error = this.error();
    if (error) this.inputEditor().revealError(error.line, error.column);
  }

  private setInput(text: string): void {
    this.jobId++;
    this.input.set(text);
    this.output.set('');
    this.inputEditor().clearError();
  }

  private async run(job: JsonJob, action: Action): Promise<void> {
    const id = ++this.jobId;
    this.status.set({ kind: 'working', action });
    const result = await this.runner.run(job);
    // The text changed or another job started while this one ran.
    if (id !== this.jobId) return;
    this.apply(result, action);
  }

  private apply(result: JsonResult, action: Action): void {
    this.analytics.track(action === 'Formatted' ? 'json-format' : 'json-minify', {
      result: result.ok ? 'valid' : 'invalid',
      size: sizeBucket(this.input().length),
    });
    if (result.ok) {
      this.output.set(result.output);
      this.status.set({ kind: 'valid', action });
      this.inputEditor().clearError();
    } else {
      this.output.set('');
      this.status.set({ kind: 'error', error: result.error });
      this.inputEditor().showError(result.error.line, result.error.column, result.error.message);
    }
  }
}
