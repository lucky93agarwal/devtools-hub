import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ToolInfo } from '../../core/tools';
import { UserTools } from '../../core/user-tools';
import { ICONS, Icon } from '../icon/icon';
import { searchTools } from './tool-search';

/**
 * Search box for every tool, opened with Ctrl+K (⌘K on a Mac), the / key or the search button in the header.
 * With no search it lists starred and recently used tools first.
 */
@Component({
  selector: 'app-command-palette',
  imports: [Icon],
  host: { '(document:keydown)': 'onGlobalKey($event)' },
  template: `
    <dialog
      #dialog
      class="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-page p-0 text-ink shadow-2xl backdrop:bg-black/40"
      aria-label="Search tools"
      (close)="open.set(false)"
      (click)="onBackdrop($event)"
    >
      <div class="flex items-center gap-3 border-b border-line px-4">
        <app-icon [path]="icons.search" [size]="20" class="text-muted" />
        <input
          #search
          class="min-w-0 flex-1 bg-transparent py-4 text-base outline-none"
          placeholder="Search tools, for example base64 or cron"
          role="combobox"
          aria-label="Search tools"
          aria-controls="palette-results"
          [attr.aria-activedescendant]="results().length ? 'palette-item-' + active() : null"
          aria-expanded="true"
          autocomplete="off"
          spellcheck="false"
          [value]="query()"
          (input)="onQuery($any($event.target).value)"
          (keydown)="onKey($event)"
        />
        <kbd class="hidden rounded border border-line px-1.5 py-0.5 text-xs text-muted sm:inline">Esc</kbd>
      </div>
      <ul id="palette-results" role="listbox" class="max-h-[60vh] overflow-y-auto p-2" aria-label="Tools">
        @for (item of results(); track item.tool.path; let i = $index) {
          @if (item.heading) {
            <li role="presentation" class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ item.heading }}</li>
          }
          <li
            [id]="'palette-item-' + i"
            role="option"
            [attr.aria-selected]="i === active()"
            class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
            [class]="i === active() ? 'bg-surface' : ''"
            (mouseenter)="active.set(i)"
            (click)="go(item.tool)"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-brand"><app-icon [path]="item.tool.icon" [size]="18" /></span>
            <span class="min-w-0">
              <span class="block font-semibold">{{ item.tool.name }}</span>
              <span class="block truncate text-sm text-muted">{{ item.tool.description }}</span>
            </span>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-sm text-muted">No tool matches “{{ query() }}”.</li>
        }
      </ul>
      <p class="hidden border-t border-line px-4 py-2 text-xs text-muted sm:block">↑ ↓ to move, Enter to open, Esc to close</p>
    </dialog>
  `,
})
export class CommandPalette {
  protected readonly icons = ICONS;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  private readonly user = inject(UserTools);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  /** Starred and recent tools first when nothing is typed, each tool once. */
  protected readonly results = computed(() => {
    const query = this.query().trim();
    if (query) return searchTools(query).map((tool) => ({ tool, heading: '' }));
    const favourites = UserTools.tools(this.user.favourites());
    const recent = UserTools.tools(this.user.recent()).filter((t) => !favourites.includes(t));
    const rest = searchTools('').filter((t) => !favourites.includes(t) && !recent.includes(t));
    const label = (list: ToolInfo[], heading: string) => list.map((tool, i) => ({ tool, heading: i === 0 ? heading : '' }));
    return [...label(favourites, 'Starred'), ...label(recent, 'Recently used'), ...label(rest, 'All tools')];
  });

  show(): void {
    if (this.open()) return;
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
    this.dialog().nativeElement.showModal();
    this.search().nativeElement.focus();
  }

  protected onGlobalKey(event: KeyboardEvent): void {
    // Code editors (Monaco) take text through an element that is neither a text box nor contenteditable.
    const typing =
      event.target instanceof Element &&
      !!event.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], .monaco-editor');
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      this.show();
    } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      this.show();
    }
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
      this.scrollActive();
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
      this.scrollActive();
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.go(this.results()[this.active()].tool);
    }
  }

  protected go(tool: ToolInfo): void {
    this.dialog().nativeElement.close();
    void this.router.navigateByUrl('/' + tool.path);
  }

  /** A click on the dimmed area around the box closes it. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close();
  }

  private scrollActive(): void {
    queueMicrotask(() => document.getElementById(`palette-item-${this.active()}`)?.scrollIntoView({ block: 'nearest' }));
  }
}
