import { Component, computed, effect, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { optimizeSvg, svgToVector, toComposeImageVector, toVectorDrawable } from './vector';

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Exported from a design tool -->
  <title>Cart</title>
  <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="10" cy="20.5" r="1.5" fill="#4F46E5"/>
  <circle cx="17" cy="20.5" r="1.5" fill="#4F46E5"/>
</svg>
`;

type Output = 'svg' | 'vector' | 'compose';

const CONTENT: ToolContent = {
  aboutHeading: 'About this SVG optimizer and VectorDrawable converter',
  about:
    'SVG icons exported from Figma, Sketch or Illustrator carry comments, editor metadata and long numbers. The ' +
    'optimizer removes them with SVGO, often halving the size. For Android, the same SVG becomes a VectorDrawable XML ' +
    'file for res/drawable, or a Jetpack Compose ImageVector in Kotlin, with rectangles, circles, lines and polygons ' +
    'turned into paths and colours written the Android way. Anything VectorDrawable cannot draw, such as gradients ' +
    'and text, is listed.',
  steps: [
    'Paste the SVG code or open an .svg file.',
    'Choose Optimized SVG, Android VectorDrawable or Jetpack Compose.',
    'Check the preview and any warnings.',
    'Copy or download the result. VectorDrawable files go in res/drawable.',
  ],
  faq: [
    { question: 'Is this the same as Android Studio’s Vector Asset tool?', answer: 'It does the same job for typical icons, and also writes Compose ImageVector code. For complex art with gradients, Android Studio’s importer is more complete.' },
    { question: 'Why is my icon black?', answer: 'Shapes without a fill are black in SVG, and currentColor has no meaning on Android. Set android:tint, or change the fillColor values.' },
    { question: 'Is the optimized SVG safe to use?', answer: 'SVGO keeps how the image looks. Titles stay, for screen readers. Test the result in your app or page.' },
  ],
};

@Component({
  selector: 'app-svg-converter',
  imports: [Icon, CodeEditor, CopyButton, ToolPage],
  template: `
    <app-tool-page path="svg-converter" [content]="content" [wide]="true" privacy="Converted in your browser. Your SVG files are never uploaded.">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Output">
          @for (tab of tabs; track tab.value) {
            <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
              [class]="output() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="output() === tab.value" (click)="output.set(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>
        <button type="button" class="btn-small" (click)="svg.set(sample)">Try a sample</button>
        <button type="button" class="btn-small" (click)="fileInput.click()"><app-icon [path]="icons.upload" [size]="16" /> Open .svg</button>
        <input #fileInput type="file" accept=".svg,image/svg+xml" class="sr-only" tabindex="-1" aria-hidden="true" (change)="onFile(fileInput)" />
        @if (output() === 'compose') {
          <label class="flex items-center gap-2 text-sm"><span class="font-semibold">Name</span><input class="field w-36 py-1 font-mono" [value]="name()" (input)="name.set($any($event.target).value || 'MyIcon')" /></label>
        }
      </div>

      <div class="mt-4 min-h-6 text-sm" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (output() === 'svg' && optimized()) {
          <p class="font-semibold">{{ sizes() }}</p>
        }
        @for (w of warnings(); track w) {
          <p class="mt-1 rounded-xl border border-warning bg-warning/10 px-4 py-2">{{ w }}</p>
        }
      </div>

      <div class="mt-2 grid gap-4 lg:grid-cols-[1fr_1fr_12rem]">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold">SVG</span>
          <app-code-editor class="h-80 lg:h-[28rem]" ariaLabel="SVG input" placeholder="Paste SVG code here." [value]="svg()" (valueChange)="svg.set($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">{{ outputLabel() }}</span>
            <span class="flex gap-2">
              <app-copy-button [text]="result()" />
              <button type="button" class="btn-small" [disabled]="!result()" (click)="download()">Download</button>
            </span>
          </div>
          <app-code-editor class="h-80 lg:h-[28rem]" ariaLabel="Converted output" placeholder="The result appears here." [readOnly]="true" [value]="result()" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold">Preview</span>
          <div class="checkerboard grid aspect-square place-items-center rounded-xl border border-line p-4">
            @if (preview(); as src) {
              <img [src]="src" alt="SVG preview" class="max-h-full max-w-full" />
            }
          </div>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class SvgConverter {
  protected readonly content = CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = SAMPLE;
  protected readonly tabs = [
    { value: 'svg' as const, label: 'Optimized SVG' },
    { value: 'vector' as const, label: 'Android VectorDrawable' },
    { value: 'compose' as const, label: 'Jetpack Compose' },
  ];
  protected readonly output = signal<Output>('vector');
  protected readonly svg = signal('');
  protected readonly name = signal('MyIcon');
  protected readonly optimized = signal('');
  private readonly optimizeError = signal<string | null>(null);

  private readonly vector = computed(() => (this.svg().trim() ? svgToVector(this.svg()) : null));
  protected readonly result = computed(() => {
    if (this.output() === 'svg') return this.optimized();
    const v = this.vector();
    if (!v?.ok) return '';
    return this.output() === 'vector' ? toVectorDrawable(v.image) : toComposeImageVector(v.image, this.name());
  });
  protected readonly error = computed(() => {
    if (!this.svg().trim()) return null;
    if (this.output() === 'svg') return this.optimizeError();
    const v = this.vector();
    return v && !v.ok ? v.error : null;
  });
  protected readonly warnings = computed(() => {
    const v = this.vector();
    return this.output() !== 'svg' && v?.ok ? v.image.warnings : [];
  });
  protected readonly sizes = computed(() => {
    const before = new Blob([this.svg()]).size;
    const after = new Blob([this.optimized()]).size;
    return `${formatBytes(before)} → ${formatBytes(after)} (${Math.max(0, Math.round((1 - after / before) * 100))}% smaller)`;
  });
  /** An <img> never runs scripts inside an SVG, so showing pasted SVG this way is safe. */
  protected readonly preview = computed(() => (this.svg().trim().startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.svg())}` : null));
  protected readonly outputLabel = computed(() => this.tabs.find((t) => t.value === this.output())!.label);

  constructor() {
    effect(() => {
      const svg = this.svg();
      if (!svg.trim()) {
        this.optimized.set('');
        return;
      }
      void optimizeSvg(svg).then((r) => {
        this.optimized.set(r.ok ? r.svg : '');
        this.optimizeError.set(r.ok ? null : r.error);
      });
    });
    onSharedInput((d) => this.svg.set(d['input'] ?? ''));
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file) this.svg.set(await file.text());
  }

  protected download(): void {
    const names: Record<Output, [string, string]> = { svg: ['icon.svg', 'image/svg+xml'], vector: ['ic_icon.xml', 'application/xml'], compose: [`${this.name()}.kt`, 'text/plain'] };
    const [file, type] = names[this.output()];
    downloadText(this.result(), file, type);
  }
}
