import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { ENV_CONTENT, ENV_SAMPLE, OBJECT_SAMPLE } from './content';
import { ENV_TARGETS, EnvIssue, EnvTarget, convertEnv, objectToEnv, parseEnv } from './env';

type Direction = 'from-env' | 'to-env';
const DEBOUNCE_MS = 250;

@Component({
  selector: 'app-env-converter',
  imports: [Icon, CodeEditor, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap rounded-3xl border border-line p-0.5 sm:w-fit sm:rounded-full" role="tablist" aria-label="Direction">
        @for (tab of directions; track tab.value) {
          <button
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="direction() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-selected]="direction() === tab.value"
            (click)="setDirection(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <div class="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        @if (direction() === 'from-env') {
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Convert to</span>
            <select class="field" [value]="target()" (change)="target.set($any($event.target).value)">
              @for (t of targets; track t.value) {
                <option [value]="t.value">{{ t.label }}</option>
              }
            </select>
          </label>
          @if (target() === 'configmap' || target() === 'secret') {
            <label class="flex flex-col gap-1 text-sm leading-5">
              <span class="font-semibold">Name</span>
              <input class="field w-48 font-mono" spellcheck="false" [value]="name()" (input)="name.set($any($event.target).value || 'app-config')" />
            </label>
          }
        } @else {
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="upper()" (change)="upper.set($any($event.target).checked)" />
            Write names in UPPER_SNAKE_CASE (db.host becomes DB_HOST)
          </label>
        }
        <div class="flex gap-2">
          <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!input()" (click)="setInput('')">Clear</button>
        </div>
      </div>

      <div class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (problem(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (output()) {
          <p class="flex items-center gap-2 font-semibold">
            <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
            {{ summary() }}
          </p>
        } @else {
          <p class="text-muted">{{ direction() === 'from-env' ? 'Paste a .env file on the left.' : 'Paste a JSON or YAML object on the left.' }}</p>
        }
        @for (issue of issues(); track $index) {
          <button
            type="button"
            class="mt-2 flex w-full flex-wrap items-center gap-x-3 rounded-xl border px-4 py-2 text-left"
            [class]="issue.severity === 'error' ? 'border-danger bg-danger/10' : 'border-warning bg-warning/10'"
            (click)="goTo(issue)"
          >
            <span><span class="font-semibold">Line {{ issue.line }}:</span> {{ issue.message }}</span>
            <span class="font-semibold underline underline-offset-2">Go to line</span>
          </button>
        }
      </div>

      <div class="mt-2 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">{{ direction() === 'from-env' ? '.env file' : 'JSON or YAML' }}</span>
          <app-code-editor
            #inputEditor
            class="h-80 lg:h-[28rem]"
            [language]="direction() === 'to-env' ? 'json' : 'plaintext'"
            ariaLabel="Input"
            [placeholder]="direction() === 'from-env' ? 'DATABASE_URL=postgres://localhost:5432/app' : '{&quot;database&quot;: {&quot;host&quot;: &quot;localhost&quot;}}'"
            [value]="input()"
            (valueChange)="onInput($event)"
          />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">{{ outputLabel() }}</span>
            <div class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
                <app-icon [path]="icons.download" [size]="16" />
                Download
              </button>
            </div>
          </div>
          <app-code-editor
            class="h-80 lg:h-[28rem]"
            [language]="direction() === 'from-env' && target() === 'json' ? 'json' : 'plaintext'"
            ariaLabel="Result"
            placeholder="The result appears here."
            [readOnly]="true"
            [value]="output()"
          />
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Secrets stay on your device: everything is converted in your browser.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class EnvConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'env-converter')!;
  protected readonly content = ENV_CONTENT;
  protected readonly icons = ICONS;
  protected readonly targets = ENV_TARGETS;
  protected readonly directions = [
    { value: 'from-env' as const, label: '.env to JSON, YAML and more' },
    { value: 'to-env' as const, label: 'JSON or YAML to .env' },
  ];

  protected readonly direction = signal<Direction>('from-env');
  protected readonly target = signal<EnvTarget>('json');
  protected readonly name = signal('app-config');
  protected readonly upper = signal(true);
  protected readonly input = signal('');
  private readonly settled = signal('');
  protected readonly output = signal('');
  protected readonly problem = signal<string | null>(null);
  protected readonly issues = signal<EnvIssue[]>([]);
  private readonly count = signal(0);

  protected readonly outputLabel = computed(() =>
    this.direction() === 'to-env' ? '.env file' : ENV_TARGETS.find((t) => t.value === this.target())!.label,
  );
  protected readonly summary = computed(() => {
    const n = this.count();
    return `${n} ${n === 1 ? 'variable' : 'variables'} converted.`;
  });

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;

  constructor() {
    effect(() => {
      const text = this.settled();
      const direction = this.direction();
      const target = this.target();
      const name = this.name();
      const upper = this.upper();
      void this.convert(text, direction, target, name, upper);
    });
    onSharedInput((data) => {
      this.direction.set('from-env');
      this.setInput(data['input'] ?? '');
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected setDirection(direction: Direction): void {
    if (direction === this.direction()) return;
    this.direction.set(direction);
    this.setInput('');
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

  protected loadSample(): void {
    this.setInput(this.direction() === 'from-env' ? ENV_SAMPLE : OBJECT_SAMPLE);
  }

  protected goTo(issue: EnvIssue): void {
    this.inputEditor().revealError(issue.line, 1);
  }

  protected download(): void {
    if (this.direction() === 'to-env') {
      // Browsers drop a leading dot from downloaded names.
      downloadText(this.output(), 'env', 'text/plain');
      return;
    }
    const target = ENV_TARGETS.find((t) => t.value === this.target())!;
    downloadText(this.output(), `env.${target.extension}`, 'text/plain');
  }

  private async convert(text: string, direction: Direction, target: EnvTarget, name: string, upper: boolean): Promise<void> {
    const run = ++this.run;
    this.problem.set(null);
    if (!text.trim()) {
      this.output.set('');
      this.issues.set([]);
      return;
    }
    if (direction === 'from-env') {
      const parsed = parseEnv(text);
      this.issues.set(parsed.issues);
      this.count.set(parsed.entries.length);
      this.output.set(parsed.entries.length ? convertEnv(parsed.entries, target, name) : '');
      if (!parsed.entries.length && !parsed.issues.length) this.problem.set('No variables found. Lines look like NAME=value.');
      return;
    }
    this.issues.set([]);
    try {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const { parse } = await import('yaml');
        data = parse(text);
      }
      if (run !== this.run) return;
      const env = objectToEnv(data, upper);
      this.count.set(env.trim() ? env.trim().split('\n').length : 0);
      this.output.set(env);
    } catch (error) {
      if (run !== this.run) return;
      this.output.set('');
      const message = error instanceof Error ? error.message.split('\n')[0] : '';
      this.problem.set(`This is not a JSON or YAML object. ${message}`.trim());
    }
  }
}
