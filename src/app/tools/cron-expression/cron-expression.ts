import { Component, afterNextRender, computed, signal } from '@angular/core';
import cronstrue from 'cronstrue';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { CRON_CONTENT } from './content';
import { MACROS, PRESETS, nextRuns, parseCron } from './cron';

const FIELD_NAMES = ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'];

@Component({
  selector: 'app-cron-expression',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex gap-2">
        <label for="cron-input" class="sr-only">Cron expression</label>
        <input
          id="cron-input"
          class="field min-w-0 flex-1 font-mono text-lg"
          spellcheck="false"
          autocomplete="off"
          placeholder="*/5 * * * *"
          [value]="expression()"
          (input)="expression.set($any($event.target).value)"
        />
        <app-copy-button [text]="expression().trim()" />
        <app-share-button [path]="tool.path" [data]="expression().trim() ? { input: expression() } : null" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        @for (preset of presets; track preset.expression) {
          <button type="button" class="btn-small" (click)="expression.set(preset.expression)">{{ preset.label }}</button>
        }
      </div>

      <div class="mt-6 min-h-16" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5">{{ message }}</p>
        } @else if (description(); as text) {
          <p class="font-heading text-2xl leading-8 font-semibold">“{{ text }}”</p>
        }
      </div>

      @if (fieldRows().length) {
        <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          @for (row of fieldRows(); track row.name) {
            <div class="card p-3 text-center">
              <p class="font-mono text-lg font-semibold break-all">{{ row.value }}</p>
              <p class="mt-1 text-xs text-muted">{{ row.name }}</p>
            </div>
          }
        </div>
      }

      <section class="mt-10" aria-labelledby="runs-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="runs-heading" class="text-xl leading-7">Next {{ count }} runs</h2>
          <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Time zone">
            @for (option of [false, true]; track option) {
              <button
                type="button"
                role="radio"
                class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
                [class]="utc() === option ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
                [attr.aria-checked]="utc() === option"
                (click)="utc.set(option)"
              >
                {{ option ? 'UTC' : 'My time zone' }}
              </button>
            }
          </div>
        </div>
        @if (!now()) {
          <p class="mt-3 text-sm text-muted">Run times appear once the page has loaded.</p>
        } @else if (runs().length) {
          <ol class="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line">
            @for (run of runs(); track run.getTime()) {
              <li class="flex flex-wrap justify-between gap-x-4 px-4 py-2.5 text-sm">
                <span class="font-semibold">{{ formatRun(run) }}</span>
                <span class="font-mono text-muted">{{ run.toISOString() }}</span>
              </li>
            }
          </ol>
        } @else if (!error() && expression().trim()) {
          <p class="mt-3 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm leading-5">
            This schedule never runs in the next five years, for example 31 February.
          </p>
        }
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Worked out in your browser. Your servers may use a different time zone than you, so check which one they use.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CronExpression {
  protected readonly tool = TOOLS.find((t) => t.path === 'cron-expression')!;
  protected readonly content = CRON_CONTENT;
  protected readonly icons = ICONS;
  protected readonly presets = PRESETS;
  protected readonly count = 10;

  protected readonly expression = signal('30 9 * * 1-5');
  protected readonly utc = signal(false);
  /** Set in the browser; the prerendered page has no "now" to count from. */
  protected readonly now = signal(0);

  private readonly parsed = computed(() => parseCron(this.expression()));
  protected readonly error = computed(() => {
    const result = this.parsed();
    return result.ok ? null : result.error || null;
  });
  protected readonly description = computed(() => {
    const result = this.parsed();
    if (!result.ok) return '';
    try {
      return cronstrue.toString(MACROS[this.expression().trim().toLowerCase()] ?? this.expression().trim(), {
        use24HourTimeFormat: true,
        throwExceptionOnParseError: true,
        verbose: true,
      });
    } catch {
      return '';
    }
  });
  protected readonly fieldRows = computed(() => {
    const result = this.parsed();
    if (!result.ok) return [];
    const names = result.cron.seconds ? ['Second', ...FIELD_NAMES] : FIELD_NAMES;
    return result.cron.fields.map((value, i) => ({ name: names[i], value }));
  });
  private readonly hasSeconds = computed(() => {
    const result = this.parsed();
    return result.ok && result.cron.seconds !== null;
  });
  protected readonly runs = computed(() => {
    const result = this.parsed();
    return result.ok && this.now() ? nextRuns(result.cron, new Date(this.now()), this.count, this.utc()) : [];
  });

  constructor() {
    afterNextRender(() => this.now.set(Date.now()));
    onSharedInput((data) => this.expression.set(data['input'] ?? ''));
  }

  protected formatRun(run: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: this.hasSeconds() ? '2-digit' : undefined,
      hourCycle: 'h23',
      timeZone: this.utc() ? 'UTC' : undefined,
      timeZoneName: 'short',
    }).format(run);
  }
}
