import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { REGEX_CONTENT } from './content';
import { CODE_LANGUAGES, FLAGS, LIBRARY, MATCH_LIMIT, RunResult, asCode, compile, explain, segments } from './regex';
import { RegexRunner } from './regex-runner';

const DEBOUNCE_MS = 150;

@Component({
  selector: 'app-regex-tester',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex items-center justify-between gap-2">
        <label for="regex-pattern" class="text-sm leading-5 font-semibold">Pattern</label>
        <app-share-button [path]="tool.path" [data]="shareData()" />
      </div>
      <div class="mt-2 flex items-stretch rounded-xl border bg-page font-mono text-base" [class]="error() ? 'border-danger' : 'border-line'">
        <span class="grid place-items-center pl-3 text-muted" aria-hidden="true">/</span>
        <input
          id="regex-pattern"
          class="min-w-0 flex-1 bg-transparent px-1 py-2.5 outline-none"
          spellcheck="false"
          autocomplete="off"
          placeholder="\\d{3}-\\d{4}"
          [value]="pattern()"
          (input)="pattern.set($any($event.target).value)"
        />
        <span class="grid place-items-center pr-3 text-muted" aria-hidden="true">/{{ flags() }}</span>
      </div>
      <fieldset class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend class="sr-only">Flags</legend>
        @for (f of flagList; track f.flag) {
          <label class="flex items-center gap-1.5" [title]="f.hint">
            <input type="checkbox" class="size-4 accent-brand" [checked]="flags().includes(f.flag)" (change)="toggleFlag(f.flag)" />
            <span class="font-mono font-semibold">{{ f.flag }}</span> {{ f.label }}
          </label>
        }
      </fieldset>
      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        <span class="text-sm text-muted">Common patterns:</span>
        @for (item of library; track item.label) {
          <button type="button" class="btn-small" (click)="useLibrary(item)">{{ item.label }}</button>
        }
      </div>

      <div class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (result(); as r) {
          <p class="flex items-center gap-2 font-semibold">
            <span class="grid size-6 place-items-center rounded-full text-white" [class]="r.matches.length ? 'bg-success' : 'bg-muted'">
              <app-icon [path]="r.matches.length ? icons.check : icons.close" [size]="14" />
            </span>
            {{ matchSummary() }}
          </p>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <label for="regex-text" class="text-sm leading-5 font-semibold">Test text</label>
          <textarea
            id="regex-text"
            rows="10"
            class="field-code"
            spellcheck="false"
            placeholder="Paste text to test the pattern on."
            [value]="text()"
            (input)="text.set($any($event.target).value)"
          ></textarea>
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Matches highlighted</span>
          <div class="field-code min-h-60 overflow-auto break-words whitespace-pre-wrap" aria-label="Test text with matches highlighted">
            @for (part of parts(); track $index) {
              @if (part.match === null) {
                <span>{{ part.text }}</span>
              } @else {
                <mark class="rounded text-ink" [class]="part.match % 2 ? 'bg-warning/40' : 'bg-brand/25'" [title]="'Match ' + (part.match + 1)">{{ part.text }}</mark>
              }
            }
          </div>
        </div>
      </div>

      @if (result()?.matches?.length) {
        <section class="mt-8" aria-labelledby="matches-heading">
          <h2 id="matches-heading" class="text-xl leading-7">Matches and groups</h2>
          <div class="mt-3 max-h-80 overflow-auto rounded-xl border border-line">
            <table class="w-full text-left text-sm">
              <thead class="sticky top-0 bg-surface">
                <tr>
                  <th scope="col" class="px-3 py-2 font-semibold">#</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Match</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Position</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Groups</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                @for (m of result()!.matches.slice(0, 200); track m.index; let i = $index) {
                  <tr class="align-top">
                    <td class="px-3 py-1.5 text-muted">{{ i + 1 }}</td>
                    <td class="px-3 py-1.5 font-mono break-all">{{ m.text || '(empty)' }}</td>
                    <td class="px-3 py-1.5 font-mono text-muted">{{ m.index }}–{{ m.end }}</td>
                    <td class="px-3 py-1.5 font-mono break-all">
                      @for (g of m.groups; track $index; let gi = $index) {
                        <span class="mr-3 inline-block"><span class="text-muted">{{ g.name ?? gi + 1 }}:</span> {{ g.value ?? '—' }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="mt-8" aria-labelledby="replace-heading">
        <h2 id="replace-heading" class="text-xl leading-7">Replace</h2>
        <input
          class="field mt-3 w-full font-mono"
          spellcheck="false"
          aria-label="Replacement"
          placeholder="Replacement, for example $2-$1 or $<year>"
          [value]="replacement()"
          (input)="replacement.set($any($event.target).value)"
        />
        @if (replacement() && result()?.replaced !== null && result()?.replaced !== undefined) {
          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">Result</span>
            <app-copy-button [text]="result()!.replaced!" ariaLabel="Copy replaced text" />
          </div>
          <pre class="field-code mt-2 max-h-60 overflow-auto break-words whitespace-pre-wrap" aria-label="Replaced text">{{ result()!.replaced }}</pre>
        }
      </section>

      @if (tokens().length) {
        <section class="mt-8" aria-labelledby="explain-heading">
          <h2 id="explain-heading" class="text-xl leading-7">What the pattern means</h2>
          <ul class="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
            @for (t of tokens(); track $index) {
              <li class="flex gap-4 px-4 py-2">
                <code class="w-32 shrink-0 font-mono font-semibold break-all text-brand">{{ t.token }}</code>
                <span>{{ t.meaning }}</span>
              </li>
            }
          </ul>
        </section>
      }

      <section class="mt-8" aria-labelledby="code-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="code-heading" class="text-xl leading-7">Use it in code</h2>
          <select class="field" aria-label="Language" [value]="codeLanguage()" (change)="codeLanguage.set($any($event.target).value)">
            @for (l of codeLanguages; track l.id) {
              <option [value]="l.id">{{ l.label }}</option>
            }
          </select>
        </div>
        <div class="mt-3 flex justify-end"><app-copy-button [text]="code()" ariaLabel="Copy code" /></div>
        <pre class="field-code mt-2 overflow-x-auto">{{ code() }}</pre>
        <p class="mt-2 text-sm text-muted">The tester uses JavaScript’s regex engine. Most patterns work the same elsewhere, but lookbehind and \\p{{ '{' }}…{{ '}' }} classes differ between languages.</p>
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Patterns run in your browser. Your text is never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class RegexTester {
  protected readonly tool = TOOLS.find((t) => t.path === 'regex-tester')!;
  protected readonly content = REGEX_CONTENT;
  protected readonly icons = ICONS;
  protected readonly flagList = FLAGS;
  protected readonly library = LIBRARY;
  protected readonly codeLanguages = CODE_LANGUAGES;

  protected readonly pattern = signal('(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})');
  protected readonly flags = signal('g');
  protected readonly text = signal('Release 2026-10-31 was patched on 2026-11-02 and 2026-11-15.');
  protected readonly replacement = signal('');
  protected readonly codeLanguage = signal('javascript');
  protected readonly result = signal<RunResult | null>(null);
  private readonly runError = signal<string | null>(null);

  private readonly compiled = computed(() => compile(this.pattern(), this.flags()));
  protected readonly error = computed(() => {
    const compiled = this.compiled();
    return compiled.ok ? this.runError() : compiled.error;
  });
  protected readonly parts = computed(() => segments(this.text(), this.result()?.matches ?? []));
  protected readonly tokens = computed(() => (this.compiled().ok ? explain(this.pattern()) : []));
  protected readonly code = computed(() => asCode(this.pattern(), this.flags(), this.codeLanguage()));
  protected readonly matchSummary = computed(() => {
    const r = this.result();
    if (!r) return '';
    const n = r.matches.length;
    if (!n) return 'No match.';
    return r.truncated ? `More than ${MATCH_LIMIT} matches; the first ${MATCH_LIMIT} are shown.` : `${n} ${n === 1 ? 'match' : 'matches'}.`;
  });
  protected readonly shareData = computed(() =>
    this.pattern() ? { pattern: this.pattern(), flags: this.flags(), text: this.text(), replacement: this.replacement() } : null,
  );

  private readonly runner = new RegexRunner();
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private runId = 0;

  constructor() {
    effect(() => {
      const compiled = this.compiled();
      const args = [this.pattern(), this.flags(), this.text(), this.replacement() || null] as const;
      clearTimeout(this.timer);
      if (!compiled.ok || !args[0]) {
        this.result.set(null);
        return;
      }
      this.timer = setTimeout(() => void this.execute(...args), DEBOUNCE_MS);
    });
    onSharedInput((data) => {
      this.pattern.set(data['pattern'] ?? '');
      this.flags.set(data['flags'] ?? 'g');
      this.text.set(data['text'] ?? '');
      this.replacement.set(data['replacement'] ?? '');
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.runner.destroy();
    });
  }

  protected toggleFlag(flag: string): void {
    this.flags.update((f) => (f.includes(flag) ? f.replace(flag, '') : [...f + flag].sort((a, b) => 'dgimsuy'.indexOf(a) - 'dgimsuy'.indexOf(b)).join('')));
  }

  protected useLibrary(item: (typeof LIBRARY)[number]): void {
    this.pattern.set(item.pattern);
    this.flags.set(item.flags.includes('g') ? item.flags : `g${item.flags}`);
    this.text.set(item.sample);
    this.analytics.track('regex-library', { pattern: item.label });
  }

  private async execute(pattern: string, flags: string, text: string, replacement: string | null): Promise<void> {
    const id = ++this.runId;
    const outcome = await this.runner.run(pattern, flags, text, replacement);
    if (id !== this.runId) return;
    if (outcome.ok) {
      this.result.set(outcome.result);
      this.runError.set(null);
    } else {
      this.result.set(null);
      this.runError.set(outcome.error || null);
    }
  }
}
