import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { ThemeService } from '../../core/theme.service';
import { MonacoApi, loadMonaco, whenUserActive } from './monaco-loader';

/** Line counts of one comparison. */
export interface DiffStats {
  /** Number of separate places that differ. */
  places: number;
  added: number;
  removed: number;
  changed: number;
}

/** Turns Monaco's line changes into added, removed and changed line counts. */
export function countLineChanges(changes: readonly Monaco.editor.ILineChange[]): DiffStats {
  const stats: DiffStats = { places: changes.length, added: 0, removed: 0, changed: 0 };
  for (const change of changes) {
    const removedLines = change.originalEndLineNumber === 0 ? 0 : change.originalEndLineNumber - change.originalStartLineNumber + 1;
    const addedLines = change.modifiedEndLineNumber === 0 ? 0 : change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
    if (removedLines === 0) stats.added += addedLines;
    else if (addedLines === 0) stats.removed += removedLines;
    else stats.changed += Math.max(addedLines, removedLines);
  }
  return stats;
}

/**
 * Read-only side-by-side diff of two texts, built on Monaco's diff editor.
 * On narrow screens Monaco switches to an inline view by itself.
 */
@Component({
  selector: 'app-diff-viewer',
  host: { class: 'block' },
  template: `
    <div class="relative h-full overflow-hidden rounded-xl border border-line bg-surface" [attr.aria-busy]="!ready()">
      <div #container class="absolute inset-0 py-3"></div>
      @if (!ready()) {
        <p class="absolute inset-0 grid place-items-center text-sm text-muted">Loading the comparison…</p>
      }
    </div>
  `,
})
export class DiffViewer {
  readonly original = input('');
  readonly modified = input('');
  readonly language = input('plaintext');
  readonly originalLabel = input('Original');
  readonly modifiedLabel = input('Changed');
  /** Collapse unchanged lines so only the differences and a little context show. */
  readonly onlyChanges = input(false);

  /** Emitted each time Monaco finishes computing the differences. */
  readonly diffUpdated = output<DiffStats>();

  protected readonly ready = signal(false);

  private readonly theme = inject(ThemeService);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private monaco?: MonacoApi;
  private diffEditor?: Monaco.editor.IStandaloneDiffEditor;
  private originalModel?: Monaco.editor.ITextModel;
  private modifiedModel?: Monaco.editor.ITextModel;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.init());

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.diffEditor?.dispose();
      this.originalModel?.dispose();
      this.modifiedModel?.dispose();
    });

    effect(() => {
      const original = this.original();
      const modified = this.modified();
      if (!this.ready()) return;
      if (this.originalModel!.getValue() !== original) this.originalModel!.setValue(original);
      if (this.modifiedModel!.getValue() !== modified) this.modifiedModel!.setValue(modified);
    });

    effect(() => {
      const enabled = this.onlyChanges();
      if (!this.ready() || !this.diffEditor) return;
      this.diffEditor.updateOptions({ hideUnchangedRegions: { enabled } });
      // Monaco works out which regions to collapse when a model is set, so set it again.
      this.diffEditor.setModel({ original: this.originalModel!, modified: this.modifiedModel! });
    });

    effect(() => {
      const name = this.theme.theme() === 'dark' ? 'dth-dark' : 'dth-light';
      if (this.ready()) this.monaco?.editor.setTheme(name);
    });
  }

  private async init(): Promise<void> {
    await whenUserActive();
    if (this.destroyed) return;
    const monaco = await loadMonaco();
    if (this.destroyed) return;

    this.monaco = monaco;
    this.originalModel = monaco.editor.createModel(this.original(), this.language());
    this.modifiedModel = monaco.editor.createModel(this.modified(), this.language());
    this.diffEditor = monaco.editor.createDiffEditor(this.container().nativeElement, {
      theme: this.theme.theme() === 'dark' ? 'dth-dark' : 'dth-light',
      readOnly: true,
      domReadOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      renderSideBySideInlineBreakpoint: 640,
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      renderOverviewRuler: false,
      hideUnchangedRegions: { enabled: this.onlyChanges() },
      originalAriaLabel: this.originalLabel(),
      modifiedAriaLabel: this.modifiedLabel(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 22,
      lineNumbersMinChars: 3,
      folding: false,
      fixedOverflowWidgets: true,
      scrollbar: { alwaysConsumeMouseWheel: false },
    });
    this.diffEditor.setModel({ original: this.originalModel, modified: this.modifiedModel });
    this.diffEditor.onDidUpdateDiff(() => {
      this.diffUpdated.emit(countLineChanges(this.diffEditor?.getLineChanges() ?? []));
    });
    this.ready.set(true);
  }
}
