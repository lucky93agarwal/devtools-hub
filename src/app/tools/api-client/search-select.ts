import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

export interface SelectOption {
  id: string;
  label: string;
}

/**
 * A dropdown with a search box and a list of fixed height, for long lists such as
 * the code languages: type to filter, arrow keys to move, Enter to pick, Escape to close.
 */
@Component({
  selector: 'app-search-select',
  host: { '(document:click)': 'closeOutside($event)' },
  template: `
    <div class="relative">
      <button
        #trigger
        type="button"
        class="flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-1.5 text-sm font-semibold"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="label() + ': ' + current()"
        (click)="toggle()"
      >
        {{ current() }}
        <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" /></svg>
      </button>
      @if (open()) {
        <div class="absolute top-full right-0 z-30 mt-1 flex w-64 flex-col rounded-xl border border-line bg-page p-1 shadow-lg">
          <input
            #search
            type="text"
            class="m-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand"
            placeholder="Search"
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="search-select-list"
            [attr.aria-label]="'Search ' + label()"
            [attr.aria-activedescendant]="filtered()[active()] ? 'opt-' + filtered()[active()].id : null"
            [value]="query()"
            (input)="query.set($any($event.target).value); active.set(0)"
            (keydown)="onKeydown($event)"
          />
          <ul id="search-select-list" class="max-h-72 overflow-auto" role="listbox" [attr.aria-label]="label()">
            @for (option of filtered(); track option.id; let i = $index) {
              <li
                [id]="'opt-' + option.id"
                role="option"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                [class.bg-surface]="i === active()"
                [attr.aria-selected]="option.id === value()"
                (mouseenter)="active.set(i)"
                (click)="pick(option.id)"
              >
                <span class="w-4 text-brand" aria-hidden="true">{{ option.id === value() ? '✓' : '' }}</span>
                {{ option.label }}
              </li>
            } @empty {
              <li class="px-3 py-2 text-sm text-muted">No match</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SearchSelect {
  readonly options = input.required<SelectOption[]>();
  readonly value = input.required<string>();
  /** What the list is, for screen readers, such as "Code language". */
  readonly label = input('Choose');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly current = computed(() => this.options().find((o) => o.id === this.value())?.label ?? '');
  protected readonly filtered = computed(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    return this.options().filter((o) => words.every((w) => o.label.toLowerCase().includes(w)));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.query.set('');
    this.active.set(Math.max(0, this.options().findIndex((o) => o.id === this.value())));
    this.open.set(true);
    // Focus the search box and show the chosen option once the list is drawn.
    setTimeout(() => {
      this.search()?.nativeElement.focus();
      this.scrollToActive();
    });
  }

  protected pick(id: string): void {
    this.valueChange.emit(id);
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!count) return;
      this.active.update((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
      this.scrollToActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.filtered()[this.active()];
      if (option) this.pick(option.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      this.trigger().nativeElement.focus();
    }
  }

  protected closeOutside(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private close(): void {
    this.open.set(false);
  }

  private scrollToActive(): void {
    setTimeout(() => {
      const option = this.filtered()[this.active()];
      if (option) this.host.nativeElement.querySelector(`#opt-${CSS.escape(option.id)}`)?.scrollIntoView?.({ block: 'nearest' });
    });
  }
}
