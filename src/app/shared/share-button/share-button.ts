import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { MAX_LINK_LENGTH, SharedData, shareUrl } from '../../core/shared-input';
import { copyText } from '../file-utils';
import { ICONS, Icon } from '../icon/icon';

const COPIED_MS = 2500;

/**
 * Copies a link that opens this tool with the same input. The data sits after #, so it is never sent
 * to a server, but anyone with the link can read it.
 */
@Component({
  selector: 'app-share-button',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="btn-small"
      [disabled]="!data() || tooLong()"
      [title]="tooLong() ? 'Too much data for a link. Copy the text instead.' : 'Copy a link that opens this tool with the same input. Anyone with the link can see the data.'"
      (click)="copy()"
    >
      <app-icon [path]="state() === 'copied' ? icons.check : icons.link" [size]="16" />
      {{ state() === 'copied' ? 'Link copied' : state() === 'failed' ? 'Copy failed' : 'Share link' }}
    </button>
  `,
})
export class ShareButton {
  /** What the link carries, or null while there is nothing to share. */
  readonly data = input<SharedData | null>(null);
  /** The tool's path, such as "base64". */
  readonly path = input.required<string>();

  protected readonly icons = ICONS;
  protected readonly state = signal<'idle' | 'copied' | 'failed'>('idle');
  private readonly url = computed(() => {
    const data = this.data();
    return data && typeof location !== 'undefined' ? shareUrl(location.origin, this.path(), data) : '';
  });
  protected readonly tooLong = computed(() => this.url().length > MAX_LINK_LENGTH);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.url());
    this.state.set(ok ? 'copied' : 'failed');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.state.set('idle'), COPIED_MS);
  }
}
