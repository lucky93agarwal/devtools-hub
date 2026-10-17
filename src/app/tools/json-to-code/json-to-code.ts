import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Analytics, sizeBucket } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { copyText, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { JsonError, findJsonError } from '../json-formatter/json-tools';
import { JSON_TO_CODE_CONTENT, SAMPLE_JSON } from './content';
import { inferModel } from './infer';
import { noLeadingDigit, pascalCase } from './names';
import { OptionValues, TARGET_GROUPS, Target, optionsFor, targetById } from './targets';

type Result =
  | { kind: 'empty' }
  | { kind: 'error'; error: JsonError }
  | { kind: 'problem'; message: string }
  | { kind: 'ok'; code: string; classes: number };

/** Typing pause before the code is generated again, in ms. */
const DEBOUNCE_MS = 250;
const COPIED_MS = 2000;

@Component({
  selector: 'app-json-to-code',
  imports: [Icon, CodeEditor, ToolInfoSection, RouterLink],
  templateUrl: './json-to-code.html',
})
export class JsonToCode {
  protected readonly tool = TOOLS.find((t) => t.path === 'json-to-code')!;
  protected readonly content = JSON_TO_CODE_CONTENT;
  protected readonly icons = ICONS;
  protected readonly groups = TARGET_GROUPS;
  protected readonly accept = '.json,application/json,text/plain';

  protected readonly input = signal('');
  /** The input as of the last typing pause; the code follows this one. */
  private readonly settled = signal('');
  protected readonly target = signal<Target>(targetById('kotlin-serialization'));
  protected readonly options = signal<OptionValues>(optionsFor(this.target()));
  protected readonly rootName = signal('Root');
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly problem = signal<string | null>(null);

  protected readonly result = computed<Result>(() => {
    const text = this.settled();
    if (!text.trim()) return { kind: 'empty' };
    try {
      JSON.parse(text);
    } catch {
      const error = findJsonError(text);
      if (error) return { kind: 'error', error };
      return { kind: 'problem', message: 'This is not valid JSON.' };
    }
    const inferred = inferModel(text, this.className());
    if (!inferred.ok) return { kind: 'problem', message: inferred.message };
    const code = this.target().language.generate(inferred.model, this.options());
    return { kind: 'ok', code, classes: inferred.model.classes.length };
  });
  protected readonly code = computed(() => {
    const result = this.result();
    return result.kind === 'ok' ? result.code : '';
  });
  protected readonly error = computed(() => {
    const result = this.result();
    return result.kind === 'error' ? result.error : null;
  });
  /** The root name as a valid class name, whatever was typed. */
  protected readonly className = computed(() => noLeadingDigit(pascalCase(this.rootName()), 'C'));

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly router = inject(Router);
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?to=typescript-interface opens the page with that output chosen.
    const requested = inject(ActivatedRoute).snapshot.queryParamMap.get('to');
    if (requested) this.chooseTarget(requested, false);

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
    this.timer = setTimeout(() => this.settle(), DEBOUNCE_MS);
  }

  /** Picks an entry of the "Convert to" list, with its starting settings. */
  protected chooseTarget(id: string, updateUrl = true): void {
    const target = targetById(id);
    this.target.set(target);
    this.options.set(optionsFor(target));
    if (updateUrl) {
      void this.router.navigate([], { queryParams: { to: target.id }, replaceUrl: true });
      this.analytics.track('json-to-code-target', { target: target.id });
    }
  }

  protected setOption(id: string, value: string | boolean): void {
    this.options.update((options) => ({ ...options, [id]: value }));
  }

  protected loadSample(): void {
    this.setText(SAMPLE_JSON);
    this.analytics.track('json-to-code-sample', { target: this.target().id });
  }

  protected async onFileChosen(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
    if (!file) return;
    if (file.size > LIMITS.MAX_JSON_BYTES) {
      this.problem.set(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_JSON_BYTES)}.`);
      return;
    }
    try {
      this.setText(await file.text());
      this.analytics.track('json-to-code-upload', { size: sizeBucket(file.size) });
    } catch {
      this.problem.set(`${file.name} could not be read. Try another file.`);
    }
  }

  protected clear(): void {
    this.setText('');
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.code());
    this.copyState.set(ok ? 'copied' : 'failed');
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), COPIED_MS);
    this.analytics.track('json-to-code-copy', { target: this.target().id });
  }

  protected download(): void {
    downloadText(this.code(), `${this.className()}.${this.target().language.extension}`);
    this.analytics.track('json-to-code-download', { target: this.target().id });
  }

  protected goToError(): void {
    const error = this.error();
    if (error) this.inputEditor().revealError(error.line, error.column);
  }

  /** Settings shown for the chosen language, with their current values. */
  protected readonly settings = computed(() =>
    this.target().language.settings.map((setting) => ({ ...setting, value: this.options()[setting.id] })),
  );

  protected asBoolean(value: string | boolean | undefined): boolean {
    return value === true;
  }

  private setText(text: string): void {
    clearTimeout(this.timer);
    this.problem.set(null);
    this.input.set(text);
    this.settle();
  }

  private settle(): void {
    this.settled.set(this.input());
  }
}
