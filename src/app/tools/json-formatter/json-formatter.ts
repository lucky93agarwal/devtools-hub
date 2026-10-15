import { Component, computed, signal, viewChild } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ICONS, Icon } from '../../shared/icon/icon';
import { JsonError, JsonResult, formatJson, minifyJson } from './json-tools';

type Status = { kind: 'empty' } | { kind: 'ready' } | { kind: 'valid'; action: string } | { kind: 'error'; error: JsonError };

@Component({
  selector: 'app-json-formatter',
  imports: [Icon, CodeEditor],
  templateUrl: './json-formatter.html',
})
export class JsonFormatter {
  protected readonly tool = TOOLS.find((t) => t.path === 'json-formatter')!;
  protected readonly icons = ICONS;

  protected readonly input = signal('');
  protected readonly output = signal('');
  protected readonly status = signal<Status>({ kind: 'empty' });

  protected readonly error = computed(() => {
    const status = this.status();
    return status.kind === 'error' ? status.error : null;
  });
  protected readonly action = computed(() => {
    const status = this.status();
    return status.kind === 'valid' ? status.action : '';
  });
  protected readonly outputLines = computed(() => (this.output() ? this.output().split('\n').length : 0));

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.input.set(value);
    this.status.set(value.trim() ? { kind: 'ready' } : { kind: 'empty' });
    // The old error position no longer matches the edited text.
    this.inputEditor().clearError();
  }

  protected format(): void {
    this.apply(formatJson(this.input(), 2), 'Formatted');
  }

  protected minify(): void {
    this.apply(minifyJson(this.input()), 'Minified');
  }

  protected clear(): void {
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

  private apply(result: JsonResult, action: string): void {
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
