import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { TIMESTAMP_CONTENT } from './content';
import { UNIT_LABELS, Unit, currentZoneName, isoInZone, msToWallTime, parseTime, readable, relative, timeZones, wallTimeToMs } from './time';

@Component({
  selector: 'app-timestamp-converter',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="card mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 p-4" aria-label="Current Unix time">
        <div>
          <p class="text-sm text-muted">Unix time now (seconds)</p>
          <p class="font-mono text-2xl font-semibold tabular-nums">{{ now() ? nowSeconds() : '—' }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">Milliseconds</p>
          <p class="font-mono text-lg tabular-nums">{{ now() || '—' }}</p>
        </div>
        <div class="flex gap-2 sm:ml-auto">
          <app-copy-button [text]="now() ? '' + nowSeconds() : ''" label="Copy seconds" />
          <button type="button" class="btn-small" (click)="useNow()">Use now</button>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Time zone</span>
          <select class="field max-w-72" [value]="zone()" (change)="zone.set($any($event.target).value)">
            @for (z of zones; track z) {
              <option [value]="z" [selected]="z === zone()">{{ z }}</option>
            }
          </select>
        </label>
        @if (zone() !== localZone()) {
          <button type="button" class="btn-small" (click)="zone.set(localZone())">Use my time zone ({{ localZone() }})</button>
        }
      </div>

      <section class="mt-8" aria-labelledby="to-date-heading">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="to-date-heading" class="text-xl leading-7">Timestamp to date</h2>
          <app-share-button [path]="tool.path" [data]="input().trim() ? { input: input() } : null" />
        </div>
        <div class="mt-4 flex flex-wrap gap-3">
          <label for="ts-input" class="sr-only">Unix timestamp or date</label>
          <input
            id="ts-input"
            class="field min-w-0 flex-1 font-mono text-base"
            spellcheck="false"
            placeholder="1730000000, 1730000000000 or 2026-10-31T12:00:00Z"
            [value]="input()"
            (input)="input.set($any($event.target).value)"
          />
          <label class="flex items-center gap-2 text-sm leading-5">
            <span class="font-semibold">Unit</span>
            <select class="field" [value]="unit()" (change)="unit.set($any($event.target).value)">
              <option value="auto">Detect</option>
              @for (u of units; track u) {
                <option [value]="u">{{ unitLabels[u] }}</option>
              }
            </select>
          </label>
        </div>
        <div class="mt-3" aria-live="polite">
          @if (parsed(); as p) {
            @if (p.ok) {
              @if (p.unit !== 'date') {
                <p class="mb-3 text-sm text-muted">Read as {{ unitLabels[p.unit] }}.</p>
              }
              <dl class="flex flex-col divide-y divide-line rounded-xl border border-line">
                @for (row of rows(); track row.label) {
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <dt class="w-full shrink-0 sm:w-40 text-sm font-semibold">{{ row.label }}</dt>
                    <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
                    <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
                  </div>
                }
              </dl>
            } @else if (p.error) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5">{{ p.error }}</p>
            }
          }
        </div>
      </section>

      <section class="mt-10" aria-labelledby="to-ts-heading">
        <h2 id="to-ts-heading" class="text-xl leading-7">Date to timestamp</h2>
        <label class="mt-4 flex flex-col gap-1 text-sm leading-5 sm:w-fit">
          <span class="font-semibold">Date and time in {{ zone() }}</span>
          <input type="datetime-local" step="1" class="field font-mono" [value]="wall()" (input)="wall.set($any($event.target).value)" />
        </label>
        @if (wallMs(); as ms) {
          <dl class="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line">
            @for (row of [{ label: 'Unix seconds', value: '' + Math.floor(ms / 1000) }, { label: 'Unix milliseconds', value: '' + ms }, { label: 'ISO 8601 (UTC)', value: iso(ms) }]; track row.label) {
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <dt class="w-full shrink-0 sm:w-40 text-sm font-semibold">{{ row.label }}</dt>
                <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
                <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
              </div>
            }
          </dl>
        }
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Converted in your browser with its built-in time zone data.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class TimestampConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'timestamp-converter')!;
  protected readonly content = TIMESTAMP_CONTENT;
  protected readonly icons = ICONS;
  protected readonly Math = Math;
  protected readonly units: Unit[] = ['s', 'ms', 'us', 'ns'];
  protected readonly unitLabels = UNIT_LABELS;
  protected readonly zones = timeZones();

  /** Zero until the page runs in the browser, so the prerendered page shows no stale time. */
  protected readonly now = signal(0);
  protected readonly nowSeconds = computed(() => Math.floor(this.now() / 1000));
  protected readonly localZone = signal('UTC');
  protected readonly zone = signal('UTC');
  protected readonly input = signal('');
  protected readonly unit = signal<Unit | 'auto'>('auto');
  protected readonly wall = signal('');

  protected readonly parsed = computed(() => (this.input().trim() ? parseTime(this.input(), this.unit()) : null));
  protected readonly rows = computed(() => {
    const p = this.parsed();
    if (!p?.ok) return [];
    const ms = Math.round(p.ms);
    const zone = this.zone();
    return [
      { label: `In ${zone}`, value: readable(ms, zone) },
      { label: 'ISO 8601', value: isoInZone(ms, zone) },
      { label: 'ISO 8601 (UTC)', value: this.iso(ms) },
      { label: 'RFC 2822 / HTTP', value: new Date(ms).toUTCString() },
      { label: 'Relative', value: this.now() ? relative(ms, this.now()) : '' },
      { label: 'Unix seconds', value: String(Math.floor(ms / 1000)) },
      { label: 'Unix milliseconds', value: String(ms) },
    ].filter((row) => row.value);
  });
  protected readonly wallMs = computed(() => (this.wall() ? wallTimeToMs(this.wall(), this.zone()) : null));

  constructor() {
    let timer: ReturnType<typeof setInterval> | undefined;
    afterNextRender(() => {
      const local = currentZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      this.localZone.set(local);
      this.zone.set(local);
      this.now.set(Date.now());
      this.useNow();
      timer = setInterval(() => this.now.set(Date.now()), 1000);
    });
    onSharedInput((data) => {
      this.input.set(data['input'] ?? '');
      this.unit.set('auto');
    });
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected iso(ms: number): string {
    try {
      return new Date(ms).toISOString();
    } catch {
      return '';
    }
  }

  protected useNow(): void {
    const now = Date.now();
    this.input.set(String(Math.floor(now / 1000)));
    this.unit.set('auto');
    this.wall.set(msToWallTime(now, this.zone()));
  }
}
