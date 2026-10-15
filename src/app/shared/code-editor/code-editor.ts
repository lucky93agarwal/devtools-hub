import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { ThemeService } from '../../core/theme.service';
import { MonacoApi, loadMonaco } from './monaco-loader';

/** How long the highlight animation runs after jumping to an error, in ms. */
const FLASH_MS = 1800;

/**
 * Code editor with line numbers, folding and search, built on Monaco.
 * Monaco loads in the browser after the page renders; until then (and during
 * server prerendering) a plain preview of the text is shown.
 */
@Component({
  selector: 'app-code-editor',
  host: { class: 'block' },
  template: `
    <div
      class="relative h-full overflow-hidden rounded-xl border bg-surface"
      [class]="invalid() ? 'border-danger' : 'border-line'"
      [attr.aria-busy]="!ready()"
    >
      <div #container class="absolute inset-0 py-3"></div>
      @if (!ready()) {
        <pre
          class="absolute inset-0 overflow-hidden p-4 font-mono text-sm leading-[22px] whitespace-pre text-muted"
          aria-hidden="true"
          >{{ value() || placeholder() }}</pre
        >
      }
    </div>
  `,
})
export class CodeEditor {
  /** Editor text, two-way bindable with [(value)]. */
  readonly value = model('');
  readonly language = input('plaintext');
  readonly readOnly = input(false);
  readonly placeholder = input('');
  readonly ariaLabel = input('Code editor');
  /** Shows a red border. */
  readonly invalid = input(false);

  protected readonly ready = signal(false);

  private readonly theme = inject(ThemeService);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private monaco?: MonacoApi;
  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private textModel?: Monaco.editor.ITextModel;
  private errorDecorations?: Monaco.editor.IEditorDecorationsCollection;
  private flashDecorations?: Monaco.editor.IEditorDecorationsCollection;
  private flashTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.init());

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.flashTimer);
      this.editor?.dispose();
      this.textModel?.dispose();
    });

    // Keep Monaco in sync when the parent changes the text (for example Clear).
    effect(() => {
      const value = this.value();
      if (this.ready() && this.textModel && this.textModel.getValue() !== value) {
        this.textModel.setValue(value);
      }
    });

    effect(() => {
      const name = this.theme.theme() === 'dark' ? 'dth-dark' : 'dth-light';
      if (this.ready()) this.monaco?.editor.setTheme(name);
    });
  }

  /** Marks an error: red squiggle under the character and a tinted line. */
  showError(line: number, column: number, message: string): void {
    if (!this.monaco || !this.editor || !this.textModel) return;
    const range = this.errorRange(line, column);
    this.monaco.editor.setModelMarkers(this.textModel, 'app', [
      { severity: this.monaco.MarkerSeverity.Error, message, ...range },
    ]);
    this.errorDecorations?.set([
      {
        range,
        options: { isWholeLine: true, className: 'code-error-line', linesDecorationsClassName: 'code-error-gutter' },
      },
    ]);
  }

  /** Scrolls the error line into the middle, puts the cursor there and flashes the line. */
  revealError(line: number, column: number): void {
    if (!this.monaco || !this.editor) return;
    const editor = this.editor;
    editor.revealLineInCenter(line, this.monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();

    // Clear first so a second click restarts the animation.
    clearTimeout(this.flashTimer);
    this.flashDecorations?.clear();
    requestAnimationFrame(() => {
      this.flashDecorations?.set([
        { range: this.errorRange(line, column), options: { isWholeLine: true, className: 'code-error-flash' } },
      ]);
      this.flashTimer = setTimeout(() => this.flashDecorations?.clear(), FLASH_MS);
    });
  }

  clearError(): void {
    if (!this.monaco || !this.textModel) return;
    this.monaco.editor.setModelMarkers(this.textModel, 'app', []);
    this.errorDecorations?.clear();
    this.flashDecorations?.clear();
  }

  private errorRange(line: number, column: number) {
    return { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + 1 };
  }

  private async init(): Promise<void> {
    const monaco = await loadMonaco();
    if (this.destroyed) return;

    this.monaco = monaco;
    this.textModel = monaco.editor.createModel(this.value(), this.language());
    this.editor = monaco.editor.create(this.container().nativeElement, {
      model: this.textModel,
      theme: this.theme.theme() === 'dark' ? 'dth-dark' : 'dth-light',
      readOnly: this.readOnly(),
      domReadOnly: this.readOnly(),
      placeholder: this.placeholder(),
      ariaLabel: this.ariaLabel(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 22,
      lineNumbersMinChars: 3,
      tabSize: 2,
      folding: true,
      renderLineHighlight: this.readOnly() ? 'none' : 'line',
      fixedOverflowWidgets: true,
      overviewRulerLanes: 0,
      scrollbar: { alwaysConsumeMouseWheel: false },
      wordBasedSuggestions: 'off',
      quickSuggestions: false,
      links: false,
      contextmenu: true,
    });
    this.errorDecorations = this.editor.createDecorationsCollection();
    this.flashDecorations = this.editor.createDecorationsCollection();

    this.textModel.onDidChangeContent(() => {
      const text = this.textModel!.getValue();
      if (text !== this.value()) this.value.set(text);
    });
    this.ready.set(true);
  }
}
