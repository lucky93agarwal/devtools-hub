import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, viewChildren } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { VISIONS, Vision, simulate } from './simulate';

const CONTENT: ToolContent = {
  aboutHeading: 'About this colour blindness simulator',
  about:
    'See how a screenshot, chart, design or photo looks to people with colour vision deficiency. About 1 in 12 men ' +
    'and 1 in 200 women see colours differently, most often confusing red and green. The simulator shows your image ' +
    'with protanopia, deuteranopia, tritanopia and achromatopsia side by side, using the Machado 2009 model that ' +
    'accessibility tools and browsers use, with a severity slider for milder forms.',
  steps: [
    'Drop a screenshot of your app, website, chart or design.',
    'Compare the four simulations and move the severity slider for milder forms.',
    'Fix anything that relies on colour alone, such as red and green status dots, and download a simulation to share.',
  ],
  faq: [
    {
      question: 'What should I look for?',
      answer:
        'Information that only colour carries: error and success states, chart lines, map areas, links without ' +
        'underlines. Add icons, labels, patterns or stronger contrast so they still work in every simulation.',
    },
    { question: 'Is my screenshot uploaded?', answer: 'No. The simulation runs in your browser.' },
  ],
};

@Component({
  selector: 'app-color-blindness',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="color-blindness-simulator" [content]="content" [wide]="true" privacy="The simulation runs in your browser. Your image is never uploaded.">
      @if (!source()) {
        <app-upload-box title="Drop a screenshot or image here" buttonLabel="Choose image" [hint]="'Up to ' + maxSize + '. You can also paste a screenshot.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <label class="flex items-center gap-2 font-semibold">Severity {{ severity() }}%
            <input type="range" min="10" max="100" step="10" class="w-40 accent-brand" aria-label="Severity" [value]="severity()" (input)="severity.set($any($event.target).valueAsNumber)" />
          </label>
          <button type="button" class="btn-small" (click)="reset()">Another image</button>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <figure class="flex flex-col gap-1">
            <canvas #view data-vision="normal" class="w-full rounded-xl border border-line" role="img" aria-label="Normal vision"></canvas>
            <figcaption class="text-sm font-semibold">Normal vision</figcaption>
          </figure>
          @for (v of visions; track v.id) {
            <figure class="flex flex-col gap-1">
              <canvas #view [attr.data-vision]="v.id" class="w-full rounded-xl border border-line" role="img" [attr.aria-label]="v.label"></canvas>
              <figcaption class="flex items-start justify-between gap-2 text-sm">
                <span><span class="font-semibold">{{ v.label }}</span><br /><span class="text-muted">{{ v.note }}</span></span>
                <button type="button" class="btn-small shrink-0" [attr.aria-label]="'Download ' + v.label" (click)="download(v.id)">Download</button>
              </figcaption>
            </figure>
          }
        </div>
      }
    </app-tool-page>
  `,
})
export class ColorBlindness {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly visions = VISIONS;
  protected readonly source = signal<HTMLCanvasElement | null>(null);
  protected readonly severity = signal(100);
  protected readonly error = signal('');
  private readonly views = viewChildren<ElementRef<HTMLCanvasElement>>('view');
  private readonly encoder = inject(ImageEncoder);
  private fileName = 'image';

  constructor() {
    afterRenderEffect(() => {
      const source = this.source();
      const severity = this.severity() / 100;
      if (!source) return;
      const pixels = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height);
      for (const ref of this.views()) {
        const canvas = ref.nativeElement;
        const vision = canvas.dataset['vision'] as Vision | 'normal';
        canvas.width = source.width;
        canvas.height = source.height;
        const data = vision === 'normal' ? pixels.data : simulate(pixels.data, vision, severity);
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), source.width, source.height), 0, 0);
      }
    });
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    try {
      const bitmap = await this.encoder.read(file);
      // 1600 px is sharp enough to judge a design and keeps five copies fast.
      this.source.set(bitmapToCanvas(bitmap, 1600));
      bitmap.close();
      this.fileName = baseName(file.name);
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  protected async download(vision: Vision): Promise<void> {
    const canvas = this.views().find((ref) => ref.nativeElement.dataset['vision'] === vision)?.nativeElement;
    if (canvas) downloadBlob(await canvasToBlob(canvas), `${this.fileName}-${vision}.png`);
  }

  protected reset(): void {
    const source = this.source();
    if (source) source.width = source.height = 0;
    this.source.set(null);
  }
}
