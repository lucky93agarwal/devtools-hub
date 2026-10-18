import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Analytics, sizeBucket } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { copyText, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { DATA_CONVERTER_CONTENT, SAMPLES } from './content';
import { DEFAULT_DATA_OPTIONS, DataError, DataFormat, DataOptions, FORMATS, parseData, writeData } from './formats';

type Result =
  | { kind: 'empty' }
  | { kind: 'error'; error: DataError }
  | { kind: 'problem'; message: string }
  | { kind: 'ok'; text: string };

/** Typing pause before converting again, in ms. */
const DEBOUNCE_MS = 250;
const COPIED_MS = 2000;
/** Monaco language for each format; CSV has none. */
const EDITOR_LANGUAGE: Record<DataFormat, string> = { json: 'json', yaml: 'yaml', xml: 'xml', csv: 'plaintext' };

const isFormat = (value: string | null): value is DataFormat => FORMATS.some((f) => f.value === value);

@Component({
  selector: 'app-data-converter',
  imports: [Icon, CodeEditor, ToolInfoSection],
  templateUrl: './data-converter.html',
})
export class DataConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'data-converter')!;
  protected readonly content = DATA_CONVERTER_CONTENT;
  protected readonly icons = ICONS;
  protected readonly formats = FORMATS;
  protected readonly languages = EDITOR_LANGUAGE;
  protected readonly accept = '.json,.yaml,.yml,.xml,.csv,.tsv,.txt,application/json,application/xml,text/xml,text/csv,text/plain';

  protected readonly from = signal<DataFormat>('json');
  protected readonly to = signal<DataFormat>('yaml');
  protected readonly options = signal<DataOptions>({ ...DEFAULT_DATA_OPTIONS });
  protected readonly input = signal('');
  private readonly settled = signal('');
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly problem = signal<string | null>(null);

  protected readonly result = computed<Result>(() => {
    const text = this.settled();
    if (!text.trim()) return { kind: 'empty' };
    const options = this.options();
    const parsed = parseData(text, this.from(), options);
    if (!parsed.ok) return { kind: 'error', error: parsed.error };
    try {
      const written = writeData(parsed.value, this.to(), options);
      return written.ok ? { kind: 'ok', text: written.text } : { kind: 'problem', message: written.message };
    } catch {
      return { kind: 'problem', message: `This data could not be written as ${this.label(this.to())}.` };
    }
  });
  protected readonly output = computed(() => {
    const result = this.result();
    return result.kind === 'ok' ? result.text : '';
  });
  protected readonly error = computed(() => {
    const result = this.result();
    return result.kind === 'error' ? result.error : null;
  });
  protected readonly resultProblem = computed(() => {
    const result = this.result();
    return result.kind === 'problem' ? result.message : null;
  });
  protected readonly fileName = computed(() => `data.${this.formats.find((f) => f.value === this.to())!.extension}`);

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly router = inject(Router);
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?from=xml&to=json opens the page set up for that conversion.
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const from = query.get('from');
    const to = query.get('to');
    if (isFormat(from)) this.from.set(from);
    if (isFormat(to)) this.to.set(to);
    if (this.from() === this.to()) this.to.set(this.from() === 'json' ? 'yaml' : 'json');

    effect(() => {
      const error = this.error();
      const editor = this.inputEditor();
      if (error) editor.showError(error.line, error.column, error.message);
      else editor.clearError();
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.copyTimer);
    });
  }

  protected label(format: DataFormat): string {
    return this.formats.find((f) => f.value === format)!.label;
  }

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.input.set(value);
    this.problem.set(null);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set(this.input()), DEBOUNCE_MS);
  }

  protected setFrom(format: DataFormat): void {
    if (format === this.to()) this.to.set(this.from());
    this.from.set(format);
    this.syncUrl();
  }

  protected setTo(format: DataFormat): void {
    if (format === this.from()) this.from.set(this.to());
    this.to.set(format);
    this.syncUrl();
  }

  /** Converts back: the output becomes the input. */
  protected swap(): void {
    const output = this.output();
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
    if (output) this.setText(output);
    this.syncUrl();
    this.analytics.track('data-convert-swap', { from: this.from(), to: this.to() });
  }

  protected setOption<K extends keyof DataOptions>(key: K, value: DataOptions[K]): void {
    this.options.update((options) => ({ ...options, [key]: value }));
  }

  protected loadSample(): void {
    this.setText(SAMPLES[this.from()]);
    this.analytics.track('data-convert-sample', { from: this.from(), to: this.to() });
  }

  protected async onFileChosen(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
    if (!file) return;
    if (file.size > LIMITS.MAX_JSON_BYTES) {
      this.analytics.limitHit('data-converter', 'file-size');
      this.problem.set(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_JSON_BYTES)}.`);
      return;
    }
    // Pick the From format from the file extension.
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    const guessed = ({ json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', csv: 'csv', tsv: 'csv' } as const)[
      extension as 'json'
    ];
    if (guessed && guessed !== this.from()) this.setFrom(guessed);
    try {
      this.setText(await file.text());
      this.analytics.track('data-convert-upload', { from: this.from(), size: sizeBucket(file.size) });
    } catch {
      this.problem.set(`${file.name} could not be read. Try another file.`);
    }
  }

  protected clear(): void {
    this.setText('');
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.output());
    this.copyState.set(ok ? 'copied' : 'failed');
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), COPIED_MS);
    this.analytics.track('data-convert-copy', { from: this.from(), to: this.to() });
  }

  protected download(): void {
    downloadText(this.output(), this.fileName());
    this.analytics.track('data-convert-download', { from: this.from(), to: this.to() });
  }

  protected goToError(): void {
    const error = this.error();
    if (error) this.inputEditor().revealError(error.line, error.column);
  }

  private setText(text: string): void {
    clearTimeout(this.timer);
    this.problem.set(null);
    this.input.set(text);
    this.settled.set(text);
  }

  private syncUrl(): void {
    void this.router.navigate([], { queryParams: { from: this.from(), to: this.to() }, replaceUrl: true });
  }
}
