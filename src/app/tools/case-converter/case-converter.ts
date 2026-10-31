import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { CASE_CONTENT } from './content';
import { CASE_STYLES, DEFAULT_LINE_OPTIONS, LineOptions, SortMode, applyLineTools, stats } from './text-case';

@Component({
  selector: 'app-case-converter',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex items-center justify-between gap-2">
        <label for="case-input" class="text-sm leading-5 font-semibold">Text</label>
        <span class="flex gap-2">
          <button type="button" class="btn-small" [disabled]="!text()" (click)="text.set('')">Clear</button>
          <app-share-button [path]="tool.path" [data]="text() ? { input: text() } : null" />
        </span>
      </div>
      <textarea
        id="case-input"
        rows="6"
        class="field-code mt-2"
        spellcheck="false"
        placeholder="Type or paste names or text, for example user profile id or getUserProfile. One per line works too."
        [value]="text()"
        (input)="text.set($any($event.target).value)"
      ></textarea>
      <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-live="polite">
        <span>{{ counts().characters }} characters</span>
        <span>{{ counts().withoutSpaces }} without spaces</span>
        <span>{{ counts().words }} words</span>
        <span>{{ counts().lines }} lines</span>
        <span>{{ bytes() }}</span>
      </p>

      <section class="mt-8" aria-labelledby="cases-heading">
        <h2 id="cases-heading" class="text-xl leading-7">Naming styles and letter case</h2>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2">
          @for (row of converted(); track row.id) {
            <li class="card flex items-start gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-muted">{{ row.label }}</p>
                <p class="mt-1 line-clamp-3 font-mono text-sm break-all whitespace-pre-wrap" [class.text-muted]="!row.value">{{ row.value || '—' }}</p>
              </div>
              <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
            </li>
          }
        </ul>
      </section>

      <section class="mt-10" aria-labelledby="lines-heading">
        <h2 id="lines-heading" class="text-xl leading-7">Line tools</h2>
        <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm leading-5">
          @for (option of toggles; track option.key) {
            <label class="flex items-center gap-2">
              <input type="checkbox" class="size-4 accent-brand" [checked]="lineOptions()[option.key]" (change)="setOption(option.key, $any($event.target).checked)" />
              {{ option.label }}
            </label>
          }
          <label class="flex items-center gap-2">
            <span class="font-semibold">Sort</span>
            <select class="field" [value]="lineOptions().sort" (change)="setSort($any($event.target).value)">
              <option value="none">Keep order</option>
              <option value="az">A to Z</option>
              <option value="za">Z to A</option>
              <option value="natural">Natural (file2 before file10)</option>
              <option value="length">By length</option>
            </select>
          </label>
        </div>
        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="text-sm leading-5 font-semibold">Result ({{ resultLines() }} lines)</span>
          <div class="flex gap-2">
            <app-copy-button [text]="lineResult()" ariaLabel="Copy line tools result" />
            <button type="button" class="btn-small" [disabled]="!lineResult() || lineResult() === text()" (click)="text.set(lineResult())">Use as text</button>
          </div>
        </div>
        <textarea rows="8" class="field-code mt-2" readonly aria-label="Line tools result" placeholder="Turn on a line tool to see the result." [value]="lineResult()"></textarea>
      </section>

      <p class="mt-6 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Your text is converted in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CaseConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'case-converter')!;
  protected readonly content = CASE_CONTENT;
  protected readonly icons = ICONS;
  protected readonly toggles: { key: 'trim' | 'removeEmpty' | 'unique' | 'ignoreCase' | 'reverse'; label: string }[] = [
    { key: 'trim', label: 'Trim spaces' },
    { key: 'removeEmpty', label: 'Remove empty lines' },
    { key: 'unique', label: 'Remove duplicates' },
    { key: 'ignoreCase', label: 'Ignore case' },
    { key: 'reverse', label: 'Reverse' },
  ];

  protected readonly text = signal('');
  protected readonly lineOptions = signal<LineOptions>({ ...DEFAULT_LINE_OPTIONS, trim: true, removeEmpty: true, unique: true });

  protected readonly converted = computed(() => {
    const text = this.text();
    return CASE_STYLES.map((style) => ({ id: style.id, label: style.label, value: text ? style.convert(text) : '' }));
  });
  protected readonly counts = computed(() => stats(this.text()));
  protected readonly bytes = computed(() => formatBytes(this.counts().bytes) + ' as UTF-8');
  protected readonly lineResult = computed(() => (this.text() ? applyLineTools(this.text(), this.lineOptions()) : ''));
  protected readonly resultLines = computed(() => (this.lineResult() ? this.lineResult().split('\n').length : 0));

  constructor() {
    onSharedInput((data) => this.text.set(data['input'] ?? ''));
  }

  protected setOption(key: keyof LineOptions, value: boolean): void {
    this.lineOptions.update((o) => ({ ...o, [key]: value }));
  }

  protected setSort(sort: SortMode): void {
    this.lineOptions.update((o) => ({ ...o, sort }));
  }
}
