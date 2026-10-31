import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { SAMPLE_MAP, SAMPLE_TRACE } from './samples';
import { Frame, MapFile, Mapped, loadMaps, mapFrame, parseFrames, rewriteTrace } from './stack';

const CONTENT: ToolContent = {
  aboutHeading: 'About this stack trace decoder',
  about:
    'Errors from production JavaScript point into minified files, such as main-4KX2.js:1:58231, which says nothing ' +
    'about where the bug is. Paste the stack trace and the source map (.map file) from the same build, and every frame ' +
    'is mapped back to the original file, line, column and function name, with the surrounding source code when the ' +
    'map includes it. Works with maps from Angular, React, Vue, Vite, webpack, esbuild and Rollup.',
  steps: [
    'Paste the error’s stack trace from your error tracker, logs or the browser console.',
    'Open the .map file (or several) from the same build, or paste its JSON.',
    'Read the original file and line of each frame, with the code around it.',
    'Copy the decoded trace into your bug report.',
  ],
  faq: [
    { question: 'Where do I get the source map?', answer: 'Your build writes .js.map files next to the bundles when source maps are on, for example "sourceMap": true in angular.json or build.sourcemap in Vite. Keep them private and do not deploy them publicly if you do not want your source exposed.' },
    { question: 'Why does a frame say it is not in the map?', answer: 'The map is from a different build than the error, or the position is code the bundler added. Every deploy needs its own maps.' },
    { question: 'Are my source maps uploaded?', answer: 'No. Maps and traces are read in your browser, so your source code stays on your device.' },
  ],
};

@Component({
  selector: 'app-stack-trace-decoder',
  imports: [Icon, CopyButton, ToolPage],
  template: `
    <app-tool-page path="stack-trace-decoder" [content]="content" [wide]="true" privacy="Decoded in your browser. Your stack traces and source maps are never uploaded.">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
        <button type="button" class="btn-small" (click)="fileInput.click()"><app-icon [path]="icons.upload" [size]="16" /> Open .map files</button>
        <input #fileInput type="file" multiple accept=".map,.json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="onFiles(fileInput)" />
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-semibold">Stack trace</span>
          <textarea rows="9" class="field-code" spellcheck="false" placeholder="TypeError: … at fn (https://site/main-ABC.js:1:5823)" [value]="trace()" (input)="trace.set($any($event.target).value)"></textarea>
        </label>
        <label class="flex flex-col gap-2">
          <span class="text-sm font-semibold">Source map JSON {{ files().length ? '(' + files().length + ' opened)' : '' }}</span>
          <textarea rows="9" class="field-code" spellcheck="false" placeholder='{"version":3,"file":"main-ABC.js","mappings":"…"}' [value]="pastedMap()" (input)="pastedMap.set($any($event.target).value)"></textarea>
        </label>
      </div>

      <div class="mt-4" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ message }}</p>
        }
      </div>

      @if (results().length) {
        <div class="mt-4 flex items-center justify-between gap-2">
          <h2 class="text-xl leading-7">Decoded trace</h2>
          <app-copy-button [text]="rewritten()" />
        </div>
        <pre class="field-code mt-2 overflow-x-auto" aria-label="Decoded trace">{{ rewritten() }}</pre>
        <ol class="mt-6 flex flex-col gap-3">
          @for (r of results(); track $index) {
            <li class="card p-4 text-sm">
              <p class="font-mono text-xs text-muted break-all">{{ r.frame.raw.trim() }}</p>
              @if (r.source) {
                <p class="mt-1 font-mono font-semibold break-all">{{ r.name ?? r.frame.fn ?? '(anonymous)' }} · {{ r.source }}:{{ r.line }}:{{ r.column }}</p>
                @if (r.snippet) {
                  <pre class="mt-2 overflow-x-auto rounded-lg bg-page p-2 font-mono text-xs">@for (s of r.snippet; track s.number) {<span [class]="s.current ? 'block bg-warning/20 font-semibold' : 'block text-muted'">{{ pad(s.number) }}  {{ s.text }}</span>}</pre>
                }
              } @else {
                <p class="mt-1 text-warning">{{ r.problem }}</p>
              }
            </li>
          }
        </ol>
      }
    </app-tool-page>
  `,
})
export class StackTraceDecoder {
  protected readonly content = CONTENT;
  protected readonly icons = ICONS;
  protected readonly trace = signal('');
  protected readonly pastedMap = signal('');
  protected readonly files = signal<MapFile[]>([]);

  private readonly maps = computed(() => {
    const list = [...this.files()];
    if (this.pastedMap().trim()) list.push({ name: '', text: this.pastedMap() });
    return list.length ? loadMaps(list) : null;
  });
  private readonly items = computed(() => parseFrames(this.trace()));
  protected readonly error = computed(() => {
    const maps = this.maps();
    if (maps && !maps.ok) return maps.error;
    if (this.trace().trim() && !this.items().some((i) => typeof i !== 'string')) return 'No stack frames found. Frames look like “at fn (file.js:10:5)” or “fn@file.js:10:5”.';
    return null;
  });
  protected readonly results = computed<Mapped[]>(() => {
    const maps = this.maps();
    if (!maps?.ok) return [];
    return this.items().filter((i): i is Frame => typeof i !== 'string').map((f) => mapFrame(f, maps.consumers));
  });
  protected readonly rewritten = computed(() => {
    const results = this.results();
    return rewriteTrace(this.items(), new Map(results.map((r) => [r.frame, r])));
  });

  constructor() {
    onSharedInput((d) => this.trace.set(d['input'] ?? ''));
  }

  protected pad(n: number): string {
    return String(n).padStart(4, ' ');
  }

  protected loadSample(): void {
    this.trace.set(SAMPLE_TRACE);
    this.files.set([]);
    this.pastedMap.set(SAMPLE_MAP);
  }

  protected async onFiles(input: HTMLInputElement): Promise<void> {
    const list = [...(input.files ?? [])];
    input.value = '';
    this.files.set(await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))));
  }
}
