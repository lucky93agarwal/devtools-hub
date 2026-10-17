import {
  AfterRenderRef,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
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
import { MonacoApi, loadMonaco, whenUserActive } from './monaco-loader';

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
      (pointerdown)="onPointerDown()"
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
  private pendingError?: AfterRenderRef;
  private queuedError?: { line: number; column: number; message: string };
  private readonly injector = inject(Injector);
  private destroyed = false;
  /** The user clicked the preview before Monaco loaded, so move the cursor in once it is ready. */
  protected focusWhenReady = false;

  /**
   * A method rather than an inline assignment: a template handler that returns false
   * makes Angular cancel the event, and a cancelled pointerdown never reaches Monaco
   * as mousedown, so clicks on the loaded editor would do nothing.
   */
  protected onPointerDown(): void {
    this.focusWhenReady = !this.ready();
  }

  constructor() {
    afterNextRender(() => void this.init());

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.flashTimer);
      this.pendingError?.destroy();
      this.editor?.dispose();
      this.textModel?.dispose();
    });

    // Keep Monaco in sync when the parent changes the text (for example Clear).
    effect(() => {
      this.value();
      if (this.ready()) this.syncText();
    });

    // The JSON to Code tool switches the output language without a new editor.
    effect(() => {
      const language = this.language();
      if (this.ready() && this.textModel) this.monaco?.editor.setModelLanguage(this.textModel, language);
    });

    effect(() => {
      const name = this.theme.theme() === 'dark' ? 'dth-dark' : 'dth-light';
      if (this.ready()) this.monaco?.editor.setTheme(name);
    });
  }

  /**
   * Marks an error: red squiggle under the character and a tinted line.
   * Applied after the next render, because a value the parent just set reaches
   * this component on the next change detection, and the mark must land on that text.
   */
  showError(line: number, column: number, message: string): void {
    this.pendingError?.destroy();
    this.pendingError = afterNextRender(
      () => {
        this.pendingError = undefined;
        this.applyError(line, column, message);
      },
      { injector: this.injector },
    );
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
    this.pendingError?.destroy();
    this.pendingError = undefined;
    this.queuedError = undefined;
    if (!this.monaco || !this.textModel) return;
    this.monaco.editor.setModelMarkers(this.textModel, 'app', []);
    this.errorDecorations?.clear();
    this.flashDecorations?.clear();
  }

  private applyError(line: number, column: number, message: string): void {
    if (!this.monaco || !this.textModel) {
      // Monaco is still loading; mark the error once it is ready.
      this.queuedError = { line, column, message };
      return;
    }
    this.syncText();
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

  private syncText(): void {
    if (this.textModel && this.textModel.getValue() !== this.value()) {
      this.textModel.setValue(this.value());
    }
  }

  private errorRange(line: number, column: number) {
    return { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + 1 };
  }

  private async init(): Promise<void> {
    await whenUserActive();
    if (this.destroyed) return;
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
    if (this.focusWhenReady && !this.readOnly()) this.editor.focus();

    if (this.queuedError) {
      const { line, column, message } = this.queuedError;
      this.queuedError = undefined;
      this.applyError(line, column, message);
    }
  }
}
