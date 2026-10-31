import { Component, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { SNIPPET_LANGUAGES } from '../api-client/snippets';
import { CURL_CONTENT, CURL_SAMPLE } from './content';
import { curlToCode } from './curl-code';

/** The most asked-for targets, shown as buttons; every language is in the list. */
const POPULAR = ['python-requests', 'js-fetch', 'node-axios', 'go', 'java-okhttp', 'kotlin-okhttp', 'php-guzzle', 'csharp-httpclient', 'swift', 'dart-http'];

@Component({
  selector: 'app-curl-to-code',
  imports: [Icon, CodeEditor, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex items-center justify-between gap-2">
        <label for="curl-input" class="text-sm leading-5 font-semibold">cURL command</label>
        <div class="flex gap-2">
          <button type="button" class="btn-small" (click)="command.set(sample)">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!command()" (click)="command.set('')">Clear</button>
        </div>
      </div>
      <textarea
        id="curl-input"
        rows="6"
        class="field-code mt-2"
        spellcheck="false"
        placeholder="curl https://api.example.com/users -H 'Authorization: Bearer …'"
        [value]="command()"
        (input)="command.set($any($event.target).value)"
      ></textarea>
      <p class="mt-2 text-sm text-muted">Tip: in Chrome DevTools, right-click a request in the Network tab and choose Copy as cURL (bash).</p>

      <div class="mt-6 flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Language</span>
          <select class="field" [value]="language()" (change)="choose($any($event.target).value)">
            @for (l of languages; track l.id) {
              <option [value]="l.id" [selected]="l.id === language()">{{ l.label }}</option>
            }
          </select>
        </label>
        <div class="flex flex-wrap gap-1.5">
          @for (l of popular; track l.id) {
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-sm leading-5 font-semibold transition-colors"
              [class]="language() === l.id ? 'border-brand bg-brand text-on-brand' : 'border-line text-muted hover:text-ink'"
              [attr.aria-pressed]="language() === l.id"
              (click)="choose(l.id)"
            >
              {{ l.label }}
            </button>
          }
        </div>
      </div>

      <div class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @if (result(); as r) {
          @if (r.ok) {
            <p class="flex items-center gap-2 font-semibold break-all">
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
              {{ r.summary }}
            </p>
          } @else if (r.error) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ r.error }}</p>
          }
        }
      </div>

      <div class="flex items-center justify-between gap-2">
        <span class="text-sm leading-5 font-semibold">{{ label() }}</span>
        <app-copy-button [text]="code()" />
      </div>
      <app-code-editor
        class="mt-2 h-96"
        ariaLabel="Generated code"
        placeholder="Paste a cURL command above to see it as code."
        [readOnly]="true"
        [value]="code()"
      />

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        The command is converted in your browser. Tokens and cookies in it are never sent anywhere.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CurlToCode {
  protected readonly tool = TOOLS.find((t) => t.path === 'curl-to-code')!;
  protected readonly content = CURL_CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = CURL_SAMPLE;
  protected readonly languages = SNIPPET_LANGUAGES;
  protected readonly popular = POPULAR.map((id) => SNIPPET_LANGUAGES.find((l) => l.id === id)!).filter(Boolean);

  protected readonly command = signal('');
  protected readonly language = signal('python-requests');

  protected readonly result = computed(() => (this.command().trim() ? curlToCode(this.command(), this.language()) : null));
  protected readonly code = computed(() => {
    const r = this.result();
    return r?.ok ? r.code : '';
  });
  protected readonly label = computed(() => SNIPPET_LANGUAGES.find((l) => l.id === this.language())?.label ?? 'Code');

  private readonly analytics = inject(Analytics);

  protected choose(id: string): void {
    this.language.set(id);
    this.analytics.track('curl-to-code', { language: id });
  }
}
