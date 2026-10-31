import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Analytics, sizeBucket } from '../../core/analytics';
import { onSharedFiles, onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { HASH_CONTENT } from './content';
import { ALGORITHMS, DigestFormat, Digests, findMatch, formatDigest, hashFile, hashText } from './hashes';

const DEBOUNCE_MS = 150;

@Component({
  selector: 'app-hash-generator',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="What to hash">
        @for (tab of tabs; track tab.value) {
          <button
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="source() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-selected]="source() === tab.value"
            (click)="setSource(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <div class="mt-6">
        @if (source() === 'text') {
          <label for="hash-text" class="text-sm leading-5 font-semibold">Text</label>
          <textarea
            id="hash-text"
            rows="5"
            class="field-code mt-2"
            spellcheck="false"
            placeholder="Type or paste text. It is hashed as UTF-8 as you type."
            [value]="text()"
            (input)="onText($any($event.target).value)"
          ></textarea>
        } @else {
          <div class="card flex flex-col items-center gap-3 px-6 py-8 text-center">
            @if (file(); as f) {
              <p class="font-semibold break-all">{{ f.name }}</p>
              <p class="text-sm text-muted">{{ formatBytes(f.size) }}</p>
            } @else {
              <p class="font-heading text-xl leading-7 font-semibold">Choose a file to hash</p>
              <p class="text-sm text-muted">Any type and size. Large files are read in pieces.</p>
            }
            <div class="flex gap-2">
              <button type="button" class="btn-primary" [disabled]="progress() !== null" (click)="fileInput.click()">
                {{ file() ? 'Choose another file' : 'Choose file' }}
              </button>
              @if (progress() !== null) {
                <button type="button" class="btn-secondary" (click)="cancel()">Cancel</button>
              }
            </div>
            <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" (change)="onFileChosen(fileInput)" />
            @if (progress(); as p) {
              <div class="w-full max-w-sm" aria-live="polite">
                <div class="flex justify-between text-sm"><span>Hashing…</span><span>{{ (p * 100).toFixed(0) }}%</span></div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-page" role="progressbar" aria-label="Hashing progress" [attr.aria-valuenow]="(p * 100).toFixed(0)" aria-valuemin="0" aria-valuemax="100">
                  <div class="h-full rounded-full bg-brand" [style.width.%]="p * 100"></div>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-2 text-sm leading-5">
          <span class="font-semibold">HMAC secret key <span class="font-normal text-muted">(optional)</span></span>
          <input class="field font-mono" spellcheck="false" autocomplete="off" placeholder="Leave empty for plain hashes" [value]="key()" (input)="onKey($any($event.target).value)" />
        </label>
        <label class="flex flex-col gap-2 text-sm leading-5">
          <span class="font-semibold">Compare with a checksum <span class="font-normal text-muted">(optional)</span></span>
          <input class="field font-mono" spellcheck="false" autocomplete="off" placeholder="Paste the expected hash" [value]="expected()" (input)="expected.set($any($event.target).value)" />
        </label>
      </div>

      <div class="mt-4 min-h-6 text-sm leading-5" aria-live="polite">
        @if (expected().trim() && digests()) {
          @if (match(); as id) {
            <p class="flex items-center gap-2 font-semibold">
              <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
              Matches the {{ labelOf(id) }} {{ key() ? 'HMAC' : 'hash' }}.
            </p>
          } @else {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">No {{ key() ? 'HMAC' : 'hash' }} below matches this checksum.</p>
          }
        }
        @if (problem(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        }
      </div>

      <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl leading-7">{{ key() ? 'HMAC values' : 'Hashes' }}</h2>
        <label class="flex items-center gap-2 text-sm leading-5">
          <span class="font-semibold">Output</span>
          <select class="field" [value]="format()" (change)="format.set($any($event.target).value)">
            <option value="hex">hex (lowercase)</option>
            <option value="HEX">HEX (uppercase)</option>
            <option value="base64">Base64</option>
          </select>
        </label>
      </div>
      <ul class="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line">
        @for (row of rows(); track row.id) {
          <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" [class]="match() === row.id ? 'bg-success/10' : ''">
            <span class="w-full shrink-0 sm:w-24 text-sm font-semibold">{{ row.label }}</span>
            <code class="min-w-0 flex-1 font-mono text-sm break-all" [class.text-muted]="!row.value">{{ row.value || '—' }}</code>
            <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
          </li>
        }
      </ul>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Text, files and keys are hashed in your browser and never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class HashGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'hash-generator')!;
  protected readonly content = HASH_CONTENT;
  protected readonly icons = ICONS;
  protected readonly formatBytes = formatBytes;
  protected readonly tabs = [
    { value: 'text' as const, label: 'Text' },
    { value: 'file' as const, label: 'File' },
  ];

  protected readonly source = signal<'text' | 'file'>('text');
  protected readonly text = signal('');
  protected readonly key = signal('');
  protected readonly expected = signal('');
  protected readonly format = signal<DigestFormat>('hex');
  protected readonly file = signal<File | null>(null);
  protected readonly digests = signal<Digests | null>(null);
  protected readonly progress = signal<number | null>(null);
  protected readonly problem = signal<string | null>(null);

  protected readonly match = computed(() => {
    const digests = this.digests();
    return digests ? findMatch(digests, this.expected()) : null;
  });
  protected readonly rows = computed(() => {
    const digests = this.digests();
    return ALGORITHMS.filter((a) => !this.key() || a.hmac).map((a) => ({
      id: a.id,
      label: a.label,
      value: digests?.[a.id] ? formatDigest(digests[a.id], this.format()) : '',
    }));
  });

  private readonly analytics = inject(Analytics);
  private timer?: ReturnType<typeof setTimeout>;
  /** Increases with every new run, so a slow earlier run cannot overwrite a newer result. */
  private run = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.run++;
    });
    onSharedInput((data) => this.onText(data['input'] ?? ''));
    onSharedFiles((files) => {
      this.source.set('file');
      this.file.set(files[0]);
      void this.hashChosenFile();
    });
    // Empty text still has hashes (of zero bytes), but showing them before anything is typed is confusing.
    effect(() => {
      if (this.source() === 'text' && !this.text()) this.digests.set(null);
    });
  }

  protected labelOf(id: string): string {
    return ALGORITHMS.find((a) => a.id === id)?.label ?? id;
  }

  protected setSource(source: 'text' | 'file'): void {
    if (source === this.source()) return;
    this.cancel();
    this.source.set(source);
    this.digests.set(null);
    this.problem.set(null);
    if (source === 'text') this.schedule();
    else if (this.file()) void this.hashChosenFile();
  }

  protected onText(value: string): void {
    this.text.set(value);
    this.schedule();
  }

  protected onKey(value: string): void {
    this.key.set(value);
    if (this.source() === 'text') this.schedule();
    else if (this.file()) void this.hashChosenFile();
  }

  protected onFileChosen(element: HTMLInputElement): void {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    this.file.set(file);
    this.analytics.track('hash-file', { size: sizeBucket(file.size) });
    void this.hashChosenFile();
  }

  protected cancel(): void {
    this.run++;
    this.progress.set(null);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.hashCurrentText(), DEBOUNCE_MS);
  }

  private async hashCurrentText(): Promise<void> {
    const run = ++this.run;
    const text = this.text();
    if (!text) return;
    try {
      const digests = await hashText(text, this.key());
      if (run === this.run) this.digests.set(digests);
    } catch {
      if (run === this.run) this.problem.set('The hash functions could not be loaded. Reload the page and try again.');
    }
  }

  private async hashChosenFile(): Promise<void> {
    const file = this.file();
    if (!file) return;
    const run = ++this.run;
    this.digests.set(null);
    this.problem.set(null);
    this.progress.set(0);
    try {
      const digests = await hashFile(file, this.key(), (p) => run === this.run && this.progress.set(p), () => run !== this.run);
      if (run !== this.run) return;
      this.digests.set(digests);
    } catch {
      if (run === this.run) this.problem.set(`${file.name} could not be read. Try another file.`);
    } finally {
      if (run === this.run) this.progress.set(null);
    }
  }
}
