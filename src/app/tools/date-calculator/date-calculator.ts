import { Component, afterNextRender, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { Duration, addDuration, describeDuration, difference, durationSeconds, emptyDuration, formatIsoDuration, parseIsoDuration } from './dates';

const CONTENT: ToolContent = {
  aboutHeading: 'About this date calculator',
  about:
    'Work out how long it is between two dates in years, months and days, total days and working days, add or ' +
    'subtract a duration from a date (with month ends handled the calendar way, so 31 January plus one month is the end ' +
    'of February), and read ISO 8601 durations such as P1Y2M10DT2H30M used by APIs, Java’s Duration, YouTube and ' +
    'Kubernetes. Dates are counted in UTC so daylight saving does not shift the answer.',
  steps: [
    'Under Between two dates, pick a start and an end date.',
    'Under Add or subtract, pick a date, fill in years, months, days or hours, and choose Add or Subtract.',
    'Under ISO 8601 duration, paste a duration to read it in words and seconds.',
  ],
  faq: [
    { question: 'Are holidays counted as working days?', answer: 'Working days are Monday to Friday. Public holidays differ by country and are not removed.' },
    { question: 'What is P1DT2H?', answer: 'An ISO 8601 duration: P starts it, 1D is one day, T separates the time part and 2H is two hours. PT2M is two minutes; P2M is two months.' },
    { question: 'How many seconds is a month?', answer: 'It depends on the month. When a single number is needed, this tool counts a month as 30 days and a year as 365 days, as many APIs do.' },
  ],
};

@Component({
  selector: 'app-date-calculator',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="date-calculator" [content]="content">
      <section aria-labelledby="between-heading">
        <h2 id="between-heading" class="text-xl leading-7">Between two dates</h2>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Start</span><input type="date" class="field" [value]="start()" (input)="start.set($any($event.target).value)" /></label>
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">End</span><input type="date" class="field" [value]="end()" (input)="end.set($any($event.target).value)" /></label>
        </div>
        @if (diff(); as d) {
          <p class="mt-4 font-heading text-2xl font-semibold" aria-live="polite">
            {{ d.years }} {{ d.years === 1 ? 'year' : 'years' }}, {{ d.months }} {{ d.months === 1 ? 'month' : 'months' }}, {{ d.days }} {{ d.days === 1 ? 'day' : 'days' }}{{ d.negative ? ' earlier' : '' }}
          </p>
          <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            @for (row of [{ l: 'Total days', v: d.totalDays }, { l: 'Weeks', v: d.weeks }, { l: 'Working days (Mon–Fri)', v: d.workingDays }, { l: 'Hours', v: d.totalHours }]; track row.l) {
              <div class="card p-3"><dt class="text-xs text-muted">{{ row.l }}</dt><dd class="font-mono text-lg font-semibold">{{ row.v.toLocaleString('en-US') }}</dd></div>
            }
          </dl>
        }
      </section>

      <section class="mt-10" aria-labelledby="add-heading">
        <h2 id="add-heading" class="text-xl leading-7">Add or subtract</h2>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Date and time (UTC)</span><input type="datetime-local" class="field" [value]="base()" (input)="base.set($any($event.target).value)" /></label>
          @for (f of fields; track f.key) {
            <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">{{ f.label }}</span><input type="number" min="0" class="field w-20" [value]="duration()[f.key]" (input)="setField(f.key, $any($event.target).valueAsNumber || 0)" /></label>
          }
          <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Add or subtract">
            @for (s of [1, -1]; track s) {
              <button type="button" role="radio" class="rounded-full px-4 py-1.5 text-sm font-semibold" [class]="sign() === s ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="sign() === s" (click)="sign.set($any(s))">{{ s === 1 ? 'Add' : 'Subtract' }}</button>
            }
          </div>
        </div>
        @if (added(); as a) {
          <p class="mt-4 text-sm text-muted" aria-live="polite">{{ sign() === 1 ? 'Plus' : 'Minus' }} {{ describe(duration()) }} ({{ iso(duration()) }}) is</p>
          <p class="font-heading text-2xl font-semibold">{{ a }}</p>
        }
      </section>

      <section class="mt-10" aria-labelledby="iso-heading">
        <h2 id="iso-heading" class="text-xl leading-7">ISO 8601 duration</h2>
        <input class="field mt-3 w-full max-w-md font-mono text-base" aria-label="ISO 8601 duration" spellcheck="false" placeholder="P1Y2M10DT2H30M" [value]="isoText()" (input)="isoText.set($any($event.target).value)" />
        @if (isoResult(); as r) {
          @if (r.ok) {
            <p class="mt-3 font-semibold" aria-live="polite">{{ describe(r.duration) }}</p>
            <p class="mt-1 flex items-center gap-2 text-sm text-muted">
              About {{ seconds(r.duration).toLocaleString('en-US') }} seconds
              <app-copy-button [text]="'' + seconds(r.duration)" label="Copy seconds" />
            </p>
          } @else {
            <p class="mt-3 text-sm text-danger">{{ r.error }}</p>
          }
        }
      </section>
    </app-tool-page>
  `,
})
export class DateCalculator {
  protected readonly content = CONTENT;
  protected readonly fields: { key: keyof Duration; label: string }[] = [
    { key: 'years', label: 'Years' },
    { key: 'months', label: 'Months' },
    { key: 'weeks', label: 'Weeks' },
    { key: 'days', label: 'Days' },
    { key: 'hours', label: 'Hours' },
    { key: 'minutes', label: 'Minutes' },
  ];
  protected readonly start = signal('2026-01-01');
  protected readonly end = signal('2026-12-31');
  protected readonly base = signal('2026-01-31T09:00');
  protected readonly duration = signal<Duration>({ ...emptyDuration(), months: 1 });
  protected readonly sign = signal<1 | -1>(1);
  protected readonly isoText = signal('P1Y2M10DT2H30M');
  protected readonly describe = describeDuration;
  protected readonly iso = formatIsoDuration;
  protected readonly seconds = durationSeconds;

  protected readonly diff = computed(() => difference(this.start(), this.end()));
  protected readonly added = computed(() => {
    const date = new Date(`${this.base()}:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return addDuration(date, this.duration(), this.sign()).toUTCString().replace('GMT', 'UTC');
  });
  protected readonly isoResult = computed(() => (this.isoText().trim() ? parseIsoDuration(this.isoText()) : null));

  constructor() {
    // Today's date only in the browser, so the prerendered page does not freeze an old date.
    afterNextRender(() => this.start.set(new Date().toISOString().slice(0, 10)));
  }

  protected setField(key: keyof Duration, value: number): void {
    this.duration.update((d) => ({ ...d, [key]: Math.max(0, value) }));
  }
}
