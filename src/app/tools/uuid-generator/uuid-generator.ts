import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { UUID_CONTENT } from './content';
import { IdKind, NANOID_ALPHABET, formatId, generate, inspect } from './ids';

const MAX_COUNT = 1000;

@Component({
  selector: 'app-uuid-generator',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap rounded-3xl border border-line p-0.5 sm:w-fit sm:rounded-full" role="radiogroup" aria-label="Type of id">
        @for (option of kinds; track option.value) {
          <button
            type="button"
            role="radio"
            class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="kind() === option.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-checked]="kind() === option.value"
            (click)="setKind(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </div>
      <p class="mt-3 text-sm text-muted">{{ hint() }}</p>

      <div class="mt-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">How many</span>
          <input type="number" min="1" [max]="maxCount" class="field w-28" [value]="count()" (change)="setCount($any($event.target).valueAsNumber)" />
        </label>
        @if (kind() === 'uuid4' || kind() === 'uuid7') {
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="uppercase()" (change)="uppercase.set($any($event.target).checked)" />
            Uppercase
          </label>
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="hyphens()" (change)="hyphens.set($any($event.target).checked)" />
            Hyphens
          </label>
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="braces()" (change)="braces.set($any($event.target).checked)" />
            Braces {{ '{ }' }}
          </label>
        }
        @if (kind() === 'nanoid') {
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Length</span>
            <input type="number" min="2" max="256" class="field w-24" [value]="nanoSize()" (change)="setNanoSize($any($event.target).valueAsNumber)" />
          </label>
          <label class="flex min-w-60 flex-1 flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Alphabet</span>
            <input class="field font-mono" spellcheck="false" [value]="alphabet()" (change)="alphabet.set($any($event.target).value || defaultAlphabet)" />
          </label>
        }
        <button type="button" class="btn-primary" (click)="regenerate()">Generate</button>
      </div>

      @if (problem(); as message) {
        <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ message }}</p>
      }

      <div class="mt-6 flex items-center justify-between gap-2">
        <span class="text-sm leading-5 font-semibold">{{ lines().length === 1 ? 'Your id' : lines().length + ' ids' }}</span>
        <div class="flex gap-2">
          <app-copy-button [text]="output()" [label]="lines().length > 1 ? 'Copy all' : 'Copy'" />
          <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
            <app-icon [path]="icons.download" [size]="16" />
            Download
          </button>
        </div>
      </div>
      <textarea
        rows="8"
        class="field-code mt-2"
        readonly
        aria-label="Generated ids"
        [value]="output()"
      ></textarea>

      <section class="mt-12" aria-labelledby="inspect-heading">
        <h2 id="inspect-heading" class="text-xl leading-7">Inspect a UUID or ULID</h2>
        <label for="inspect-input" class="sr-only">UUID or ULID to inspect</label>
        <input
          id="inspect-input"
          class="field mt-4 w-full font-mono"
          spellcheck="false"
          placeholder="Paste a UUID such as 0190c3a2-7b1e-7cc1-9a2f-3d4e5f607182"
          [value]="toInspect()"
          (input)="toInspect.set($any($event.target).value)"
        />
        <div class="mt-3 text-sm leading-5" aria-live="polite">
          @if (inspection(); as info) {
            <dl class="card grid gap-x-6 gap-y-2 p-4 sm:grid-cols-[max-content_1fr]">
              <dt class="font-semibold">Type</dt>
              <dd class="text-muted">{{ info.kind }}</dd>
              @for (row of info.details; track row.label) {
                <dt class="font-semibold">{{ row.label }}</dt>
                <dd class="font-mono break-all text-muted">{{ row.value }}</dd>
              }
            </dl>
          } @else if (toInspect().trim()) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">This is not a UUID or ULID.</p>
          }
        </div>
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Ids are made in your browser with its secure random number generator.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class UuidGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'uuid-generator')!;
  protected readonly content = UUID_CONTENT;
  protected readonly icons = ICONS;
  protected readonly maxCount = MAX_COUNT;
  protected readonly defaultAlphabet = NANOID_ALPHABET;
  protected readonly kinds: { value: IdKind; label: string; hint: string }[] = [
    { value: 'uuid4', label: 'UUID v4', hint: 'Random UUID, the most common kind. 122 random bits.' },
    { value: 'uuid7', label: 'UUID v7', hint: 'Starts with the time, so new ids sort after older ones. Good for database keys.' },
    { value: 'ulid', label: 'ULID', hint: '26 characters, sortable by time, no hyphens, case-insensitive.' },
    { value: 'nanoid', label: 'NanoID', hint: 'Short URL-safe random id. Choose the length and characters.' },
  ];

  protected readonly kind = signal<IdKind>('uuid4');
  protected readonly count = signal(5);
  protected readonly uppercase = signal(false);
  protected readonly hyphens = signal(true);
  protected readonly braces = signal(false);
  protected readonly nanoSize = signal(21);
  protected readonly alphabet = signal(NANOID_ALPHABET);
  protected readonly raw = signal<string[]>([]);
  protected readonly problem = signal<string | null>(null);
  protected readonly toInspect = signal('');

  protected readonly hint = computed(() => this.kinds.find((k) => k.value === this.kind())!.hint);
  protected readonly lines = computed(() =>
    this.raw().map((id) => formatId(id, this.kind(), { uppercase: this.uppercase(), hyphens: this.hyphens(), braces: this.braces() })),
  );
  protected readonly output = computed(() => this.lines().join('\n'));
  protected readonly inspection = computed(() => inspect(this.toInspect()));

  private readonly analytics = inject(Analytics);

  constructor() {
    // Made in the browser only, so every visitor gets their own ids rather than ones baked into the page.
    afterNextRender(() => this.regenerate(false));
    onSharedInput((data) => this.toInspect.set(data['inspect'] ?? ''));
  }

  protected setKind(kind: IdKind): void {
    this.kind.set(kind);
    this.regenerate(false);
  }

  protected setCount(value: number): void {
    this.count.set(Math.min(MAX_COUNT, Math.max(1, Math.round(value) || 1)));
    this.regenerate(false);
  }

  protected setNanoSize(value: number): void {
    this.nanoSize.set(Math.min(256, Math.max(2, Math.round(value) || 21)));
    this.regenerate(false);
  }

  protected regenerate(track = true): void {
    try {
      this.raw.set(generate(this.kind(), this.count(), this.nanoSize(), this.alphabet()));
      this.problem.set(null);
      if (track) this.analytics.track('id-generate', { kind: this.kind(), count: this.count() });
    } catch (error) {
      this.problem.set(error instanceof Error ? error.message : 'Could not make ids.');
    }
  }

  protected download(): void {
    downloadText(this.output() + '\n', `${this.kind()}-ids.txt`, 'text/plain');
  }
}
