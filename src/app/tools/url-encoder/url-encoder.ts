import { Component, computed, signal } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { URL_CONTENT } from './content';
import { EncodeScope, Param, UrlParts, buildUrl, decodeText, encodeText, parseUrl } from './url-tools';

const SAMPLE_URL = 'https://api.example.com:8443/v1/search?q=caf%C3%A9%20%26%20bar&sort=price&page=2#results';

@Component({
  selector: 'app-url-encoder',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <section class="mt-8" aria-labelledby="encode-heading">
        <h2 id="encode-heading" class="text-xl leading-7">Encode or decode</h2>
        <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Direction">
            @for (option of directions; track option.value) {
              <button
                type="button"
                role="radio"
                class="rounded-full px-4 py-1.5 text-sm leading-5 font-semibold transition-colors"
                [class]="direction() === option.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
                [attr.aria-checked]="direction() === option.value"
                (click)="direction.set(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          @if (direction() === 'encode') {
            <label class="flex items-center gap-2 text-sm leading-5">
              <span class="font-semibold">Encode as</span>
              <select class="field" [value]="scope()" (change)="scope.set($any($event.target).value)">
                <option value="component">A query value or path part</option>
                <option value="url">A whole URL</option>
              </select>
            </label>
          }
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="plus()" (change)="plus.set($any($event.target).checked)" />
            {{ direction() === 'encode' ? 'Spaces as +' : 'Read + as a space' }}
          </label>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div class="flex flex-col gap-2">
            <label for="url-text" class="text-sm leading-5 font-semibold">{{ direction() === 'encode' ? 'Text' : 'Encoded text' }}</label>
            <textarea
              id="url-text"
              rows="6"
              class="field-code"
              spellcheck="false"
              [placeholder]="direction() === 'encode' ? 'Type text such as café & bar' : 'Paste text such as caf%C3%A9%20%26%20bar'"
              [value]="text()"
              (input)="text.set($any($event.target).value)"
            ></textarea>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm leading-5 font-semibold">Result</span>
              <app-copy-button [text]="converted().ok ? converted().text : ''" />
            </div>
            @if (!converted().ok) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ converted().error }}</p>
            } @else {
              <textarea rows="6" class="field-code" readonly aria-label="Result" placeholder="The result appears here." [value]="converted().text"></textarea>
            }
          </div>
        </div>
      </section>

      <section class="mt-12" aria-labelledby="parse-heading">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="parse-heading" class="text-xl leading-7">Parse a URL</h2>
          <button type="button" class="btn-small" (click)="loadUrl(sample)">Try a sample URL</button>
        </div>
        <label for="url-input" class="sr-only">URL to parse</label>
        <input
          id="url-input"
          type="url"
          class="field mt-4 w-full font-mono"
          spellcheck="false"
          placeholder="https://example.com/path?key=value#section"
          [value]="urlInput()"
          (input)="loadUrl($any($event.target).value)"
        />

        @if (parseError(); as message) {
          <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ message }}</p>
        }

        @if (parts(); as p) {
          <dl class="card mt-4 grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-[max-content_1fr]">
            @for (row of partRows(); track row.label) {
              <dt class="font-semibold">{{ row.label }}</dt>
              <dd class="font-mono break-all text-muted">{{ row.value || '—' }}</dd>
            }
          </dl>

          <div class="mt-6 flex items-center justify-between gap-2">
            <h3 class="text-lg leading-7">Query parameters ({{ p.params.length }})</h3>
            <button type="button" class="btn-small" (click)="addParam()">
              <app-icon [path]="icons.plus" [size]="16" />
              Add parameter
            </button>
          </div>
          <p class="mt-1 text-sm text-muted">Values are shown decoded. Edit them and the URL below is rebuilt and encoded for you.</p>
          <div class="mt-3 flex flex-col gap-2">
            @for (param of p.params; track $index; let i = $index) {
              <div class="flex gap-2">
                <input class="field w-2/5 font-mono" [attr.aria-label]="'Name of parameter ' + (i + 1)" [value]="param.key" (input)="setParam(i, { key: $any($event.target).value })" />
                <input class="field min-w-0 flex-1 font-mono" [attr.aria-label]="'Value of parameter ' + (i + 1)" [value]="param.value" (input)="setParam(i, { value: $any($event.target).value })" />
                <button
                  type="button"
                  class="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                  [attr.aria-label]="'Remove parameter ' + (param.key || i + 1)"
                  (click)="removeParam(i)"
                >
                  <app-icon [path]="icons.close" [size]="18" />
                </button>
              </div>
            } @empty {
              <p class="text-sm text-muted">This URL has no query parameters.</p>
            }
          </div>

          <div class="mt-6 flex items-center justify-between gap-2">
            <h3 class="text-lg leading-7">Rebuilt URL</h3>
            <app-copy-button [text]="rebuilt()" ariaLabel="Copy rebuilt URL" />
          </div>
          <p class="card mt-3 p-4 font-mono text-sm break-all" aria-live="polite">{{ rebuilt() }}</p>
        }
      </section>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        URLs are encoded and parsed in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class UrlEncoder {
  protected readonly tool = TOOLS.find((t) => t.path === 'url-encoder')!;
  protected readonly content = URL_CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = SAMPLE_URL;
  protected readonly directions = [
    { value: 'encode' as const, label: 'Encode' },
    { value: 'decode' as const, label: 'Decode' },
  ];

  protected readonly direction = signal<'encode' | 'decode'>('encode');
  protected readonly scope = signal<EncodeScope>('component');
  protected readonly plus = signal(false);
  protected readonly text = signal('');

  protected readonly converted = computed(() =>
    this.direction() === 'encode'
      ? { ok: true as const, text: encodeText(this.text(), this.scope(), this.plus()), error: '' }
      : (() => {
          const result = decodeText(this.text(), this.plus());
          return result.ok ? { ...result, error: '' } : { ok: false as const, text: '', error: result.error };
        })(),
  );

  protected readonly urlInput = signal('');
  protected readonly parts = signal<UrlParts | null>(null);
  protected readonly parseError = signal<string | null>(null);

  protected readonly partRows = computed(() => {
    const p = this.parts();
    if (!p) return [];
    return [
      { label: 'Protocol', value: p.protocol },
      { label: 'User name', value: p.username },
      { label: 'Password', value: p.password },
      { label: 'Host', value: p.hostname },
      { label: 'Port', value: p.port },
      { label: 'Path', value: p.pathname },
      { label: 'Fragment (#)', value: p.hash },
    ];
  });
  protected readonly rebuilt = computed(() => {
    const p = this.parts();
    return p ? buildUrl(p) : '';
  });

  protected loadUrl(value: string): void {
    this.urlInput.set(value);
    const result = parseUrl(value);
    this.parts.set(result.ok ? result.parts : null);
    this.parseError.set(result.ok ? null : result.error || null);
  }

  protected setParam(index: number, change: Partial<Param>): void {
    this.updateParams((params) => params.map((p, i) => (i === index ? { ...p, ...change } : p)));
  }

  protected addParam(): void {
    this.updateParams((params) => [...params, { key: '', value: '' }]);
  }

  protected removeParam(index: number): void {
    this.updateParams((params) => params.filter((_, i) => i !== index));
  }

  private updateParams(change: (params: Param[]) => Param[]): void {
    this.parts.update((p) => (p ? { ...p, params: change(p.params) } : p));
  }
}
