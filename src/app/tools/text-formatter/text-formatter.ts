import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Analytics, sizeBucket } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { baseName, copyText, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { TEXT_CONTENT, TEXT_SAMPLES, TextFormat } from './content';
import { formatXml, minifyXml } from './xml-format';
import { YamlIssue, formatYaml } from './yaml-format';

type Result =
  | { kind: 'empty' }
  | { kind: 'error'; error: YamlIssue }
  | { kind: 'ok'; output: string; documents: number; warnings: YamlIssue[] };

const DEBOUNCE_MS = 250;
const COPIED_MS = 2000;

/** The XML Formatter and the YAML Validator: the same page, with the format taken from the address. */
@Component({
  selector: 'app-text-formatter',
  imports: [Icon, CodeEditor, ToolInfoSection],
  templateUrl: './text-formatter.html',
})
export class TextFormatter {
  protected readonly format: TextFormat =
    inject(ActivatedRoute).snapshot.routeConfig?.path === 'yaml-validator' ? 'yaml' : 'xml';
  protected readonly tool = TOOLS.find((t) => t.path === (this.format === 'yaml' ? 'yaml-validator' : 'xml-formatter'))!;
  protected readonly content = TEXT_CONTENT[this.format];
  protected readonly icons = ICONS;
  protected readonly label = this.format === 'yaml' ? 'YAML' : 'XML';
  protected readonly accept =
    this.format === 'yaml' ? '.yaml,.yml,application/yaml,text/yaml,text/plain' : '.xml,.svg,.xsd,.plist,application/xml,text/xml';
  protected readonly indents = this.format === 'yaml' ? [2, 4] : [2, 4, 'tab'];

  protected readonly input = signal('');
  private readonly settled = signal('');
  protected readonly indent = signal<number | string>(2);
  /** XML only: readable or smallest. */
  protected readonly minified = signal(false);
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly problem = signal<string | null>(null);
  private fileName: string | null = null;

  protected readonly result = computed<Result>(() => {
    const text = this.settled();
    if (!text.trim()) return { kind: 'empty' };
    const indent = this.indent();
    if (this.format === 'yaml') {
      const yaml = formatYaml(text, Number(indent));
      return yaml.ok ? { kind: 'ok', ...yaml } : { kind: 'error', error: yaml.error };
    }
    const xml = this.minified() ? minifyXml(text) : formatXml(text, indent === 'tab' ? '\t' : ' '.repeat(Number(indent)));
    return xml.ok ? { kind: 'ok', output: xml.output, documents: 1, warnings: [] } : { kind: 'error', error: xml.error };
  });
  protected readonly output = computed(() => {
    const result = this.result();
    return result.kind === 'ok' ? result.output : '';
  });
  protected readonly error = computed(() => {
    const result = this.result();
    return result.kind === 'error' ? result.error : null;
  });
  protected readonly ok = computed(() => {
    const result = this.result();
    return result.kind === 'ok' ? result : null;
  });

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
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

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.input.set(value);
    this.problem.set(null);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set(this.input()), DEBOUNCE_MS);
  }

  protected setIndent(value: string): void {
    this.indent.set(value === 'tab' ? 'tab' : Number(value));
  }

  protected loadSample(kind: 'valid' | 'broken'): void {
    this.fileName = null;
    this.setText(TEXT_SAMPLES[this.format][kind]);
    this.analytics.track(`${this.format}-sample`, { kind });
  }

  protected async onFileChosen(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
    if (!file) return;
    if (file.size > LIMITS.MAX_JSON_BYTES) {
      this.analytics.limitHit(this.tool.path, 'file-size');
      this.problem.set(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_JSON_BYTES)}.`);
      return;
    }
    try {
      this.fileName = file.name;
      this.setText(await file.text());
      this.analytics.track(`${this.format}-upload`, { size: sizeBucket(file.size) });
    } catch {
      this.problem.set(`${file.name} could not be read. Try another file.`);
    }
  }

  protected clear(): void {
    this.fileName = null;
    this.setText('');
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.output());
    this.copyState.set(ok ? 'copied' : 'failed');
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), COPIED_MS);
  }

  protected download(): void {
    const base = this.fileName ? baseName(this.fileName) : 'data';
    const extension = this.fileName?.split('.').pop()?.toLowerCase() ?? this.format;
    downloadText(this.output(), `${base}.${this.minified() ? 'min.' : 'formatted.'}${extension}`);
    this.analytics.track(`${this.format}-download`, {});
  }

  /** Puts the cursor on an error or warning and flashes the line. */
  protected goTo(issue: YamlIssue): void {
    this.inputEditor().revealError(issue.line, issue.column);
  }

  private setText(text: string): void {
    clearTimeout(this.timer);
    this.problem.set(null);
    this.input.set(text);
    this.settled.set(text);
  }
}
