import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { KeyValue } from './model';

/** Which optional columns a table shows; shared by every table, like Postman. */
export interface KvColumns {
  value: boolean;
  description: boolean;
}

/**
 * Rows as "key:value" lines, as Postman's Bulk Edit writes them; unticked rows
 * start with "//". Descriptions are kept for keys that are still there.
 */
export function toBulk(rows: KeyValue[]): string {
  return rows.map((row) => `${row.enabled ? '' : '//'}${row.key}:${row.value}`).join('\n');
}

export function fromBulk(text: string, previous: KeyValue[]): KeyValue[] {
  const pool = [...previous];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '//')
    .map((line) => {
      const enabled = !line.startsWith('//');
      const body = enabled ? line : line.slice(2).trimStart();
      const colon = body.indexOf(':');
      const key = (colon >= 0 ? body.slice(0, colon) : body).trim();
      const value = colon >= 0 ? body.slice(colon + 1).trim() : '';
      const index = pool.findIndex((row) => row.key === key);
      const description = index >= 0 ? pool.splice(index, 1)[0].description : undefined;
      return description ? { key, value, enabled, description } : { key, value, enabled };
    });
}

/**
 * Editable key/value rows, as in Postman: tick to send a row, an empty row at the
 * end to add the next one, an optional description, Bulk Edit as plain text, and
 * a menu to show or hide the Value and Description columns.
 */
@Component({
  selector: 'app-kv-table',
  host: { '(document:click)': 'closeMenuOutside($event)' },
  template: `
    <div class="rounded-xl border border-line" [class.overflow-x-auto]="!menu()">
      @if (bulk()) {
        <div class="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-sm">
          <span class="text-muted">One per line as key:value. Start a line with // to keep it without sending it.</span>
          <button type="button" class="shrink-0 font-semibold text-brand hover:underline" (click)="bulk.set(false)">
            Key-Value Edit
          </button>
        </div>
        <textarea
          class="block min-h-40 w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-6 outline-none"
          spellcheck="false"
          [attr.aria-label]="keyLabel() + 's as text'"
          [value]="bulkText()"
          (input)="rowsChange.emit(fromBulk($any($event.target).value))"
        ></textarea>
      } @else {
        <table class="w-full min-w-[30rem] text-sm leading-5">
          <thead>
            <tr class="border-b border-line text-left text-muted">
              @if (toggles()) {
                <th class="w-10 px-2 py-2"><span class="sr-only">Send</span></th>
              }
              <th class="px-2 py-2 font-semibold">{{ keyLabel() }}</th>
              @if (columns().value) {
                <th class="px-2 py-2 font-semibold">Value</th>
              }
              @if (columns().description) {
                <th class="px-2 py-2 font-semibold">Description</th>
              }
              <th class="w-px px-2 py-1 text-right whitespace-nowrap">
                <span class="relative inline-flex items-center gap-1">
                  <button type="button" class="px-1 text-xs font-semibold hover:text-ink" (click)="bulk.set(true)">
                    Bulk Edit
                  </button>
                  <button
                    type="button"
                    class="grid size-7 place-items-center rounded-lg hover:bg-surface hover:text-ink"
                    aria-label="Table options"
                    aria-haspopup="true"
                    [attr.aria-expanded]="menu()"
                    (click)="menu.set(!menu())"
                  >
                    &#8943;
                  </button>
                  @if (menu()) {
                    <span
                      class="absolute top-full right-0 z-20 mt-1 flex w-44 flex-col gap-1 rounded-xl border border-line bg-page p-3 text-left text-sm font-normal text-ink shadow-lg"
                      role="group"
                      aria-label="Show columns"
                    >
                      <span class="pb-1 font-semibold text-muted">Show columns</span>
                      <label class="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          class="size-4 accent-brand"
                          [checked]="columns().value"
                          (change)="toggleColumn('value', $any($event.target).checked)"
                        />
                        Value
                      </label>
                      <label class="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          class="size-4 accent-brand"
                          [checked]="columns().description"
                          (change)="toggleColumn('description', $any($event.target).checked)"
                        />
                        Description
                      </label>
                    </span>
                  }
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (row of shown(); track $index; let i = $index; let last = $last) {
              <tr class="border-b border-line last:border-0">
                @if (toggles()) {
                  <td class="px-2 py-1 text-center">
                    @if (!last) {
                      <input
                        type="checkbox"
                        class="size-4 accent-brand"
                        [checked]="row.enabled"
                        [attr.aria-label]="'Send ' + (row.key || 'row ' + (i + 1))"
                        (change)="set(i, 'enabled', $any($event.target).checked)"
                      />
                    }
                  </td>
                }
                <td class="px-1 py-1">
                  <input
                    type="text"
                    class="w-full rounded-lg bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none focus:bg-page"
                    spellcheck="false"
                    autocomplete="off"
                    [class.text-muted]="!row.enabled"
                    [placeholder]="last ? keyLabel() : ''"
                    [attr.aria-label]="keyLabel() + ' ' + (i + 1)"
                    [value]="row.key"
                    (input)="set(i, 'key', $any($event.target).value)"
                  />
                </td>
                @if (columns().value) {
                  <td class="px-1 py-1">
                    <input
                      [type]="secret() && !last ? 'password' : 'text'"
                      class="w-full rounded-lg bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none focus:bg-page"
                      spellcheck="false"
                      autocomplete="off"
                      [class.text-muted]="!row.enabled"
                      [placeholder]="last ? 'Value' : ''"
                      [attr.aria-label]="'Value ' + (i + 1)"
                      [value]="row.value"
                      (input)="set(i, 'value', $any($event.target).value)"
                    />
                  </td>
                }
                @if (columns().description) {
                  <td class="px-1 py-1">
                    <input
                      type="text"
                      class="w-full rounded-lg bg-transparent px-2 py-1.5 text-[13px] outline-none focus:bg-page"
                      autocomplete="off"
                      [class.text-muted]="!row.enabled"
                      [placeholder]="last ? 'Description' : ''"
                      [attr.aria-label]="'Description ' + (i + 1)"
                      [value]="row.description ?? ''"
                      (input)="set(i, 'description', $any($event.target).value)"
                    />
                  </td>
                }
                <td class="px-1 py-1 text-right">
                  @if (!last) {
                    <button
                      type="button"
                      class="inline-grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                      [attr.aria-label]="'Remove ' + (row.key || 'row ' + (i + 1))"
                      (click)="remove(i)"
                    >
                      &times;
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class KvTable {
  readonly rows = input.required<KeyValue[]>();
  readonly keyLabel = input('Key');
  /** Show the "send this row" tick boxes. */
  readonly toggles = input(true);
  /** Hide values like passwords. */
  readonly secret = input(false);
  readonly columns = input<KvColumns>({ value: true, description: true });
  readonly rowsChange = output<KeyValue[]>();
  readonly columnsChange = output<KvColumns>();

  protected readonly bulk = signal(false);
  protected readonly menu = signal(false);
  /** The rows plus one empty row for adding. */
  protected readonly shown = computed(() => [...this.rows(), { key: '', value: '', enabled: true } as KeyValue]);
  protected readonly bulkText = computed(() => toBulk(this.rows()));

  protected fromBulk(text: string): KeyValue[] {
    return fromBulk(text, this.rows());
  }

  protected set(index: number, field: keyof KeyValue, value: string | boolean): void {
    const rows = [...this.rows()];
    if (index === rows.length) rows.push({ key: '', value: '', enabled: true });
    rows[index] = { ...rows[index], [field]: value };
    this.rowsChange.emit(rows);
  }

  protected remove(index: number): void {
    this.rowsChange.emit(this.rows().filter((_, i) => i !== index));
  }

  protected toggleColumn(column: keyof KvColumns, shown: boolean): void {
    this.columnsChange.emit({ ...this.columns(), [column]: shown });
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** A click anywhere outside the table closes the column menu. */
  protected closeMenuOutside(event: MouseEvent): void {
    if (this.menu() && !this.host.nativeElement.contains(event.target as Node)) this.menu.set(false);
  }
}
