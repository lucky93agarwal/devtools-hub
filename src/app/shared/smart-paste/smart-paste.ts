import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Analytics } from '../../core/analytics';
import { Suggestion, detect } from '../../core/detect';
import { prefill } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { ICONS, Icon } from '../icon/icon';

const DEBOUNCE_MS = 150;

/** Paste anything: the box recognises it and offers the tools that can open it, with the data filled in. */
@Component({
  selector: 'app-smart-paste',
  imports: [Icon],
  template: `
    <div class="mx-auto max-w-2xl text-left">
      <label for="smart-paste" class="flex items-center gap-2 text-sm font-semibold">
        <app-icon [path]="icons.sparkle" [size]="16" class="text-brand" />
        Smart Paste: paste anything and pick a tool
      </label>
      <textarea
        id="smart-paste"
        rows="3"
        class="field-code mt-2 bg-page"
        spellcheck="false"
        placeholder="A JWT, JSON, cURL command, timestamp, cron expression, URL, colour, certificate, SQL…"
        [value]="text()"
        (input)="onInput($any($event.target).value)"
      ></textarea>
      <div class="mt-2 min-h-6" aria-live="polite">
        @for (d of detections(); track d.kind) {
          <div class="mt-2">
            <p class="text-sm"><span class="text-muted">Looks like </span><span class="font-semibold">{{ d.kind }}</span></p>
            <div class="mt-1.5 flex flex-wrap gap-2">
              @for (s of d.suggestions; track s.path + s.action) {
                <button type="button" class="btn-small" (click)="open(s)">
                  {{ s.action }}
                  <span class="text-muted">· {{ toolName(s.path) }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SmartPaste {
  protected readonly icons = ICONS;
  protected readonly text = signal('');
  private readonly settled = signal('');
  protected readonly detections = computed(() => detect(this.settled()));

  private readonly router = inject(Router);
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(value: string): void {
    this.text.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set(value), DEBOUNCE_MS);
  }

  protected toolName(path: string): string {
    const tool = TOOLS.find((t) => t.path === path);
    return tool?.shortName ?? tool?.name ?? path;
  }

  protected open(suggestion: Suggestion): void {
    prefill(suggestion.path, suggestion.data);
    this.analytics.track('smart-paste', { tool: suggestion.path });
    void this.router.navigateByUrl('/' + suggestion.path);
  }
}
