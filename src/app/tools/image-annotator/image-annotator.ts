import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { Point, canvasPoint } from '../../shared/canvas-pointer';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob, copyCanvas } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { Shape, ShapeKind, drawMemeText, drawShape } from './shapes';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image annotator and meme maker',
  about:
    'Mark up screenshots for tutorials, bug reports and documentation, or make a quick meme. Draw arrows, boxes, ' +
    'circles and highlighter marks, add text labels and numbered steps, pick the colour and thickness, and undo ' +
    'anything. In Meme mode, add the classic white top and bottom captions with a black outline. Copy the result ' +
    'straight into Slack, Jira or GitHub, or download it as a PNG.',
  steps: [
    'Drop or paste a screenshot or picture.',
    'Choose Arrow, Box, Circle, Highlight, Text or Step and drag or click on the image; or fill in the meme captions.',
    'Copy the image or download it as a PNG.',
  ],
  faq: [
    {
      question: 'Can I move a mark after drawing it?',
      answer: 'Use Undo to remove the last mark and draw it again. Marks are drawn in the order you make them.',
    },
    { question: 'Is my image uploaded?', answer: 'No. Everything is drawn in your browser.' },
  ],
};

const COLOURS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#111827', '#ffffff'];

@Component({
  selector: 'app-image-annotator',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="image-annotator" [content]="content" [wide]="true" privacy="Your image is edited in your browser and never uploaded.">
      @if (!image()) {
        <app-upload-box title="Drop or paste an image here" buttonLabel="Choose image" [hint]="'Screenshots and photos up to ' + maxSize + '. Ctrl+V or Cmd+V pastes a screenshot.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <div class="flex flex-wrap rounded-3xl border border-line p-0.5" role="radiogroup" aria-label="Tool">
            @for (t of tools; track t.id) {
              <button type="button" role="radio" class="rounded-full px-3 py-1.5 font-semibold" [class]="tool() === t.id ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-checked]="tool() === t.id" (click)="tool.set(t.id)">{{ t.label }}</button>
            }
          </div>
          <div class="flex gap-1" role="radiogroup" aria-label="Colour">
            @for (c of colours; track c) {
              <button type="button" role="radio" class="size-7 rounded-full border-2" [class]="colour() === c ? 'border-brand' : 'border-line'" [style.background]="c" [attr.aria-label]="c" [attr.aria-checked]="colour() === c" (click)="colour.set(c)"></button>
            }
          </div>
          <label class="flex items-center gap-2 font-semibold">Size
            <input type="range" min="1" max="10" class="w-24 accent-brand" aria-label="Line size" [value]="size()" (input)="size.set($any($event.target).valueAsNumber)" />
          </label>
          <button type="button" class="btn-small" [disabled]="!shapes().length" (click)="undo()">Undo</button>
          <button type="button" class="btn-small" [disabled]="!shapes().length" (click)="shapes.set([])">Clear</button>
        </div>
        @if (tool() === 'text') {
          <label class="mt-2 flex items-center gap-2 text-sm"><span class="font-semibold">Text</span>
            <input class="field w-72" aria-label="Label text" [value]="label()" (input)="label.set($any($event.target).value)" />
            <span class="text-muted">then click on the image to place it</span>
          </label>
        }
        <details class="mt-2 text-sm">
          <summary class="cursor-pointer font-semibold">Meme captions</summary>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <input class="field" aria-label="Top text" placeholder="Top text" [value]="top()" (input)="top.set($any($event.target).value)" />
            <input class="field" aria-label="Bottom text" placeholder="Bottom text" [value]="bottom()" (input)="bottom.set($any($event.target).value)" />
          </div>
        </details>
        <div class="mt-3 overflow-auto rounded-xl border border-line">
          <canvas #canvas class="mx-auto block max-h-[75vh] max-w-full cursor-crosshair touch-none" role="img" aria-label="Image being annotated" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)"></canvas>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" (click)="download()">Download PNG</button>
          <button type="button" class="btn-secondary" (click)="copy()">{{ copied() ? 'Copied' : 'Copy image' }}</button>
          <button type="button" class="btn-secondary" (click)="reset()">Another image</button>
        </div>
      }
    </app-tool-page>
  `,
})
export class ImageAnnotator {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly colours = COLOURS;
  protected readonly tools: { id: ShapeKind; label: string }[] = [
    { id: 'arrow', label: 'Arrow' },
    { id: 'rect', label: 'Box' },
    { id: 'ellipse', label: 'Circle' },
    { id: 'highlight', label: 'Highlight' },
    { id: 'text', label: 'Text' },
    { id: 'step', label: 'Step' },
  ];
  protected readonly image = signal<HTMLCanvasElement | null>(null);
  protected readonly shapes = signal<Shape[]>([]);
  protected readonly tool = signal<ShapeKind>('arrow');
  protected readonly colour = signal('#ef4444');
  protected readonly size = signal(4);
  protected readonly label = signal('Click here');
  protected readonly top = signal('');
  protected readonly bottom = signal('');
  protected readonly error = signal('');
  protected readonly copied = signal(false);
  private readonly draft = signal<Shape | null>(null);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly encoder = inject(ImageEncoder);
  private fileName = 'image';

  constructor() {
    afterRenderEffect(() => {
      const canvas = this.canvas()?.nativeElement;
      const image = this.image();
      const shapes = this.shapes();
      const draft = this.draft();
      const top = this.top();
      const bottom = this.bottom();
      if (!canvas || !image) return;
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      let step = 0;
      for (const shape of [...shapes, ...(draft ? [draft] : [])]) drawShape(context, shape, shape.kind === 'step' ? ++step : 0);
      drawMemeText(context, top, image.width, image.height, 'top');
      drawMemeText(context, bottom, image.width, image.height, 'bottom');
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
      this.image.set(bitmapToCanvas(bitmap, 4096));
      bitmap.close();
      this.fileName = baseName(file.name);
      this.shapes.set([]);
      this.error.set('');
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  /** Line width in image pixels, so marks look the same on big and small images. */
  private lineWidth(): number {
    const image = this.image();
    return image ? Math.max(1, (this.size() / 4) * (Math.max(image.width, image.height) / 400)) : this.size();
  }

  private shapeAt(from: Point, to: Point): Shape {
    const kind = this.tool();
    const width = this.lineWidth();
    return {
      kind,
      from,
      to,
      colour: this.colour(),
      size: kind === 'text' ? width * 6 : kind === 'highlight' ? 0 : width,
      text: kind === 'text' ? this.label() : undefined,
    };
  }

  private start: Point | null = null;

  protected down(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    const point = canvasPoint(canvas, event);
    // Text and steps are placed with one click.
    if (this.tool() === 'text' || this.tool() === 'step') {
      if (this.tool() === 'text' && !this.label().trim()) return;
      this.shapes.update((list) => [...list, this.shapeAt(point, point)]);
      return;
    }
    canvas.setPointerCapture?.(event.pointerId);
    this.start = point;
  }

  protected move(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (canvas && this.start) this.draft.set(this.shapeAt(this.start, canvasPoint(canvas, event)));
  }

  protected up(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !this.start) return;
    const end = canvasPoint(canvas, event);
    const shape = this.shapeAt(this.start, end);
    this.start = null;
    this.draft.set(null);
    if (Math.hypot(end.x - shape.from.x, end.y - shape.from.y) > 4) this.shapes.update((list) => [...list, shape]);
  }

  protected undo(): void {
    this.shapes.update((list) => list.slice(0, -1));
  }

  protected async download(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (canvas) downloadBlob(await canvasToBlob(canvas), `${this.fileName}-annotated.png`);
  }

  protected async copy(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (canvas && (await copyCanvas(canvas))) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } else {
      this.error.set('This browser cannot copy images. Use Download instead.');
    }
  }

  protected reset(): void {
    const image = this.image();
    if (image) image.width = image.height = 0;
    this.image.set(null);
    this.shapes.set([]);
  }
}
