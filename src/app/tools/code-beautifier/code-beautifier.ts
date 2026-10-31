import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { CodeLanguage, beautify, byteSize, detectLanguage, minify } from './beautify';
import { BEAUTIFIER_CONTENT, BEAUTIFIER_SAMPLES } from './content';

const DEBOUNCE_MS = 300;
const LANGUAGES: { value: CodeLanguage; label: string; extension: string; mime: string }[] = [
  { value: 'html', label: 'HTML', extension: 'html', mime: 'text/html' },
  { value: 'css', label: 'CSS', extension: 'css', mime: 'text/css' },
  { value: 'js', label: 'JavaScript', extension: 'js', mime: 'text/javascript' },
];

@Component({
  selector: 'app-code-beautifier',
  imports: [Icon, CodeEditor, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Language">
          @for (option of languages; track option.value) {
            <button
              type="button"
              role="radio"
              class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
              [class]="language() === option.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
              [attr.aria-checked]="language() === option.value"
              (click)="chooseLanguage(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Action">
          @for (option of modes; track option.value) {
            <button
              type="button"
              role="radio"
              class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
              [class]="mode() === option.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
              [attr.aria-checked]="mode() === option.value"
              (click)="mode.set(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (mode() === 'beautify') {
          <label class="flex items-center gap-2 text-sm leading-5">
            <span class="font-semibold">Indent</span>
            <select class="field" [value]="indent()" (change)="indent.set(+$any($event.target).value)">
              <option [value]="2">2 spaces</option>
              <option [value]="4">4 spaces</option>
              <option [value]="0">Tab</option>
            </select>
          </label>
        }
        <div class="flex gap-2">
          <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!input()" (click)="setInput('')">Clear</button>
        </div>
      </div>

      <div id="code-status" class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (output()) {
          <p class="flex flex-wrap items-center gap-2 font-semibold">
            <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
            {{ mode() === 'beautify' ? 'Beautified.' : 'Minified.' }}
            <span class="font-normal text-muted">{{ sizes() }}</span>
          </p>
        } @else {
          <p class="text-muted">Paste code on the left. The language is detected when you paste.</p>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">{{ label() }} code</span>
          <app-code-editor
            #inputEditor
            class="h-80 lg:h-[32rem]"
            ariaLabel="Code input"
            placeholder="Paste HTML, CSS or JavaScript here."
            [invalid]="!!error()"
            [value]="input()"
            (valueChange)="onInput($event)"
          />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">Result</span>
            <div class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
                <app-icon [path]="icons.download" [size]="16" />
                Download
              </button>
            </div>
          </div>
          <app-code-editor class="h-80 lg:h-[32rem]" ariaLabel="Result" placeholder="The result appears here." [readOnly]="true" [value]="output()" />
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Your code is processed in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CodeBeautifier {
  protected readonly tool = TOOLS.find((t) => t.path === 'code-beautifier')!;
  protected readonly content = BEAUTIFIER_CONTENT;
  protected readonly icons = ICONS;
  protected readonly languages = LANGUAGES;
  protected readonly modes = [
    { value: 'beautify' as const, label: 'Beautify' },
    { value: 'minify' as const, label: 'Minify' },
  ];

  protected readonly language = signal<CodeLanguage>('html');
  protected readonly mode = signal<'beautify' | 'minify'>('beautify');
  protected readonly indent = signal(2);
  protected readonly input = signal('');
  private readonly settled = signal('');
  protected readonly output = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly label = computed(() => LANGUAGES.find((l) => l.value === this.language())!.label);
  protected readonly sizes = computed(() => {
    const before = byteSize(this.settled());
    const after = byteSize(this.output());
    if (!before) return '';
    const change = Math.round((1 - after / before) * 100);
    return `${formatBytes(before)} → ${formatBytes(after)}${change > 0 ? ` (${change}% smaller)` : change < 0 ? ` (${-change}% larger)` : ''}`;
  });

  private readonly inputEditor = viewChild.required<CodeEditor>('inputEditor');
  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;
  /** The language was picked by hand, so pasting does not change it. */
  private chosen = false;

  constructor() {
    effect(() => {
      const code = this.settled();
      const language = this.language();
      const mode = this.mode();
      const indent = this.indent();
      void this.process(code, language, mode, indent);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected chooseLanguage(language: CodeLanguage): void {
    this.chosen = true;
    this.language.set(language);
  }

  protected onInput(value: string): void {
    if (value === this.input()) return;
    // Detect the language on the first paste into an empty box.
    if (!this.chosen && !this.input().trim()) {
      const detected = detectLanguage(value);
      if (detected) this.language.set(detected);
    }
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
    this.setInput(BEAUTIFIER_SAMPLES[this.language()]);
    this.analytics.track('beautifier-sample', { language: this.language() });
  }

  protected download(): void {
    const language = LANGUAGES.find((l) => l.value === this.language())!;
    const name = this.mode() === 'minify' ? `code.min.${language.extension}` : `code.${language.extension}`;
    downloadText(this.output(), name, language.mime);
  }

  private async process(code: string, language: CodeLanguage, mode: 'beautify' | 'minify', indent: number): Promise<void> {
    const run = ++this.run;
    if (!code.trim()) {
      this.output.set('');
      this.error.set(null);
      this.inputEditor().clearError();
      return;
    }
    try {
      const result = mode === 'beautify' ? await beautify(code, language, indent) : await minify(code, language);
      if (run !== this.run) return;
      if (result.ok) {
        this.output.set(result.output);
        this.error.set(null);
        this.inputEditor().clearError();
      } else {
        this.output.set('');
        this.error.set(result.line ? `Line ${result.line}: ${result.error}` : result.error);
        if (result.line) this.inputEditor().showError(result.line, result.column ?? 1, result.error);
      }
    } catch {
      if (run === this.run) this.error.set('The formatter could not be loaded. Reload the page and try again.');
    }
  }
}
