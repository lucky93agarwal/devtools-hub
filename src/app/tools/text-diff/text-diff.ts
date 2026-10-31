import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { DiffStats, DiffViewer } from '../../shared/code-editor/diff-viewer';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { describeStats } from '../json-compare/compare-tools';
import { TEXT_DIFF_CONTENT, TEXT_DIFF_SAMPLE } from './content';

const DEBOUNCE_MS = 300;

@Component({
  selector: 'app-text-diff',
  imports: [Icon, CodeEditor, DiffViewer, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!original() && !changed()" (click)="swap()">Swap sides</button>
          <button type="button" class="btn-small" [disabled]="!original() && !changed()" (click)="clear()">Clear</button>
          <app-share-button [path]="tool.path" [data]="original() || changed() ? { original: original(), changed: changed() } : null" />
        </div>
        <label class="flex items-center gap-2 text-sm leading-5">
          <input type="checkbox" class="size-4 accent-brand" [checked]="ignoreWhitespace()" (change)="ignoreWhitespace.set($any($event.target).checked)" />
          Ignore spaces at the start and end of lines
        </label>
        <label class="flex items-center gap-2 text-sm leading-5">
          <input type="checkbox" class="size-4 accent-brand" [checked]="inline()" (change)="inline.set($any($event.target).checked)" />
          One column
        </label>
        <label class="flex items-center gap-2 text-sm leading-5">
          <input type="checkbox" class="size-4 accent-brand" [checked]="onlyChanges()" (change)="onlyChanges.set($any($event.target).checked)" />
          Hide unchanged lines
        </label>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Original</span>
          <app-code-editor class="h-56 lg:h-72" ariaLabel="Original text" placeholder="Paste the original text here." [value]="original()" (valueChange)="onInput('original', $event)" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">Changed</span>
          <app-code-editor class="h-56 lg:h-72" ariaLabel="Changed text" placeholder="Paste the changed text here." [value]="changed()" (valueChange)="onInput('changed', $event)" />
        </div>
      </div>

      <section class="mt-8" aria-labelledby="diff-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="diff-heading" class="text-xl leading-7">Differences</h2>
          <p class="flex flex-wrap gap-x-4 gap-y-1 text-sm leading-5 text-muted">
            <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-danger/40" aria-hidden="true"></span>Removed</span>
            <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-success/40" aria-hidden="true"></span>Added</span>
          </p>
        </div>
        <p id="diff-status" class="mt-2 min-h-6 font-semibold" aria-live="polite">{{ status() }}</p>
        @if (hasText()) {
          <app-diff-viewer
            class="mt-2 h-[28rem] lg:h-[32rem]"
            originalLabel="Original text"
            modifiedLabel="Changed text"
            [original]="settled().original"
            [modified]="settled().changed"
            [sideBySide]="!inline()"
            [ignoreWhitespace]="ignoreWhitespace()"
            [onlyChanges]="onlyChanges()"
            (diffUpdated)="stats.set($event)"
          />
        } @else {
          <p class="card mt-2 grid h-40 place-items-center p-4 text-center text-sm text-muted">Paste text on both sides to compare them.</p>
        }
      </section>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Both texts are compared in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class TextDiff {
  protected readonly tool = TOOLS.find((t) => t.path === 'text-diff')!;
  protected readonly content = TEXT_DIFF_CONTENT;
  protected readonly icons = ICONS;

  protected readonly original = signal('');
  protected readonly changed = signal('');
  protected readonly settled = signal({ original: '', changed: '' });
  protected readonly ignoreWhitespace = signal(false);
  protected readonly inline = signal(false);
  protected readonly onlyChanges = signal(false);
  protected readonly stats = signal<DiffStats | null>(null);

  protected readonly hasText = computed(() => !!(this.settled().original || this.settled().changed));
  protected readonly status = computed(() => {
    const stats = this.stats();
    if (!this.hasText() || !stats) return '';
    return stats.places ? `Differences in ${describeStats(stats)}.` : 'No differences. The texts are the same.';
  });

  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    onSharedInput((data) => {
      this.original.set(data['original'] ?? '');
      this.changed.set(data['changed'] ?? '');
      this.settle();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(side: 'original' | 'changed', value: string): void {
    if (value === this[side]()) return;
    this[side].set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settle(), DEBOUNCE_MS);
  }

  protected loadSample(): void {
    this.original.set(TEXT_DIFF_SAMPLE.original);
    this.changed.set(TEXT_DIFF_SAMPLE.changed);
    this.settle();
    this.analytics.track('text-diff-sample', {});
  }

  protected swap(): void {
    const original = this.original();
    this.original.set(this.changed());
    this.changed.set(original);
    this.settle();
  }

  protected clear(): void {
    this.original.set('');
    this.changed.set('');
    this.settle();
  }

  private settle(): void {
    clearTimeout(this.timer);
    this.stats.set(null);
    this.settled.set({ original: this.original(), changed: this.changed() });
  }
}
