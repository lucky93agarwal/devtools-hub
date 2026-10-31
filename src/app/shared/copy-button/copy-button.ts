import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { copyText } from '../file-utils';
import { ICONS, Icon } from '../icon/icon';

const COPIED_MS = 2000;

/** Small Copy button that says "Copied" for a moment after a click. */
@Component({
  selector: 'app-copy-button',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="btn-small"
      [disabled]="!text()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="copy()"
    >
      <app-icon [path]="state() === 'copied' ? icons.check : icons.copy" [size]="16" />
      {{ state() === 'copied' ? 'Copied' : state() === 'failed' ? 'Copy failed' : label() }}
    </button>
  `,
})
export class CopyButton {
  /** What is copied. The button is disabled while this is empty. */
  readonly text = input('');
  readonly label = input('Copy');
  /** Name for screen readers when several Copy buttons share a page, e.g. "Copy SHA-256". */
  readonly ariaLabel = input('');

  protected readonly icons = ICONS;
  protected readonly state = signal<'idle' | 'copied' | 'failed'>('idle');
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.text());
    this.state.set(ok ? 'copied' : 'failed');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.state.set('idle'), COPIED_MS);
  }
}
