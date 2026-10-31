import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { JSON_QUERY_CONTENT } from './content';
import { EXAMPLES, QueryLanguage, QueryResult, SAMPLE_JSON, runJq, runJsonPath } from './query';

const DEBOUNCE_MS = 300;

@Component({
  selector: 'app-json-query',
  imports: [Icon, CodeEditor, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Query language">
          @for (tab of tabs; track tab.value) {
            <button
              type="button"
              role="tab"
              class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
              [class]="language() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
              [attr.aria-selected]="language() === tab.value"
              (click)="setLanguage(tab.value)"
            >
              {{ tab.label }}
            </button>
          }
        </div>
        <app-share-button [path]="tool.path" [data]="shareData()" />
      </div>

      <label for="query-input" class="mt-6 block text-sm leading-5 font-semibold">{{ language() === 'jq' ? 'jq filter' : 'JSONPath' }}</label>
      <input
        id="query-input"
        class="field mt-2 w-full font-mono text-base"
        spellcheck="false"
        autocomplete="off"
        [placeholder]="language() === 'jq' ? '.items[] | select(.price > 10)' : '$.items[?(@.price > 10)]'"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      @if (language() === 'jq') {
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label class="flex items-center gap-2">
            <input type="checkbox" class="size-4 accent-brand" [checked]="compact()" (change)="compact.set($any($event.target).checked)" />
            One line per result (-c)
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" class="size-4 accent-brand" [checked]="raw()" (change)="raw.set($any($event.target).checked)" />
            Strings without quotes (-r)
          </label>
        </div>
      }
      <details class="mt-3 rounded-xl border border-line px-4 py-2 text-sm" open>
        <summary class="cursor-pointer font-semibold">Examples (they work on the sample)</summary>
        <ul class="mt-2 grid gap-1 sm:grid-cols-2">
          @for (e of examples(); track e.query) {
            <li>
              <button type="button" class="w-full rounded-lg px-2 py-1 text-left hover:bg-surface" (click)="useExample(e.query)">
                <code class="font-mono text-brand">{{ e.query }}</code>
                <span class="block text-xs text-muted">{{ e.meaning }}</span>
              </button>
            </li>
          }
        </ul>
      </details>

      <div id="query-status" class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (problem(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 whitespace-pre-wrap">{{ message }}</p>
        } @else if (result(); as r) {
          @if (r.ok) {
            <p class="flex items-center gap-2 font-semibold">
              <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
              {{ r.count === null ? 'Done.' : r.count === 1 ? '1 result.' : r.count + ' results.' }}
            </p>
          }
        } @else if (busy()) {
          <p class="text-muted">Loading jq…</p>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">JSON</span>
            <button type="button" class="btn-small" (click)="setJson(sample)">Use the sample</button>
          </div>
          <app-code-editor class="h-80 lg:h-[30rem]" language="json" ariaLabel="JSON input" placeholder="Paste JSON here." [value]="json()" (valueChange)="onJson($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Result</span>
            <app-copy-button [text]="output()" />
          </div>
          <app-code-editor class="h-80 lg:h-[30rem]" [language]="language() === 'jq' && raw() ? 'plaintext' : 'json'" ariaLabel="Query result" placeholder="The result appears here." [readOnly]="true" [value]="output()" />
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Queries run in your browser; jq runs as WebAssembly. Your JSON is never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class JsonQuery {
  protected readonly tool = TOOLS.find((t) => t.path === 'json-query')!;
  protected readonly content = JSON_QUERY_CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = SAMPLE_JSON;
  protected readonly tabs = [
    { value: 'jsonpath' as const, label: 'JSONPath' },
    { value: 'jq' as const, label: 'jq' },
  ];

  protected readonly language = signal<QueryLanguage>('jsonpath');
  protected readonly query = signal(EXAMPLES.jsonpath[0].query);
  protected readonly json = signal(SAMPLE_JSON);
  private readonly settledJson = signal(SAMPLE_JSON);
  protected readonly compact = signal(false);
  protected readonly raw = signal(false);
  protected readonly result = signal<QueryResult | null>(null);
  protected readonly busy = signal(false);

  protected readonly examples = computed(() => EXAMPLES[this.language()]);
  private readonly parsed = computed(() => {
    const text = this.settledJson();
    if (!text.trim()) return { ok: false as const, error: '' };
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch (error) {
      return { ok: false as const, error: `The JSON is not valid: ${(error as Error).message}` };
    }
  });
  protected readonly problem = computed(() => {
    const parsed = this.parsed();
    if (!parsed.ok) return parsed.error || null;
    const r = this.result();
    return r && !r.ok ? r.error : null;
  });
  protected readonly output = computed(() => {
    const r = this.result();
    return r?.ok && this.parsed().ok ? r.output : '';
  });
  protected readonly shareData = computed(() =>
    this.query() && this.json() ? { language: this.language(), query: this.query(), json: this.json() } : null,
  );

  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private runId = 0;

  constructor() {
    effect(() => {
      const parsed = this.parsed();
      const args = { language: this.language(), query: this.query(), text: this.settledJson(), compact: this.compact(), raw: this.raw() };
      clearTimeout(this.timer);
      if (!parsed.ok || !args.query.trim()) {
        this.result.set(null);
        return;
      }
      this.timer = setTimeout(() => void this.execute(args, parsed.value), DEBOUNCE_MS);
    });
    onSharedInput((data) => {
      if (data['language'] === 'jq' || data['language'] === 'jsonpath') this.language.set(data['language']);
      this.query.set(data['query'] ?? '');
      this.setJson(data['json'] ?? data['input'] ?? '');
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected setLanguage(language: QueryLanguage): void {
    if (language === this.language()) return;
    this.language.set(language);
    this.query.set(EXAMPLES[language][0].query);
  }

  protected useExample(query: string): void {
    this.query.set(query);
    this.analytics.track('json-query-example', { language: this.language() });
  }

  protected onJson(value: string): void {
    if (value === this.json()) return;
    this.json.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settledJson.set(value), DEBOUNCE_MS);
  }

  protected setJson(value: string): void {
    this.json.set(value);
    this.settledJson.set(value);
  }

  private async execute(
    args: { language: QueryLanguage; query: string; text: string; compact: boolean; raw: boolean },
    value: unknown,
  ): Promise<void> {
    const id = ++this.runId;
    this.busy.set(true);
    try {
      const result = args.language === 'jq' ? await runJq(args.text, args.query, args) : await runJsonPath(value, args.query);
      if (id === this.runId) this.result.set(result);
    } catch {
      if (id === this.runId) this.result.set({ ok: false, error: 'The query engine could not be loaded. Reload the page and try again.' });
    } finally {
      if (id === this.runId) this.busy.set(false);
    }
  }
}
