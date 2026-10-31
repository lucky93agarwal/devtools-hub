import { Component, computed, effect, inject, signal } from '@angular/core';
import { Analytics, sizeBucket } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { baseName, downloadBlob, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { bytesToBase64, bytesToText, decodeBase64, extensionFor, textToBase64, wrapLines } from './base64';
import { BASE64_CONTENT } from './content';

type Mode = 'encode' | 'decode';

@Component({
  selector: 'app-base64-tool',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Base64 mode">
        @for (tab of tabs; track tab.value) {
          <button
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="mode() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-selected]="mode() === tab.value"
            (click)="setMode(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      @if (mode() === 'encode') {
        <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="urlSafe()" (change)="urlSafe.set($any($event.target).checked)" />
            URL-safe (Base64URL, no padding)
          </label>
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="wrap()" (change)="wrap.set($any($event.target).checked)" />
            Split into 76-character lines
          </label>
          @if (file()) {
            <label class="flex items-center gap-2 text-sm leading-5">
              <input type="checkbox" class="size-4 accent-brand" [checked]="asDataUri()" (change)="asDataUri.set($any($event.target).checked)" />
              As a data URI
            </label>
          }
        </div>
      }

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <label for="b64-input" class="text-sm leading-5 font-semibold">{{ mode() === 'encode' ? 'Text' : 'Base64' }}</label>
            <div class="flex gap-2">
              @if (mode() === 'encode') {
                <button type="button" class="btn-small" (click)="fileInput.click()">
                  <app-icon [path]="icons.upload" [size]="16" />
                  Encode a file
                </button>
              }
              <button type="button" class="btn-small" [disabled]="!input() && !file()" (click)="clear()">Clear</button>
            </div>
            <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" (change)="onFileChosen(fileInput)" />
          </div>
          @if (file(); as f) {
            <div class="card flex min-h-64 flex-col items-center justify-center gap-2 p-4 text-center">
              <p class="font-semibold break-all">{{ f.name }}</p>
              <p class="text-sm text-muted">{{ f.type || 'Unknown type' }} · {{ formatBytes(f.size) }}</p>
              <button type="button" class="btn-small mt-2" (click)="clear()">Encode text instead</button>
            </div>
          } @else {
            <textarea
              id="b64-input"
              rows="12"
              class="field-code min-h-64"
              spellcheck="false"
              [placeholder]="mode() === 'encode' ? 'Type or paste text to encode.' : 'Paste Base64, Base64URL or a data: URI.'"
              [value]="input()"
              (input)="input.set($any($event.target).value)"
            ></textarea>
          }
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">{{ mode() === 'encode' ? 'Base64' : 'Decoded' }}</span>
            <div class="flex gap-2">
              @if (decodedFile(); as d) {
                <button type="button" class="btn-small" (click)="downloadDecoded()">
                  <app-icon [path]="icons.download" [size]="16" />
                  Download .{{ d.extension }}
                </button>
              } @else {
                <app-copy-button [text]="output()" />
                <button type="button" class="btn-small" [disabled]="!output()" (click)="downloadOutput()">
                  <app-icon [path]="icons.download" [size]="16" />
                  Download
                </button>
              }
            </div>
          </div>
          @if (error(); as message) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ message }}</p>
          } @else if (decodedFile(); as d) {
            <div class="card flex min-h-64 flex-col items-center justify-center gap-3 p-4 text-center">
              @if (previewUrl(); as url) {
                <img [src]="url" alt="Decoded image" class="checkerboard max-h-48 max-w-full rounded-lg border border-line object-contain" />
              }
              <p class="font-semibold">Binary data: {{ d.mime ?? 'unknown type' }}</p>
              <p class="text-sm text-muted">{{ formatBytes(d.size) }}. Download it to open it.</p>
            </div>
          } @else {
            <textarea
              rows="12"
              class="field-code min-h-64"
              readonly
              aria-label="Result"
              placeholder="The result appears here."
              [value]="output()"
            ></textarea>
          }
          @if (output() && !error()) {
            <p class="text-sm text-muted" aria-live="polite">{{ sizeNote() }}</p>
          }
        </div>
      </div>

      @if (problem(); as message) {
        <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5">{{ message }}</p>
      }

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Your text and files are encoded in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class Base64Tool {
  protected readonly tool = TOOLS.find((t) => t.path === 'base64')!;
  protected readonly content = BASE64_CONTENT;
  protected readonly icons = ICONS;
  protected readonly formatBytes = formatBytes;
  protected readonly tabs = [
    { value: 'encode' as const, label: 'Encode' },
    { value: 'decode' as const, label: 'Decode' },
  ];

  protected readonly mode = signal<Mode>('encode');
  protected readonly input = signal('');
  protected readonly urlSafe = signal(false);
  protected readonly wrap = signal(false);
  protected readonly asDataUri = signal(false);
  protected readonly file = signal<{ name: string; type: string; size: number; bytes: Uint8Array } | null>(null);
  protected readonly problem = signal<string | null>(null);

  /** Object URL of a decoded image, for the preview. */
  protected readonly previewUrl = signal<string | null>(null);

  private readonly analytics = inject(Analytics);

  private readonly decoded = computed(() => (this.mode() === 'decode' && this.input().trim() ? decodeBase64(this.input()) : null));

  protected readonly error = computed(() => {
    const result = this.decoded();
    return result && !result.ok ? result.error : null;
  });

  /** Decoded bytes that are not text, offered as a download. */
  protected readonly decodedFile = computed(() => {
    const result = this.decoded();
    if (!result?.ok || (bytesToText(result.bytes) !== null && !result.mime?.startsWith('image/'))) return null;
    const blob = new Blob([result.bytes as BlobPart], { type: result.mime ?? 'application/octet-stream' });
    return { blob, mime: result.mime, size: result.bytes.length, extension: extensionFor(result.mime) };
  });

  protected readonly output = computed(() => {
    if (this.mode() === 'decode') {
      const result = this.decoded();
      return result?.ok ? (bytesToText(result.bytes) ?? '') : '';
    }
    const file = this.file();
    let base64 = file ? bytesToBase64(file.bytes, this.urlSafe()) : this.input() ? textToBase64(this.input(), this.urlSafe()) : '';
    if (file && this.asDataUri()) return `data:${file.type || 'application/octet-stream'};base64,${base64}`;
    if (this.wrap()) base64 = wrapLines(base64);
    return base64;
  });

  protected readonly sizeNote = computed(() => {
    const out = new TextEncoder().encode(this.output()).length;
    const source = this.file()?.size ?? new TextEncoder().encode(this.input()).length;
    return this.mode() === 'encode'
      ? `${formatBytes(source)} in, ${formatBytes(out)} of Base64 out.`
      : `${formatBytes(out)} of text.`;
  });

  constructor() {
    effect((onCleanup) => {
      const decoded = this.decodedFile();
      const url = decoded?.mime?.startsWith('image/') ? URL.createObjectURL(decoded.blob) : null;
      this.previewUrl.set(url);
      onCleanup(() => url && URL.revokeObjectURL(url));
    });
  }

  protected setMode(mode: Mode): void {
    if (mode === this.mode()) return;
    // Switching sides keeps working on the result: what was encoded can be decoded right away.
    const carry = this.file() || this.error() || this.decodedFile() ? '' : this.output();
    this.mode.set(mode);
    this.file.set(null);
    this.problem.set(null);
    this.input.set(carry);
  }

  protected async onFileChosen(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    if (file.size > LIMITS.MAX_JSON_BYTES) {
      this.analytics.limitHit(this.tool.path, 'file-size');
      this.problem.set(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_JSON_BYTES)}.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.problem.set(null);
      this.file.set({ name: file.name, type: file.type, size: file.size, bytes });
      this.analytics.track('base64-file', { size: sizeBucket(file.size) });
    } catch {
      this.problem.set(`${file.name} could not be read. Try another file.`);
    }
  }

  protected clear(): void {
    this.file.set(null);
    this.input.set('');
    this.problem.set(null);
  }

  protected downloadOutput(): void {
    const name = this.file() ? `${baseName(this.file()!.name)}.base64.txt` : this.mode() === 'encode' ? 'encoded.txt' : 'decoded.txt';
    downloadText(this.output(), name, 'text/plain');
  }

  protected downloadDecoded(): void {
    const decoded = this.decodedFile();
    if (decoded) downloadBlob(decoded.blob, `decoded.${decoded.extension}`);
  }
}
