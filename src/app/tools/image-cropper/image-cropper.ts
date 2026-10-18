import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ImageToolsNav } from '../../shared/image-tools-nav/image-tools-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ConvertError, ImageFormat, sameFormat } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT, CONVERTER_TYPES, isSupportedImage } from '../image-converter/image-list';
import { IMAGE_CROPPER_CONTENT } from './content';
import { CropCanvas } from './crop-canvas';
import { ASPECTS, Handle, Rect, applyRatio, centredRect, dragRect, nudge, roundRect } from './crop-math';

type OutputFormat = 'same' | 'jpg' | 'png' | 'webp';

/** Handles around the box, with their position for the template. */
const HANDLES: { handle: Handle; style: string; cursor: string }[] = [
  { handle: 'nw', style: 'left:0;top:0', cursor: 'nwse-resize' },
  { handle: 'n', style: 'left:50%;top:0', cursor: 'ns-resize' },
  { handle: 'ne', style: 'left:100%;top:0', cursor: 'nesw-resize' },
  { handle: 'e', style: 'left:100%;top:50%', cursor: 'ew-resize' },
  { handle: 'se', style: 'left:100%;top:100%', cursor: 'nwse-resize' },
  { handle: 's', style: 'left:50%;top:100%', cursor: 'ns-resize' },
  { handle: 'sw', style: 'left:0;top:100%', cursor: 'nesw-resize' },
  { handle: 'w', style: 'left:0;top:50%', cursor: 'ew-resize' },
];

@Component({
  selector: 'app-image-cropper',
  imports: [Icon, UploadBox, ToolInfoSection, ImageToolsNav],
  templateUrl: './image-cropper.html',
})
export class ImageCropper {
  protected readonly tool = TOOLS.find((t) => t.path === 'image-cropper')!;
  protected readonly content = IMAGE_CROPPER_CONTENT;
  protected readonly icons = ICONS;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly aspects = ASPECTS;
  protected readonly handles = HANDLES;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);

  protected readonly file = signal<File | null>(null);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly imageWidth = signal(0);
  protected readonly imageHeight = signal(0);
  protected readonly rect = signal<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  protected readonly aspectId = signal('free');
  protected readonly circle = signal(false);
  protected readonly output = signal<OutputFormat>('same');
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  protected readonly ratio = computed(() => (this.circle() ? 1 : ASPECTS.find((a) => a.id === this.aspectId())!.ratio));
  /** The crop in whole pixels, as shown in the number fields and saved. */
  protected readonly pixels = computed(() => roundRect(this.rect(), this.imageWidth(), this.imageHeight()));
  /** Position of the box over the picture, in percent. */
  protected readonly box = computed(() => {
    const rect = this.rect();
    const w = this.imageWidth() || 1;
    const h = this.imageHeight() || 1;
    return { left: (rect.x / w) * 100, top: (rect.y / h) * 100, width: (rect.width / w) * 100, height: (rect.height / h) * 100 };
  });

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly cropCanvas = inject(CropCanvas);
  private readonly analytics = inject(Analytics);
  private canvas: HTMLCanvasElement | null = null;
  private drag: { handle: Handle; startX: number; startY: number; start: Rect } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releaseUrl());
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    this.error.set('');
    if (!isSupportedImage(file, CONVERTER_TYPES)) {
      this.error.set('Choose an image file, such as JPG, PNG, WebP or HEIC.');
      return;
    }
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    try {
      this.canvas = await this.cropCanvas.open(file);
      this.file.set(file);
      await this.showCanvas(true);
    } catch (e) {
      this.error.set(e instanceof ConvertError ? e.message : 'This image could not be opened.');
    }
  }

  protected setAspect(id: string): void {
    this.aspectId.set(id);
    this.rect.set(applyRatio(this.rect(), this.ratio(), this.imageWidth(), this.imageHeight()));
  }

  protected setCircle(on: boolean): void {
    this.circle.set(on);
    this.rect.set(applyRatio(this.rect(), this.ratio(), this.imageWidth(), this.imageHeight()));
  }

  /** Typed values for x, y, width or height, kept inside the image and to the ratio. */
  protected setField(field: keyof Rect, value: string): void {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const next = { ...this.rect(), [field]: Math.max(0, number) };
    const ratio = this.ratio();
    if (ratio && field === 'width') next.height = next.width / ratio;
    if (ratio && field === 'height') next.width = next.height * ratio;
    const fitted = applyRatio(roundRect(next, this.imageWidth(), this.imageHeight()), ratio, this.imageWidth(), this.imageHeight());
    this.rect.set(fitted);
  }

  protected async rotate(clockwise: boolean): Promise<void> {
    if (!this.canvas) return;
    this.canvas = this.cropCanvas.rotate(this.canvas, clockwise);
    await this.showCanvas(true);
  }

  protected async flip(horizontal: boolean): Promise<void> {
    if (!this.canvas) return;
    this.canvas = this.cropCanvas.flip(this.canvas, horizontal);
    // The same box, mirrored.
    const rect = this.rect();
    this.rect.set(
      horizontal
        ? { ...rect, x: this.imageWidth() - rect.x - rect.width }
        : { ...rect, y: this.imageHeight() - rect.y - rect.height },
    );
    await this.showCanvas(false);
  }

  protected startDrag(event: PointerEvent, handle: Handle): void {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.drag = { handle, startX: event.clientX, startY: event.clientY, start: this.rect() };
  }

  protected moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    const frame = this.frame()?.nativeElement;
    if (!drag || !frame) return;
    // Screen pixels to image pixels.
    const scale = this.imageWidth() / frame.getBoundingClientRect().width;
    const dx = (event.clientX - drag.startX) * scale;
    const dy = (event.clientY - drag.startY) * scale;
    this.rect.set(dragRect(drag.start, drag.handle, dx, dy, this.imageWidth(), this.imageHeight(), this.ratio()));
  }

  protected endDrag(): void {
    this.drag = null;
  }

  /** Arrow keys move the box by 1 px, with Shift by 10 px. */
  protected onKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.rect.set(nudge(this.rect(), move[0], move[1], this.imageWidth(), this.imageHeight()));
  }

  protected async download(): Promise<void> {
    const file = this.file();
    if (!this.canvas || !file || this.saving()) return;
    this.saving.set(true);
    try {
      // Transparent corners need a format with transparency.
      let format: ImageFormat = this.output() === 'same' ? sameFormat(file) : this.output() as ImageFormat;
      if (this.circle() && format !== 'webp') format = 'png';
      const rect = this.pixels();
      const blob = await this.cropCanvas.crop(this.canvas, rect, this.circle(), format, 0.92);
      downloadBlob(blob, `${baseName(file.name)}-cropped-${rect.width}x${rect.height}.${format}`);
      this.analytics.track('image-crop', { aspect: this.circle() ? 'circle' : this.aspectId(), format });
    } catch {
      this.error.set('The cropped image could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }

  protected reset(): void {
    this.releaseUrl();
    this.canvas = null;
    this.file.set(null);
  }

  /** Shows the current canvas; `newBox` starts a fresh crop box for its size. */
  private async showCanvas(newBox: boolean): Promise<void> {
    const canvas = this.canvas!;
    const url = URL.createObjectURL(await this.cropCanvas.preview(canvas));
    this.releaseUrl();
    this.imageUrl.set(url);
    this.imageWidth.set(canvas.width);
    this.imageHeight.set(canvas.height);
    if (newBox) this.rect.set(centredRect(canvas.width, canvas.height, this.ratio()));
  }

  private releaseUrl(): void {
    const url = this.imageUrl();
    if (url) URL.revokeObjectURL(url);
    this.imageUrl.set(null);
  }
}
