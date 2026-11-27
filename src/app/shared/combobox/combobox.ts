import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

let nextId = 0;

/**
 * A text box with a searchable list of saved choices. Typing filters the list; a value that is not
 * in it can be added ("+ Add …"), and is reported through (created) so the caller can save it.
 * Keyboard: ↓/↑ move, Enter picks, Esc closes, Tab on an empty box accepts the placeholder.
 */
@Component({
  selector: 'app-combobox',
  host: { class: 'relative block' },
  template: `
    <input
      #box
      class="field w-full"
      role="combobox"
      autocomplete="off"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open() && active() >= 0 ? listId + '-' + active() : null"
      [placeholder]="placeholder()"
      [value]="value()"
      (input)="typed($any($event.target).value)"
      (focus)="open.set(true)"
      (blur)="commit()"
      (keydown)="key($event)"
    />
    @if (open() && choices().length) {
      <ul [id]="listId" role="listbox" [attr.aria-label]="label() + ' choices'" class="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-page p-1 text-sm shadow-lg">
        @for (c of choices(); track c.value; let i = $index) {
          <li
            [id]="listId + '-' + i"
            role="option"
            [attr.aria-selected]="i === active()"
            class="cursor-pointer rounded-lg px-3 py-1.5"
            [class.bg-surface]="i === active()"
            (mousedown)="$event.preventDefault(); pick(c.value)"
            (mouseenter)="active.set(i)"
          >
            @if (c.create) { <span class="font-semibold text-brand">+ Add "{{ c.value }}"</span> } @else { {{ c.value }} }
          </li>
        }
      </ul>
    }
  `,
})
export class Combobox {
  readonly value = input('');
  readonly options = input<readonly string[]>([]);
  readonly placeholder = input('');
  readonly label = input('');
  readonly valueChange = output<string>();
  /** A new value the user added; save it for next time. */
  readonly created = output<string>();

  protected readonly listId = `combo-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  private readonly query = signal<string | null>(null);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly choices = computed(() => {
    const q = (this.query() ?? '').trim().toLowerCase();
    const list = this.options().filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 12);
    const typed = (this.query() ?? '').trim();
    const exists = this.options().some((o) => o.toLowerCase() === typed.toLowerCase());
    return [...list.map((value) => ({ value, create: false })), ...(typed && !exists ? [{ value: typed, create: true }] : [])];
  });

  protected typed(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    this.valueChange.emit(value);
  }

  protected pick(value: string): void {
    this.box().nativeElement.value = value;
    this.valueChange.emit(value);
    this.remember(value);
    this.query.set(null);
    this.open.set(false);
  }

  protected commit(): void {
    const value = this.box().nativeElement.value.trim();
    this.open.set(false);
    this.query.set(null);
    if (value) this.remember(value);
  }

  private remember(value: string): void {
    const v = value.trim();
    if (v && !this.options().some((o) => o.toLowerCase() === v.toLowerCase())) this.created.emit(v);
  }

  protected key(event: KeyboardEvent): void {
    const list = this.choices();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        this.active.set(Math.min(list.length - 1, this.active() + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(Math.max(0, this.active() - 1));
        break;
      case 'Enter':
        if (this.open() && this.active() >= 0 && list[this.active()]) {
          event.preventDefault();
          this.pick(list[this.active()].value);
        }
        break;
      case 'Escape':
        this.open.set(false);
        break;
      case 'Tab': {
        const box = this.box().nativeElement;
        if (!box.value && this.placeholder() && !event.shiftKey) {
          box.value = this.placeholder();
          this.valueChange.emit(box.value);
        }
        break;
      }
    }
  }
}
