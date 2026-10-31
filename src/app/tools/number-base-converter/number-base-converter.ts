import { Component, computed, signal } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { bitLength, fixedWidth, group, parseInBase, toBase } from './bases';
import { NUMBER_BASE_CONTENT } from './content';

const GROUPING: Record<number, [number, string]> = { 2: [4, ' '], 8: [3, ' '], 10: [3, ','], 16: [4, ' '] };

@Component({
  selector: 'app-number-base-converter',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>
      <p class="mt-6 text-sm text-muted">Type in any box. The others follow. Numbers can be as large as you like.</p>

      <div class="mt-4 flex flex-col gap-3">
        @for (row of rows(); track row.key) {
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              @if (row.key === 'custom') {
                <label class="flex items-center gap-2 text-sm leading-5 font-semibold">
                  Base
                  <select class="field py-1" [value]="customBase()" (change)="setCustomBase(+$any($event.target).value)">
                    @for (b of customBases; track b) {
                      <option [value]="b" [selected]="b === customBase()">{{ b }}</option>
                    }
                  </select>
                </label>
              } @else {
                <label [for]="'base-' + row.key" class="text-sm leading-5 font-semibold">{{ row.label }} <span class="font-normal text-muted">(base {{ row.base }})</span></label>
              }
              <app-copy-button [text]="row.copy" [ariaLabel]="'Copy ' + row.label" />
            </div>
            <input
              [id]="'base-' + row.key"
              class="field font-mono text-base"
              spellcheck="false"
              autocomplete="off"
              [attr.aria-label]="row.key === 'custom' ? 'Number in base ' + customBase() : null"
              [attr.aria-invalid]="row.error ? true : null"
              [class.border-danger]="!!row.error"
              [value]="row.shown"
              (input)="edit(row.base, $any($event.target).value)"
            />
            @if (row.error) {
              <p class="text-sm text-danger" role="alert">{{ row.error }}</p>
            }
          </div>
        }
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm leading-5">
        <input type="checkbox" class="size-4 accent-brand" [checked]="grouped()" (change)="grouped.set($any($event.target).checked)" />
        Group digits for reading (Copy always copies plain digits)
      </label>

      @if (value() !== null) {
        <section class="mt-10" aria-labelledby="bits-heading">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="bits-heading" class="text-xl leading-7">As a fixed-size integer</h2>
            <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Bit width">
              @for (w of widths; track w) {
                <button
                  type="button"
                  role="radio"
                  class="rounded-full px-3 py-1.5 text-sm leading-5 font-semibold transition-colors"
                  [class]="bits() === w ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
                  [attr.aria-checked]="bits() === w"
                  (click)="bits.set(w)"
                >
                  {{ w }}-bit
                </button>
              }
            </div>
          </div>
          <p class="mt-2 text-sm text-muted">This number needs {{ needed() }} {{ needed() === 1 ? 'bit' : 'bits' }} without a sign.</p>
          @if (fixed(); as f) {
            @if (f.pattern === null) {
              <p class="mt-3 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm leading-5">
                This number does not fit in {{ f.bits }} bits. Choose a larger width.
              </p>
            } @else {
              <dl class="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line">
                @for (row of fixedRows(); track row.label) {
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <dt class="w-full shrink-0 sm:w-40 text-sm font-semibold">{{ row.label }}</dt>
                    <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
                  </div>
                }
              </dl>
            }
          }
        </section>
      }

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Converted in your browser.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class NumberBaseConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'number-base-converter')!;
  protected readonly content = NUMBER_BASE_CONTENT;
  protected readonly icons = ICONS;
  protected readonly widths = [8, 16, 32, 64, 128];
  protected readonly customBases = Array.from({ length: 35 }, (_, i) => i + 2).filter((b) => ![2, 8, 10, 16].includes(b));

  /** The box being typed in and its text; every other box is worked out from it. */
  protected readonly source = signal({ base: 10, text: '255' });
  protected readonly customBase = signal(36);
  protected readonly grouped = signal(true);
  protected readonly bits = signal(8);

  private readonly parsed = computed(() => parseInBase(this.source().text, this.source().base));
  protected readonly value = computed(() => {
    const result = this.parsed();
    return result.ok ? result.value : null;
  });
  protected readonly rows = computed(() => {
    const source = this.source();
    const parsed = this.parsed();
    const value = this.value();
    return [
      { key: 'bin', label: 'Binary', base: 2 },
      { key: 'oct', label: 'Octal', base: 8 },
      { key: 'dec', label: 'Decimal', base: 10 },
      { key: 'hex', label: 'Hexadecimal', base: 16 },
      { key: 'custom', label: `Base ${this.customBase()}`, base: this.customBase() },
    ].map((row) => {
      const isSource = row.base === source.base;
      const digits = value === null ? '' : toBase(value, row.base);
      const [size, separator] = GROUPING[row.base] ?? [0, ''];
      return {
        ...row,
        shown: isSource ? source.text : this.grouped() && size ? group(digits, size, separator) : digits,
        copy: isSource && value === null ? '' : digits,
        error: isSource && !parsed.ok ? parsed.error : '',
      };
    });
  });
  protected readonly needed = computed(() => {
    const value = this.value();
    return value === null ? 0 : bitLength(value);
  });
  protected readonly fixed = computed(() => {
    const value = this.value();
    return value === null ? null : fixedWidth(value, this.bits());
  });
  protected readonly fixedRows = computed(() => {
    const f = this.fixed();
    if (!f || f.pattern === null) return [];
    return [
      { label: 'Binary pattern', value: group(toBase(f.pattern, 2).padStart(f.bits, '0'), 4) },
      { label: 'Hex pattern', value: '0x' + toBase(f.pattern, 16).toUpperCase().padStart(f.bits / 4, '0') },
      { label: 'Signed (two’s complement)', value: group(String(f.signed), 3, ',') },
      { label: 'Unsigned', value: group(String(f.unsigned), 3, ',') },
    ];
  });

  protected edit(base: number, text: string): void {
    this.source.set({ base, text });
  }

  protected setCustomBase(base: number): void {
    const value = this.value();
    this.customBase.set(base);
    // Keep the number when the custom box was the one being typed in.
    if (value !== null && ![2, 8, 10, 16].includes(this.source().base)) this.source.set({ base, text: toBase(value, base) });
  }
}
