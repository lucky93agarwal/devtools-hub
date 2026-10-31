import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { ESCAPE_MODES, EscapeMode, escapeText, unescapeText } from './escape';

const CONTENT: ToolContent = {
  aboutHeading: 'About this string escape tool',
  about:
    'Text often arrives escaped: \\" and \\n inside JSON logs, \\u00e9 in Java property files, &amp; in HTML, doubled ' +
    "quotes in SQL. This tool turns such text back into what it means, and escapes plain text so it can be pasted " +
    'safely into a JSON value, a JavaScript, Java or Kotlin string, HTML or XML, an SQL string or a regular expression.',
  steps: [
    'Choose what the text is for, such as a JSON string or HTML.',
    'Choose Escape to prepare text for code, or Unescape to read escaped text.',
    'Paste the text. The result updates as you type.',
    'Copy the result, or swap it into the input to keep working.',
  ],
  faq: [
    { question: 'Why does my JSON have backslashes everywhere?', answer: 'It was encoded twice: a JSON document was stored as a string inside another. Unescape it here, then format it with the JSON Formatter.' },
    { question: 'What does ASCII only do?', answer: 'It writes every character outside plain English letters as \\uXXXX, for files or systems that only accept ASCII, such as old Java .properties files.' },
    { question: 'Does escaping make SQL safe?', answer: 'Doubling quotes helps, but always use parameterised queries in code. Escaping by hand is easy to get wrong.' },
  ],
};

@Component({
  selector: 'app-string-escape',
  imports: [CopyButton, ShareButton, ToolPage],
  template: `
    <app-tool-page path="string-escape" [content]="content">
      <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Text is for</span>
          <select class="field" [value]="mode()" (change)="mode.set($any($event.target).value)">
            @for (m of modes; track m.value) {
              <option [value]="m.value">{{ m.label }}</option>
            }
          </select>
        </label>
        <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Direction">
          @for (d of directions; track d.value) {
            <button type="button" role="radio" class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
              [class]="direction() === d.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-checked]="direction() === d.value" (click)="direction.set(d.value)">
              {{ d.label }}
            </button>
          }
        </div>
        @if (direction() === 'escape' && (mode() === 'json' || mode() === 'js' || mode() === 'java')) {
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="ascii()" (change)="ascii.set($any($event.target).checked)" />
            ASCII only (\\uXXXX)
          </label>
        }
        <app-share-button path="string-escape" [data]="input() ? { input: input(), mode: mode(), direction: direction() } : null" />
      </div>
      <p class="mt-2 text-sm text-muted">Example: <code class="font-mono">{{ example() }}</code></p>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">{{ direction() === 'escape' ? 'Plain text' : 'Escaped text' }}</span>
          <textarea rows="10" class="field-code" spellcheck="false" [value]="input()" (input)="input.set($any($event.target).value)"></textarea>
        </label>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Result</span>
            <span class="flex gap-2">
              <button type="button" class="btn-small" [disabled]="!output()" (click)="swap()">Use as input</button>
              <app-copy-button [text]="output()" />
            </span>
          </div>
          @if (error(); as message) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ message }}</p>
          } @else {
            <textarea rows="10" class="field-code" readonly aria-label="Result" [value]="output()"></textarea>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class StringEscape {
  protected readonly content = CONTENT;
  protected readonly modes = ESCAPE_MODES;
  protected readonly directions = [
    { value: 'escape' as const, label: 'Escape' },
    { value: 'unescape' as const, label: 'Unescape' },
  ];
  protected readonly mode = signal<EscapeMode>('json');
  protected readonly direction = signal<'escape' | 'unescape'>('unescape');
  protected readonly ascii = signal(false);
  protected readonly input = signal('');

  private readonly result = computed(() =>
    this.direction() === 'escape'
      ? { ok: true as const, text: escapeText(this.input(), this.mode(), this.ascii()) }
      : unescapeText(this.input(), this.mode()),
  );
  protected readonly output = computed(() => {
    const r = this.result();
    return r.ok ? r.text : '';
  });
  protected readonly error = computed(() => {
    const r = this.result();
    return r.ok ? null : r.error;
  });
  protected readonly example = computed(() => ESCAPE_MODES.find((m) => m.value === this.mode())!.example);

  constructor() {
    onSharedInput((d) => {
      if (ESCAPE_MODES.some((m) => m.value === d['mode'])) this.mode.set(d['mode'] as EscapeMode);
      if (d['direction'] === 'escape' || d['direction'] === 'unescape') this.direction.set(d['direction']);
      this.input.set(d['input'] ?? '');
    });
  }

  protected swap(): void {
    this.input.set(this.output());
    this.direction.set(this.direction() === 'escape' ? 'unescape' : 'escape');
  }
}
