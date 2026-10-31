import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { Rgba, contrast, formats, parseColor, toHex } from './color';
import { COLOR_CONTENT } from './content';

const CHECKS = [
  { label: 'Normal text, AA', min: 4.5 },
  { label: 'Large text, AA', min: 3 },
  { label: 'Normal text, AAA', min: 7 },
  { label: 'Large text, AAA', min: 4.5 },
  { label: 'Icons and borders', min: 3 },
];

/** A colour box: text that is parsed, plus the browser's colour picker. */
class ColorInput {
  readonly text = signal('');
  readonly parsed = computed(() => parseColor(this.text()));
  readonly color = computed(() => {
    const result = this.parsed();
    return result.ok ? result.color : null;
  });
  readonly error = computed(() => {
    const result = this.parsed();
    return result.ok ? null : result.error || null;
  });
  /** The picker only takes #rrggbb. */
  readonly pickerValue = computed(() => {
    const color = this.color();
    return color ? toHex({ ...color, a: 1 }) : '#000000';
  });

  constructor(initial: string) {
    this.text.set(initial);
  }
}

@Component({
  selector: 'app-color-converter',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 grid gap-6 md:grid-cols-[14rem_1fr]">
        <div class="checkerboard h-40 overflow-hidden rounded-xl border border-line md:h-auto">
          <div class="size-full" [style.background-color]="main.color() ? css(main.color()!) : 'transparent'"></div>
        </div>
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <label for="color-input" class="text-sm leading-5 font-semibold">Colour</label>
            <app-share-button [path]="tool.path" [data]="main.text().trim() ? { input: main.text() } : null" />
          </div>
          <div class="flex gap-2">
            <input
              type="color"
              class="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line"
              aria-label="Pick a colour"
              [value]="main.pickerValue()"
              (input)="main.text.set($any($event.target).value)"
            />
            <input
              id="color-input"
              class="field min-w-0 flex-1 font-mono text-base"
              spellcheck="false"
              autocomplete="off"
              placeholder="#4f46e5, rgb(79 70 229), hsl(…), 0xFF4F46E5 or teal"
              [value]="main.text()"
              (input)="main.text.set($any($event.target).value)"
            />
          </div>
          @if (main.error(); as message) {
            <p class="text-sm text-danger" role="alert">{{ message }}</p>
          }
          <dl class="flex flex-col divide-y divide-line rounded-xl border border-line">
            @for (row of mainFormats(); track row.label) {
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <dt class="w-full shrink-0 sm:w-32 text-sm font-semibold">{{ row.label }}</dt>
                <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
                <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
              </div>
            }
          </dl>
        </div>
      </div>

      <section class="mt-12" aria-labelledby="contrast-heading">
        <h2 id="contrast-heading" class="text-xl leading-7">Contrast checker</h2>
        <p class="mt-1 text-sm text-muted">Check that text is readable on its background, as WCAG 2.2 asks.</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          @for (box of [textColor, backgroundColor]; track $index) {
            <label class="flex flex-col gap-2 text-sm leading-5">
              <span class="font-semibold">{{ $index === 0 ? 'Text colour' : 'Background colour' }}</span>
              <span class="flex gap-2">
                <input
                  type="color"
                  class="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line"
                  [attr.aria-label]="$index === 0 ? 'Pick the text colour' : 'Pick the background colour'"
                  [value]="box.pickerValue()"
                  (input)="box.text.set($any($event.target).value)"
                />
                <input class="field min-w-0 flex-1 font-mono" spellcheck="false" [value]="box.text()" (input)="box.text.set($any($event.target).value)" />
              </span>
              @if (box.error(); as message) {
                <span class="text-danger">{{ message }}</span>
              }
            </label>
          }
        </div>
        <div class="mt-3 flex justify-end">
          <button type="button" class="btn-small" (click)="swap()">Swap colours</button>
        </div>

        @if (ratio(); as r) {
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div
              class="flex flex-col justify-center gap-2 rounded-xl border border-line p-6"
              [style.color]="css(textColor.color()!)"
              [style.background-color]="css(backgroundColor.color()!)"
            >
              <p class="text-2xl font-semibold">Large text sample</p>
              <p>Normal text sample: the quick brown fox jumps over the lazy dog.</p>
            </div>
            <div>
              <p class="font-heading text-4xl font-semibold" aria-live="polite">{{ r }}:1</p>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                @for (check of checks; track check.label) {
                  <li class="flex items-center justify-between gap-3">
                    <span>{{ check.label }} <span class="text-muted">({{ check.min }}:1)</span></span>
                    <span
                      class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      [class]="r >= check.min ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger'"
                      >{{ r >= check.min ? 'Pass' : 'Fail' }}</span
                    >
                  </li>
                }
              </ul>
            </div>
          </div>
        }
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Converted in your browser.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class ColorConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'color-converter')!;
  protected readonly content = COLOR_CONTENT;
  protected readonly icons = ICONS;
  protected readonly checks = CHECKS;

  protected readonly main = new ColorInput('#4f46e5');
  protected readonly textColor = new ColorInput('#1f2937');
  protected readonly backgroundColor = new ColorInput('#ffffff');

  protected readonly mainFormats = computed(() => {
    const color = this.main.color();
    return color ? formats(color) : [];
  });
  protected readonly ratio = computed(() => {
    const text = this.textColor.color();
    const background = this.backgroundColor.color();
    return text && background ? contrast(text, background) : null;
  });

  constructor() {
    onSharedInput((data) => this.main.text.set(data['input'] ?? ''));
  }

  protected css(c: Rgba): string {
    return `rgb(${c.r} ${c.g} ${c.b} / ${c.a})`;
  }

  protected swap(): void {
    const text = this.textColor.text();
    this.textColor.text.set(this.backgroundColor.text());
    this.backgroundColor.text.set(text);
  }
}
