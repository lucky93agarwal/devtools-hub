import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MAX_LINK_LENGTH, SharedData, restoreShared, shareUrl } from '../../core/shared-input';
import { HistoryEntry, ToolHistory } from '../../core/tool-history';
import { copyText } from '../file-utils';
import { ICONS, Icon } from '../icon/icon';

const COPIED_MS = 2500;
/** An input is remembered once it has stayed the same this long, not on every keystroke. */
const REMEMBER_AFTER_MS = 1500;

/** "5 min ago", "yesterday" or a date. */
export function ago(at: number, now = Date.now()): string {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Share link and History for a tool's input. Share copies a link with the input after #, which is never sent to a
 * server. History keeps the last inputs and the ones saved by name in this browser, and puts one back with a click.
 */
@Component({
  selector: 'app-share-button',
  imports: [Icon, RouterLink],
  host: { class: 'relative inline-flex gap-2', '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'open.set(false)' },
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
    <button type="button" class="btn-small" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <app-icon [path]="icons.clock" [size]="16" />
      History
    </button>
    @if (open()) {
      <div class="absolute top-full right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-page p-3 text-sm shadow-xl" role="dialog" aria-label="History and saved inputs">
        <form class="flex gap-2" (submit)="$event.preventDefault(); saveCurrent()">
          <input class="field min-w-0 flex-1 py-1.5" aria-label="Name for this input" placeholder="Name this input" [value]="name()" (input)="name.set($any($event.target).value)" />
          <button type="submit" class="btn-small" [disabled]="!data()">Save</button>
        </form>
        @if (justSaved()) {
          <p class="mt-1 text-xs text-success">Saved. Find it here or under Your saved data.</p>
        }
        @if (saved().length) {
          <p class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Saved</p>
          <ul class="mt-1 flex flex-col gap-0.5">
            @for (s of saved(); track s.id) {
              <li class="flex items-center gap-1">
                <button type="button" class="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface" (click)="restore(s)">
                  <span class="block truncate font-semibold">{{ s.name }}</span>
                  <span class="block truncate text-xs text-muted">{{ s.preview }}</span>
                </button>
                <button type="button" class="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" [attr.aria-label]="'Delete ' + s.name" (click)="history.remove(s.id)">
                  <app-icon [path]="icons.close" [size]="14" />
                </button>
              </li>
            }
          </ul>
        }
        <div class="mt-3 flex items-center justify-between">
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">Recent</p>
          @if (recent().length) {
            <button type="button" class="text-xs text-muted underline hover:text-ink" (click)="history.clear(path())">Clear</button>
          }
        </div>
        <ul class="mt-1 flex flex-col gap-0.5">
          @for (e of recent(); track e.at) {
            <li>
              <button type="button" class="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface" (click)="restore(e)">
                <span class="block truncate font-mono text-xs">{{ e.preview }}</span>
                <span class="block text-xs text-muted">{{ when(e.at) }}</span>
              </button>
            </li>
          } @empty {
            <li class="px-2 py-2 text-xs text-muted">Your last {{ size }} inputs show here. They stay in this browser.</li>
          }
        </ul>
        <a routerLink="/your-data" class="mt-2 block text-xs text-brand underline" (click)="open.set(false)">All saved data, backup and restore</a>
      </div>
    }
  `,
})
export class ShareButton {
  /** What the link carries, or null while there is nothing to share. */
  readonly data = input<SharedData | null>(null);
  /** The tool's path, such as "base64". */
  readonly path = input.required<string>();

  protected readonly icons = ICONS;
  protected readonly history = inject(ToolHistory);
  protected readonly size = 10;
  protected readonly state = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly open = signal(false);
  protected readonly name = signal('');
  protected readonly justSaved = signal(false);
  protected readonly saved = computed(() => this.history.savedFor(this.path()));
  protected readonly recent = computed(() => this.history.entries(this.path()));
  private readonly url = computed(() => {
    const data = this.data();
    return data && typeof location !== 'undefined' ? shareUrl(location.origin, this.path(), data) : '';
  });
  protected readonly tooLong = computed(() => this.url().length > MAX_LINK_LENGTH);
  private readonly host = inject(ElementRef<HTMLElement>);
  private timer?: ReturnType<typeof setTimeout>;
  private rememberTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const data = this.data();
      const path = this.path();
      clearTimeout(this.rememberTimer);
      if (data) this.rememberTimer = setTimeout(() => this.history.remember(path, data), REMEMBER_AFTER_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      // Keep what was there when the visitor leaves the page.
      clearTimeout(this.rememberTimer);
      const data = this.data();
      if (data) this.history.remember(this.path(), data);
    });
  }

  protected when(at: number): string {
    return ago(at);
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.url());
    this.state.set(ok ? 'copied' : 'failed');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.state.set('idle'), COPIED_MS);
  }

  protected saveCurrent(): void {
    const data = this.data();
    if (!data) return;
    this.history.save(this.path(), this.name(), data);
    this.name.set('');
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), COPIED_MS);
  }

  protected restore(entry: HistoryEntry): void {
    restoreShared(entry.data);
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
