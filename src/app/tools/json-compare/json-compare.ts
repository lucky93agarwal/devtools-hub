import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { DiffStats, DiffViewer } from '../../shared/code-editor/diff-viewer';
import { ICONS, Icon } from '../../shared/icon/icon';
import { JsonRunner } from '../json-formatter/json-runner';
import { JsonError } from '../json-formatter/json-tools';
import { COMPARE_SAMPLES, describeStats } from './compare-tools';

type Side = 'original' | 'changed';

type Status =
  | { kind: 'empty' }
  | { kind: 'ready' }
  | { kind: 'working' }
  | { kind: 'invalid'; errors: { side: Side; error: JsonError }[] }
  | { kind: 'compared'; identical: boolean };

@Component({
  selector: 'app-json-compare',
  imports: [Icon, CodeEditor, DiffViewer],
  templateUrl: './json-compare.html',
})
export class JsonCompare {
  protected readonly tool = TOOLS.find((t) => t.path === 'json-compare')!;
  protected readonly icons = ICONS;
  protected readonly sideLabels: Record<Side, string> = { original: 'Original', changed: 'Changed' };

  protected readonly original = signal('');
  protected readonly changed = signal('');
  protected readonly status = signal<Status>({ kind: 'empty' });
  /** Formatted texts shown in the diff, set by the last successful comparison. */
  protected readonly result = signal<{ original: string; changed: string } | null>(null);
  protected readonly stats = signal<DiffStats | null>(null);
  /** Sort keys on both sides before comparing, so only values and structure count. */
  protected readonly ignoreKeyOrder = signal(false);
  /** Collapse unchanged lines in the diff. */
  protected readonly onlyDifferences = signal(false);

  protected readonly working = computed(() => this.status().kind === 'working');
  protected readonly errors = computed(() => {
    const status = this.status();
    return status.kind === 'invalid' ? status.errors : [];
  });
  protected readonly summary = computed(() => {
    const status = this.status();
    if (status.kind !== 'compared') return '';
    if (status.identical) {
      return this.ignoreKeyOrder()
        ? 'No differences when key order is ignored. Both JSON documents have the same content.'
        : 'No differences. Both JSON documents have the same content.';
    }
    const stats = this.stats();
    return stats ? `Differences found in ${describeStats(stats)}.` : 'Differences found.';
  });

  private readonly runner = inject(JsonRunner);
  private readonly originalEditor = viewChild.required<CodeEditor>('originalEditor');
  private readonly changedEditor = viewChild.required<CodeEditor>('changedEditor');
  /** Increases with every change, so a slow result for older text is ignored. */
  private jobId = 0;

  protected onInput(side: Side, value: string): void {
    const target = side === 'original' ? this.original : this.changed;
    if (value === target()) return;
    target.set(value);
    this.inputsChanged();
    this.editor(side).clearError();
  }

  protected async compare(): Promise<void> {
    const id = ++this.jobId;
    this.status.set({ kind: 'working' });
    const [original, changed] = await Promise.all([
      this.runner.run({ op: 'format', text: this.original(), indent: 2, sortKeys: this.ignoreKeyOrder() }),
      this.runner.run({ op: 'format', text: this.changed(), indent: 2, sortKeys: this.ignoreKeyOrder() }),
    ]);
    if (id !== this.jobId) return;

    const errors: { side: Side; error: JsonError }[] = [];
    for (const [side, result] of [
      ['original', original],
      ['changed', changed],
    ] as const) {
      if (result.ok) {
        this.editor(side).clearError();
      } else {
        errors.push({ side, error: result.error });
        this.editor(side).showError(result.error.line, result.error.column, result.error.message);
      }
    }
    if (!original.ok || !changed.ok) {
      this.result.set(null);
      this.status.set({ kind: 'invalid', errors });
      return;
    }

    this.stats.set(null);
    this.result.set({ original: original.output, changed: changed.output });
    this.status.set({ kind: 'compared', identical: original.output === changed.output });
  }

  /** Changing the key order option compares again if a result is showing. */
  protected setIgnoreKeyOrder(value: boolean): void {
    this.ignoreKeyOrder.set(value);
    if (this.status().kind === 'compared') void this.compare();
  }

  protected onDiffUpdated(stats: DiffStats): void {
    this.stats.set(stats);
  }

  protected swap(): void {
    const original = this.original();
    this.original.set(this.changed());
    this.changed.set(original);
    this.originalEditor().clearError();
    this.changedEditor().clearError();
    if (this.status().kind === 'compared') void this.compare();
    else this.inputsChanged();
  }

  protected loadSample(): void {
    this.original.set(COMPARE_SAMPLES.original);
    this.changed.set(COMPARE_SAMPLES.changed);
    this.originalEditor().clearError();
    this.changedEditor().clearError();
    void this.compare();
  }

  protected clear(): void {
    this.original.set('');
    this.changed.set('');
    this.originalEditor().clearError();
    this.changedEditor().clearError();
    this.inputsChanged();
  }

  protected hasError(side: Side): boolean {
    return this.errors().some((item) => item.side === side);
  }

  protected goToError(side: Side, error: JsonError): void {
    this.editor(side).revealError(error.line, error.column);
  }

  /** Any edit makes the last comparison out of date. */
  private inputsChanged(): void {
    this.jobId++;
    this.result.set(null);
    this.stats.set(null);
    const hasText = this.original().trim() !== '' || this.changed().trim() !== '';
    this.status.set(hasText ? { kind: 'ready' } : { kind: 'empty' });
  }

  private editor(side: Side): CodeEditor {
    return side === 'original' ? this.originalEditor() : this.changedEditor();
  }
}
