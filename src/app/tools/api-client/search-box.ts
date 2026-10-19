import { Component, ElementRef, afterNextRender, input, model, output, viewChild } from '@angular/core';

/** Counts matches of the query in the text, ignoring case, as the editor's search does. */
export function countMatches(text: string, query: string): number {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

/**
 * The search field for a response: type to find, Enter or the arrows for the
 * next and previous match, and "3 of 12" to say where you are.
 */
@Component({
  selector: 'app-search-box',
  template: `
    <div class="flex min-w-0 items-center gap-1 rounded-full border border-line bg-page py-0.5 pr-1 pl-3 focus-within:border-brand">
      <svg viewBox="0 0 24 24" class="size-4 shrink-0 text-muted" aria-hidden="true">
        <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <input
        #field
        type="text"
        role="searchbox"
        class="w-full min-w-0 bg-transparent py-1 text-sm outline-none"
        autocomplete="off"
        spellcheck="false"
        [placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault(); step.emit($any($event).shiftKey ? -1 : 1)"
        (keydown.escape)="closed.emit()"
      />
      @if (query()) {
        <span class="shrink-0 px-1 text-xs whitespace-nowrap text-muted" aria-live="polite">
          {{ !total() ? 'No results' : stepper() ? current() + 1 + ' of ' + total() : total() + ' found' }}
        </span>
        @if (stepper()) {
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
            aria-label="Previous match"
            [disabled]="!total()"
            (click)="step.emit(-1)"
          >
            <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" /></svg>
          </button>
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
            aria-label="Next match"
            [disabled]="!total()"
            (click)="step.emit(1)"
          >
            <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" /></svg>
          </button>
        }
        <button
          type="button"
          class="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
          aria-label="Clear search"
          (click)="query.set('')"
        >
          &times;
        </button>
      }
    </div>
  `,
})
export class SearchBox {
  readonly query = model('');
  readonly total = input(0);
  /** The match shown now, counted from 0. */
  readonly current = input(0);
  readonly label = input('Search response');
  readonly placeholder = input('Search');
  /** Show the previous and next arrows; off when matches are filtered instead of stepped through. */
  readonly stepper = input(true);
  readonly step = output<1 | -1>();
  /** Escape in the field. */
  readonly closed = output<void>();
  /** Put the cursor in the field when it appears. */
  readonly autofocus = input(false);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.field().nativeElement.focus();
    });
  }
}
