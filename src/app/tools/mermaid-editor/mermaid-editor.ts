import { Component, DestroyRef, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ThemeService } from '../../core/theme.service';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { downloadBlob, downloadText } from '../../shared/file-utils';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { MERMAID_SAMPLES, renderDiagram } from './mermaid-render';

const CONTENT: ToolContent = {
  aboutHeading: 'About this Mermaid diagram editor',
  about:
    'Mermaid turns a few lines of text into flowcharts, sequence diagrams, class and ER diagrams, state machines and ' +
    'Gantt charts. GitHub, GitLab, Notion and many docs tools draw Mermaid blocks in Markdown, so diagrams live next ' +
    'to the code and change in pull requests. Write on the left, see the diagram on the right as you type, and download ' +
    'it as SVG or PNG for slides and documents.',
  steps: [
    'Pick a sample or write Mermaid code.',
    'Fix any error shown under the editor.',
    'Download the diagram as SVG or PNG, or copy the code into a ```mermaid block in Markdown.',
  ],
  faq: [
    { question: 'Will the diagram look the same on GitHub?', answer: 'Mostly. GitHub may use a different Mermaid version and its own theme, so spacing and colours can differ slightly.' },
    { question: 'Is my diagram sent to a server?', answer: 'No. Mermaid runs in your browser. Diagrams cannot run scripts or load links here.' },
    { question: 'Which diagram types work?', answer: 'All the types Mermaid supports, including flowchart, sequence, class, ER, state, Gantt, pie, mindmap, timeline and git graph.' },
  ],
};

@Component({
  selector: 'app-mermaid-editor',
  imports: [CodeEditor, ShareButton, ToolPage],
  template: `
    <app-tool-page path="mermaid-editor" [content]="content" [wide]="true" privacy="Drawn in your browser. Your diagrams are never uploaded.">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold">Samples:</span>
        @for (s of samples; track s.label) {
          <button type="button" class="btn-small" (click)="setCode(s.code)">{{ s.label }}</button>
        }
        <app-share-button path="mermaid-editor" [data]="code().trim() ? { input: code() } : null" />
      </div>
      <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <app-code-editor class="h-96 lg:h-[34rem]" ariaLabel="Mermaid code" placeholder="flowchart LR&#10;  A --> B" [value]="code()" (valueChange)="onCode($event)" />
          @if (error()) {
            <pre class="mt-2 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-xs whitespace-pre-wrap" role="alert">{{ error() }}</pre>
          }
        </div>
        <div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-small" [disabled]="!svg()" (click)="downloadSvg()">Download SVG</button>
            <button type="button" class="btn-small" [disabled]="!svg()" (click)="downloadPng()">Download PNG</button>
          </div>
          <div class="mt-2 flex min-h-64 items-center justify-center overflow-auto rounded-xl border border-line bg-surface p-4 [&_svg]:h-auto [&_svg]:max-w-full" role="img" aria-label="Diagram preview" [innerHTML]="safeSvg()"></div>
          @if (!code().trim()) {
            <p class="mt-2 text-sm text-muted">Pick a sample or write Mermaid code to see the diagram.</p>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class MermaidEditor {
  protected readonly content = CONTENT;
  protected readonly samples = MERMAID_SAMPLES;
  protected readonly code = signal(MERMAID_SAMPLES[0].code);
  protected readonly svg = signal('');
  protected readonly error = signal('');
  /** Mermaid's strict mode already sanitises the SVG; Angular's sanitiser would strip its styles. */
  protected readonly safeSvg = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.svg()));

  private readonly sanitizer = inject(DomSanitizer);
  private readonly theme = inject(ThemeService);
  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;

  constructor() {
    // Browser only: Mermaid needs a real document.
    afterRenderEffect(() => {
      const code = this.code().trim();
      const dark = this.theme.theme() === 'dark';
      const id = ++this.run;
      if (!code) {
        this.svg.set('');
        this.error.set('');
        return;
      }
      void renderDiagram(code, dark).then((r) => {
        if (id !== this.run) return;
        if (r.ok) {
          this.svg.set(r.svg);
          this.error.set('');
        } else this.error.set(r.error);
      });
    });
    onSharedInput((d) => this.setCode(d['input'] ?? ''));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onCode(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.code.set(value), 300);
  }

  protected setCode(value: string): void {
    clearTimeout(this.timer);
    this.code.set(value);
  }

  protected downloadSvg(): void {
    downloadText(this.svg(), 'diagram.svg', 'image/svg+xml');
  }

  protected async downloadPng(): Promise<void> {
    const doc = new DOMParser().parseFromString(this.svg(), 'image/svg+xml');
    const root = doc.documentElement;
    const box = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) ?? [0, 0, 800, 600];
    const scale = 2;
    root.setAttribute('width', String(box[2]));
    root.setAttribute('height', String(box[3]));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(box[2] * scale);
      canvas.height = Math.ceil(box[3] * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = this.theme.theme() === 'dark' ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
      if (blob) downloadBlob(blob, 'diagram.png');
    } catch {
      this.error.set('This diagram could not be turned into a PNG. Download the SVG instead.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
