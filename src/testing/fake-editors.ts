import { Component, input, model, output } from '@angular/core';
import { DiffStats } from '../app/shared/code-editor/diff-viewer';

/** Monaco cannot run in jsdom, so tests use a textarea with the CodeEditor API. */
@Component({
  selector: 'app-code-editor',
  template: `<textarea [value]="value()" [readOnly]="readOnly()" (input)="onInput($event)"></textarea>`,
})
export class FakeCodeEditor {
  readonly value = model('');
  readonly language = input('');
  readonly readOnly = input(false);
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly invalid = input(false);
  readonly showError = vi.fn();
  readonly revealError = vi.fn();
  readonly clearError = vi.fn();
  readonly search = vi.fn();

  onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}

/** Stand-in for DiffViewer that shows both texts and lets a test emit stats. */
@Component({
  selector: 'app-diff-viewer',
  template: `<pre class="original">{{ original() }}</pre>
    <pre class="modified">{{ modified() }}</pre>`,
})
export class FakeDiffViewer {
  readonly original = input('');
  readonly modified = input('');
  readonly language = input('');
  readonly originalLabel = input('');
  readonly modifiedLabel = input('');
  readonly onlyChanges = input(false);
  readonly diffUpdated = output<DiffStats>();
}
