import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { MOCK_CONTENT, MOCK_SAMPLE, MOCK_SCHEMA } from './content';
import { MockFormat, formatRecords, generate, looksLikeSchema } from './mock';

const MAX_COUNT = 1000;
const DEBOUNCE_MS = 300;
const FORMATS: { value: MockFormat; label: string; extension: string; mime: string }[] = [
  { value: 'json', label: 'JSON array', extension: 'json', mime: 'application/json' },
  { value: 'ndjson', label: 'NDJSON (one per line)', extension: 'ndjson', mime: 'application/x-ndjson' },
  { value: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv' },
  { value: 'sql', label: 'SQL INSERT', extension: 'sql', mime: 'application/sql' },
];

@Component({
  selector: 'app-mock-data-generator',
  imports: [Icon, CodeEditor, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Records</span>
          <input type="number" min="1" [max]="maxCount" class="field w-28" [value]="count()" (change)="setCount($any($event.target).valueAsNumber)" />
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Format</span>
          <select class="field" [value]="format()" (change)="format.set($any($event.target).value)">
            @for (f of formats; track f.value) {
              <option [value]="f.value">{{ f.label }}</option>
            }
          </select>
        </label>
        @if (format() === 'sql') {
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Table</span>
            <input class="field w-36 font-mono" spellcheck="false" [value]="table()" (input)="table.set($any($event.target).value || 'items')" />
          </label>
        }
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Seed</span>
          <span class="flex gap-2">
            <input type="number" class="field w-28 font-mono" [value]="seed()" (change)="seed.set($any($event.target).valueAsNumber || 1)" />
            <button type="button" class="btn-small" (click)="newSeed()">New data</button>
          </span>
        </label>
        <app-share-button [path]="tool.path" [data]="shareData()" />
      </div>

      <div class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (output()) {
          <p class="flex items-center gap-2 font-semibold">
            <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
            {{ count() }} records made from {{ isSchema() ? 'the JSON Schema' : 'the sample record' }}.
          </p>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 flex-wrap items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Sample record or JSON Schema</span>
            <div class="flex gap-2">
              <button type="button" class="btn-small" (click)="setInput(sample)">Sample record</button>
              <button type="button" class="btn-small" (click)="setInput(schema)">Schema</button>
            </div>
          </div>
          <app-code-editor class="h-80 lg:h-[30rem]" language="json" ariaLabel="Sample or schema" placeholder="Paste one example record, or a JSON Schema." [value]="input()" (valueChange)="onInput($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Mock data</span>
            <div class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
                <app-icon [path]="icons.download" [size]="16" />
                Download
              </button>
            </div>
          </div>
          <app-code-editor class="h-80 lg:h-[30rem]" [language]="format() === 'json' ? 'json' : 'plaintext'" ariaLabel="Mock data" placeholder="The records appear here." [readOnly]="true" [value]="output()" />
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Made in your browser. Names, emails and numbers are invented; they do not belong to real people.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class MockDataGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'mock-data-generator')!;
  protected readonly content = MOCK_CONTENT;
  protected readonly icons = ICONS;
  protected readonly formats = FORMATS;
  protected readonly maxCount = MAX_COUNT;
  protected readonly sample = MOCK_SAMPLE;
  protected readonly schema = MOCK_SCHEMA;

  protected readonly input = signal(MOCK_SAMPLE);
  private readonly settled = signal(MOCK_SAMPLE);
  protected readonly count = signal(10);
  protected readonly format = signal<MockFormat>('json');
  protected readonly table = signal('items');
  protected readonly seed = signal(2026);

  private readonly parsed = computed(() => {
    const text = this.settled();
    if (!text.trim()) return { ok: false as const, error: '' };
    try {
      const value = JSON.parse(text) as unknown;
      if (value === null || typeof value !== 'object') return { ok: false as const, error: 'Paste a JSON object (one example record) or a JSON Schema.' };
      return { ok: true as const, value };
    } catch (error) {
      return { ok: false as const, error: `The JSON is not valid: ${(error as Error).message}` };
    }
  });
  protected readonly isSchema = computed(() => {
    const parsed = this.parsed();
    return parsed.ok && looksLikeSchema(parsed.value);
  });
  protected readonly error = computed(() => {
    const parsed = this.parsed();
    return parsed.ok ? null : parsed.error || null;
  });
  protected readonly output = computed(() => {
    const parsed = this.parsed();
    if (!parsed.ok) return '';
    const records = generate(this.isSchema() ? { kind: 'schema', value: parsed.value } : { kind: 'sample', value: parsed.value }, this.count(), this.seed());
    return formatRecords(records, this.format(), this.table());
  });
  protected readonly shareData = computed(() => (this.input().trim() ? { input: this.input(), count: String(this.count()), seed: String(this.seed()) } : null));

  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    onSharedInput((data) => {
      if (data['input']) this.setInput(data['input']);
      if (data['count']) this.setCount(Number(data['count']));
      if (data['seed']) this.seed.set(Number(data['seed']) || 1);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(value: string): void {
    if (value === this.input()) return;
    this.input.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set(value), DEBOUNCE_MS);
  }

  protected setInput(value: string): void {
    clearTimeout(this.timer);
    this.input.set(value);
    this.settled.set(value);
  }

  protected setCount(value: number): void {
    this.count.set(Math.min(MAX_COUNT, Math.max(1, Math.round(value) || 1)));
  }

  protected newSeed(): void {
    this.seed.set(Math.floor(Math.random() * 1_000_000));
  }

  protected download(): void {
    const format = FORMATS.find((f) => f.value === this.format())!;
    downloadText(this.output(), `mock-data.${format.extension}`, format.mime);
    this.analytics.track('mock-download', { format: format.value, count: this.count() });
  }
}
