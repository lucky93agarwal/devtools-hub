import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { L10N_FORMATS, L10nFormat, detectL10n, parseL10n, writeL10n } from './l10n';

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Shop</string>
    <string name="welcome">Welcome back, %1$s!</string>
    <string name="cart_empty">Your cart is empty. Let\\'s find something you\\'ll love.</string>
    <plurals name="items_in_cart">
        <item quantity="one">%d item in your cart</item>
        <item quantity="other">%d items in your cart</item>
    </plurals>
</resources>
`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this localization converter',
  about:
    'Translations move between Android strings.xml, iOS Localizable.strings, JSON files for web apps and spreadsheets ' +
    'used by translators. This converter reads any of them and writes any other, taking care of escaping (apostrophes ' +
    'in Android, quotes in iOS), placeholders (%1$s in Android becomes %1$@ in iOS and back) and nested JSON keys. ' +
    'Plurals and string arrays become separate keys, and the tool tells you when that happens.',
  steps: [
    'Paste your translation file. Its format is detected, or choose it.',
    'Choose the format you need.',
    'For JSON, choose flat keys (home.title) or nested objects.',
    'Copy or download the result and check the notes about plurals and arrays.',
  ],
  faq: [
    { question: 'What happens to placeholders?', answer: 'String placeholders change between %s (Android) and %@ (iOS), including numbered ones such as %1$s. Number placeholders like %d stay the same.' },
    { question: 'Can I give the CSV to translators?', answer: 'Yes. The CSV has a key and a value column and opens in Excel and Google Sheets. Convert it back when they are done.' },
    { question: 'Why did my keys change in Android?', answer: 'Android resource names can only use letters, digits and underscores, so dots and dashes become underscores.' },
  ],
};

@Component({
  selector: 'app-localization-converter',
  imports: [CodeEditor, CopyButton, ToolPage],
  template: `
    <app-tool-page path="localization-converter" [content]="content" [wide]="true">
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">From</span>
          <select class="field" [value]="from()" (change)="from.set($any($event.target).value)">
            <option value="auto">Detect ({{ labelOf(detected()) }})</option>
            @for (f of formats; track f.value) {
              <option [value]="f.value">{{ f.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">To</span>
          <select class="field" [value]="to()" (change)="to.set($any($event.target).value)">
            @for (f of formats; track f.value) {
              <option [value]="f.value">{{ f.label }}</option>
            }
          </select>
        </label>
        @if (to() === 'json') {
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="size-4 accent-brand" [checked]="nested()" (change)="nested.set($any($event.target).checked)" />
            Nested objects
          </label>
        }
        <button type="button" class="btn-small" (click)="input.set(sample)">Try a sample</button>
      </div>

      <div class="mt-4 min-h-6 text-sm" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (count()) {
          <p class="font-semibold">{{ count() }} strings converted.</p>
          @for (n of notes(); track n) {
            <p class="text-muted">{{ n }}</p>
          }
        }
      </div>

      <div class="mt-2 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Input</span>
          <app-code-editor class="h-80 lg:h-[30rem]" ariaLabel="Translations input" placeholder="Paste strings.xml, Localizable.strings, JSON or CSV." [value]="input()" (valueChange)="input.set($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">{{ labelOf(to()) }}</span>
            <span class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">Download</button>
            </span>
          </div>
          <app-code-editor class="h-80 lg:h-[30rem]" ariaLabel="Converted translations" placeholder="The result appears here." [readOnly]="true" [value]="output()" />
        </div>
      </div>
    </app-tool-page>
  `,
})
export class LocalizationConverter {
  protected readonly content = CONTENT;
  protected readonly formats = L10N_FORMATS;
  protected readonly sample = SAMPLE;
  protected readonly input = signal('');
  protected readonly from = signal<L10nFormat | 'auto'>('auto');
  protected readonly to = signal<L10nFormat>('ios');
  protected readonly nested = signal(false);

  protected readonly detected = computed(() => detectL10n(this.input()));
  private readonly parsed = computed(() => {
    const format = this.from() === 'auto' ? this.detected() : (this.from() as L10nFormat);
    if (!this.input().trim()) return null;
    if (!format) return { ok: false as const, error: 'The format could not be detected. Choose it under From.' };
    return parseL10n(this.input(), format);
  });
  protected readonly error = computed(() => {
    const p = this.parsed();
    return p && !p.ok ? p.error : null;
  });
  protected readonly count = computed(() => {
    const p = this.parsed();
    return p?.ok ? p.entries.length : 0;
  });
  protected readonly notes = computed(() => {
    const p = this.parsed();
    return p?.ok ? p.notes : [];
  });
  protected readonly output = computed(() => {
    const p = this.parsed();
    return p?.ok && p.entries.length ? writeL10n(p.entries, this.to(), this.nested()) : '';
  });

  constructor() {
    onSharedInput((d) => this.input.set(d['input'] ?? ''));
  }

  protected labelOf(format: L10nFormat | null): string {
    return L10N_FORMATS.find((f) => f.value === format)?.label ?? 'unknown';
  }

  protected download(): void {
    const names: Record<L10nFormat, string> = { android: 'strings.xml', ios: 'Localizable.strings', json: 'translations.json', csv: 'translations.csv' };
    downloadText(this.output(), names[this.to()], 'text/plain');
  }
}
