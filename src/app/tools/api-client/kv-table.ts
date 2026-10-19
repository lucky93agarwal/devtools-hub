import { Component, computed, input, output } from '@angular/core';
import { KeyValue } from './model';

/**
 * Editable key/value rows, as in Postman: tick to send a row, and an empty row
 * at the end to add the next one. Used for params, headers, form fields and variables.
 */
@Component({
  selector: 'app-kv-table',
  template: `
    <div class="overflow-x-auto rounded-xl border border-line">
      <table class="w-full min-w-[28rem] text-sm leading-5">
        <thead>
          <tr class="border-b border-line text-left text-muted">
            @if (toggles()) {
              <th class="w-10 px-2 py-2"><span class="sr-only">Send</span></th>
            }
            <th class="px-2 py-2 font-semibold">{{ keyLabel() }}</th>
            <th class="px-2 py-2 font-semibold">Value</th>
            <th class="w-10 px-2 py-2"><span class="sr-only">Remove</span></th>
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
                  [placeholder]="last ? 'Add ' + keyLabel().toLowerCase() : ''"
                  [attr.aria-label]="keyLabel() + ' ' + (i + 1)"
                  [value]="row.key"
                  (input)="set(i, 'key', $any($event.target).value)"
                />
              </td>
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
              <td class="px-1 py-1 text-center">
                @if (!last) {
                  <button
                    type="button"
                    class="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
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
  readonly rowsChange = output<KeyValue[]>();

  /** The rows plus one empty row for adding. */
  protected readonly shown = computed(() => [...this.rows(), { key: '', value: '', enabled: true }]);

  protected set(index: number, field: keyof KeyValue, value: string | boolean): void {
    const rows = [...this.rows()];
    if (index === rows.length) rows.push({ key: '', value: '', enabled: true });
    rows[index] = { ...rows[index], [field]: value };
    this.rowsChange.emit(rows);
  }

  protected remove(index: number): void {
    this.rowsChange.emit(this.rows().filter((_, i) => i !== index));
  }
}
