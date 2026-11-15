import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';

export type BrushMode = 'erase' | 'restore';

/** Points a stroke passes through between two pointer events, so fast strokes leave no gaps. */
export function strokePoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
): { x: number; y: number }[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, radius / 3);
  const count = Math.max(1, Math.ceil(distance / step));
  const points: { x: number; y: number }[] = [];
  for (let i = 1; i <= count; i++) {
    points.push({ x: from.x + ((to.x - from.x) * i) / count, y: from.y + ((to.y - from.y) * i) / count });
  }
  return points;
}

/** How many undo steps to keep: fewer for big images, as each step is a full copy of the pixels. */
export function undoDepth(width: number, height: number): number {
  const pixels = width * height;
  if (pixels > 8_000_000) return 3;
  if (pixels > 3_000_000) return 6;
  return 15;
}

/**
 * Lets the user fix the cut-out by hand: Erase removes what the AI kept,
 * Restore paints back pixels of the original photo.
 */
@Component({
  selector: 'app-mask-editor',
  template: `
    <div class="card flex flex-col gap-3 p-4">
      <div class="flex flex-wrap items-center gap-3 text-sm leading-5">
        <div class="flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Brush">
          <button
            type="button"
            role="radio"
            class="rounded-full px-3 py-1.5 font-semibold"
            [class]="mode() === 'erase' ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-checked]="mode() === 'erase'"
            (click)="mode.set('erase')"
          >
            Erase
          </button>
          <button
            type="button"
            role="radio"
            class="rounded-full px-3 py-1.5 font-semibold"
            [class]="mode() === 'restore' ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-checked]="mode() === 'restore'"
            (click)="mode.set('restore')"
          >
            Restore
          </button>
        </div>
        <label class="flex items-center gap-2">
          <span class="font-semibold">Brush {{ size() }}px</span>
          <input
            type="range"
            min="4"
            max="120"
            class="w-32 accent-brand"
            aria-label="Brush size"
            [value]="size()"
            (input)="size.set($any($event.target).valueAsNumber)"
          />
        </label>
        <button type="button" class="btn-small" [disabled]="!canUndo()" (click)="undo()">Undo</button>
        <button type="button" class="btn-small" (click)="resetToAi()">Start over</button>
      </div>
      <p class="text-sm leading-5 text-muted">
        Paint on the image. Erase removes leftover background; Restore brings back parts the AI cut away.
      </p>
      <div
        class="relative overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
        (pointerleave)="cursor.set(null)"
      >
        <canvas
          #canvas
          class="mx-auto block max-h-[70vh] max-w-full touch-none"
          [style.cursor]="'none'"
          role="img"
          aria-label="Cut-out being edited"
          (pointerdown)="down($event)"
          (pointermove)="move($event)"
          (pointerup)="up($event)"
          (pointercancel)="up($event)"
        ></canvas>
        @if (cursor(); as c) {
          <span
            class="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
            [style.left.px]="c.x - size() / 2"
            [style.top.px]="c.y - size() / 2"
            [style.width.px]="size()"
            [style.height.px]="size()"
          ></span>
        }
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" [disabled]="saving()" (click)="apply()">
          {{ saving() ? 'Saving…' : 'Apply changes' }}
        </button>
        <button type="button" class="btn-secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </div>
  `,
})
export class MaskEditor {
  /** The original photo. */
  readonly original = input.required<Blob>();
  /** The cut-out to edit, as a PNG with transparency. */
  readonly cutout = input.required<Blob>();
  readonly saved = output<Blob>();
  readonly cancelled = output<void>();

  protected readonly mode = signal<BrushMode>('erase');
  /** Brush diameter in screen pixels. */
  protected readonly size = signal(30);
  protected readonly cursor = signal<{ x: number; y: number } | null>(null);
  protected readonly canUndo = signal(false);
  protected readonly saving = signal(false);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private source?: HTMLCanvasElement;
  private aiResult?: ImageBitmap;
  private history: ImageData[] = [];
  private last: { x: number; y: number } | null = null;
  private drawing = false;

  constructor() {
    afterNextRender(() => void this.load());
    inject(DestroyRef).onDestroy(() => {
      this.aiResult?.close();
      if (this.source) this.source.width = this.source.height = 0;
    });
  }

  private async load(): Promise<void> {
    const cutout = await createImageBitmap(this.cutout());
    this.aiResult = cutout;
    const canvas = this.canvas().nativeElement;
    canvas.width = cutout.width;
    canvas.height = cutout.height;
    this.context().drawImage(cutout, 0, 0);
    // The original, scaled to the cut-out's size, is where Restore copies pixels from.
    const photo = await createImageBitmap(this.original());
    const source = document.createElement('canvas');
    source.width = cutout.width;
    source.height = cutout.height;
    source.getContext('2d')!.drawImage(photo, 0, 0, cutout.width, cutout.height);
    photo.close();
    this.source = source;
  }

  private context(): CanvasRenderingContext2D {
    return this.canvas().nativeElement.getContext('2d', { willReadFrequently: true })!;
  }

  /** Pointer position in image pixels, and the brush radius in image pixels. */
  private toImage(event: PointerEvent): { x: number; y: number; radius: number } {
    const canvas = this.canvas().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale, radius: (this.size() / 2) * scale };
  }

  protected down(event: PointerEvent): void {
    if (!this.source) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.saveStep();
    this.drawing = true;
    const point = this.toImage(event);
    this.last = point;
    this.paint([point], point.radius);
  }

  protected move(event: PointerEvent): void {
    const parent = this.canvas().nativeElement.parentElement!.getBoundingClientRect();
    this.cursor.set({ x: event.clientX - parent.left, y: event.clientY - parent.top });
    if (!this.drawing || !this.last) return;
    const point = this.toImage(event);
    this.paint(strokePoints(this.last, point, point.radius), point.radius);
    this.last = point;
  }

  protected up(event: PointerEvent): void {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.drawing = false;
    this.last = null;
  }

  private paint(points: { x: number; y: number }[], radius: number): void {
    const context = this.context();
    context.save();
    context.beginPath();
    for (const point of points) {
      context.moveTo(point.x + radius, point.y);
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    if (this.mode() === 'erase') {
      context.globalCompositeOperation = 'destination-out';
      context.fill();
    } else if (this.source) {
      // Clear the area first so half-transparent edge pixels become fully the original again.
      context.globalCompositeOperation = 'destination-out';
      context.fill();
      context.globalCompositeOperation = 'source-over';
      context.clip();
      context.drawImage(this.source, 0, 0);
    }
    context.restore();
  }

  private saveStep(): void {
    const canvas = this.canvas().nativeElement;
    this.history.push(this.context().getImageData(0, 0, canvas.width, canvas.height));
    const depth = undoDepth(canvas.width, canvas.height);
    if (this.history.length > depth) this.history.shift();
    this.canUndo.set(true);
  }

  protected undo(): void {
    const step = this.history.pop();
    if (step) this.context().putImageData(step, 0, 0);
    this.canUndo.set(this.history.length > 0);
  }

  protected resetToAi(): void {
    if (!this.aiResult) return;
    this.saveStep();
    const canvas = this.canvas().nativeElement;
    const context = this.context();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(this.aiResult, 0, 0);
  }

  protected async apply(): Promise<void> {
    this.saving.set(true);
    const blob = await new Promise<Blob | null>((resolve) => this.canvas().nativeElement.toBlob(resolve, 'image/png'));
    this.saving.set(false);
    if (blob) this.saved.emit(blob);
  }
}
