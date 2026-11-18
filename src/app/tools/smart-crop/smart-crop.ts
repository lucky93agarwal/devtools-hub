import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, viewChildren } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { buildZip } from '../image-converter/zip';
import { CROP_PRESETS, CropPreset, clampCrop, cropBox, isUpscaled } from './presets';

const CONTENT: ToolContent = {
  aboutHeading: 'About this smart image cropper',
  about:
    'Crop one photo for every social network at once without cutting off heads or the product. The cropper finds ' +
    'the important part of the picture (faces, skin tones, detail and colour) and places each crop around it, for ' +
    'YouTube thumbnails, Instagram posts and stories, LinkedIn, X, Facebook covers, link previews and profile ' +
    'pictures. Drag inside any preview to adjust it, then download one crop or all of them.',
  steps: [
    'Drop a photo.',
    'Tick the sizes you need. Each crop is placed around the main subject.',
    'Drag a preview to fine-tune it, then download one size or all as a ZIP.',
  ],
  faq: [
    {
      question: 'How does it find the subject?',
      answer:
        'It scores every part of the image for skin tones, edges and colourful detail, and, in browsers that offer ' +
        'face detection, for faces too. The crop with the best score wins. It is fast and private, but not perfect, ' +
        'so check each preview.',
    },
    {
      question: 'Why does a crop say "enlarged"?',
      answer: 'The photo is smaller than that size, so it was scaled up and may look soft. Use a bigger original if you can.',
    },
    { question: 'Is my photo uploaded?', answer: 'No. Cropping happens in your browser.' },
  ],
};

interface CropResult {
  preset: CropPreset;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FaceDetectorLike {
  detect(source: CanvasImageSource): Promise<{ boundingBox: DOMRectReadOnly }[]>;
}

@Component({
  selector: 'app-smart-crop',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="smart-crop" [content]="content" [wide]="true" privacy="Cropping happens in your browser. Your photo is never uploaded.">
      @if (!image()) {
        <app-upload-box title="Drop a photo here" buttonLabel="Choose image" [hint]="'JPG, PNG, HEIC, WebP and more, up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger">{{ error() }}</p> }
      } @else {
        <fieldset class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <legend class="mb-2 font-semibold">Sizes</legend>
          @for (p of presets; track p.id) {
            <label class="flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="chosen().includes(p.id)" (change)="toggle(p.id)" /> {{ p.label }} <span class="text-muted">{{ p.width }}×{{ p.height }}</span></label>
          }
        </fieldset>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" class="btn-primary" [disabled]="!crops().length || working()" (click)="downloadAll()">Download all ({{ crops().length }})</button>
          <button type="button" class="btn-secondary" (click)="reset()">Another photo</button>
          @if (working()) { <span class="text-muted" role="status">Finding the subject…</span> }
          @if (faces()) { <span class="text-muted">{{ faces() }} {{ faces() === 1 ? 'face' : 'faces' }} found</span> }
        </div>
        <ul class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Crops">
          @for (crop of crops(); track crop.preset.id) {
            <li class="card flex flex-col gap-2 p-3 text-sm">
              <canvas #preview [attr.data-id]="crop.preset.id" class="w-full cursor-grab touch-none rounded-lg" role="img" [attr.aria-label]="crop.preset.label + ' crop'" (pointerdown)="grab($event, crop)" (pointermove)="drag($event)" (pointerup)="drop()" (pointercancel)="drop()"></canvas>
              <div class="flex items-center justify-between gap-2">
                <span><span class="font-semibold">{{ crop.preset.label }}</span><br /><span class="text-muted">{{ crop.preset.width }}×{{ crop.preset.height }}@if (upscaled(crop)) { · enlarged }</span></span>
                <button type="button" class="btn-small" [attr.aria-label]="'Download ' + crop.preset.label" (click)="downloadOne(crop)">Download</button>
              </div>
            </li>
          }
        </ul>
      }
    </app-tool-page>
  `,
})
export class SmartCrop {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly presets = CROP_PRESETS;
  protected readonly image = signal<HTMLCanvasElement | null>(null);
  protected readonly chosen = signal<string[]>(['youtube', 'instagram-square', 'story', 'linkedin-post']);
  protected readonly crops = signal<CropResult[]>([]);
  protected readonly working = signal(false);
  protected readonly faces = signal(0);
  protected readonly error = signal('');
  private readonly previews = viewChildren<ElementRef<HTMLCanvasElement>>('preview');
  private readonly encoder = inject(ImageEncoder);
  private boosts: { x: number; y: number; width: number; height: number; weight: number }[] = [];
  private fileName = 'photo';
  private dragging: { crop: CropResult; x: number; y: number } | null = null;

  constructor() {
    afterRenderEffect(() => {
      const image = this.image();
      const crops = this.crops();
      if (!image) return;
      for (const ref of this.previews()) {
        const canvas = ref.nativeElement;
        const crop = crops.find((c) => c.preset.id === canvas.dataset['id']);
        if (!crop) continue;
        // Previews are drawn at up to 480 px wide; the download uses the full size.
        const scale = Math.min(1, 480 / crop.preset.width);
        canvas.width = Math.round(crop.preset.width * scale);
        canvas.height = Math.round(crop.preset.height * scale);
        const context = canvas.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
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
      const canvas = bitmapToCanvas(bitmap, 4096);
      bitmap.close();
      this.fileName = baseName(file.name);
      this.image.set(canvas);
      this.error.set('');
      await this.findFaces(canvas);
      await this.computeAll();
    } catch {
      this.error.set('This image could not be read.');
    }
  }

  /** Uses the browser's own face detector where there is one (Chrome on some systems). */
  private async findFaces(canvas: HTMLCanvasElement): Promise<void> {
    this.boosts = [];
    this.faces.set(0);
    const Detector = (globalThis as { FaceDetector?: new (options: { fastMode: boolean }) => FaceDetectorLike }).FaceDetector;
    if (!Detector) return;
    try {
      const faces = await new Detector({ fastMode: true }).detect(canvas);
      this.boosts = faces.map((f) => ({ x: f.boundingBox.x, y: f.boundingBox.y, width: f.boundingBox.width, height: f.boundingBox.height, weight: 1 }));
      this.faces.set(faces.length);
    } catch {
      // No face detection on this system; the skin-tone scoring still finds people.
    }
  }

  private async computeAll(): Promise<void> {
    const image = this.image();
    if (!image) return;
    this.working.set(true);
    const { default: smartcrop } = await import('smartcrop');
    const results: CropResult[] = [];
    for (const preset of CROP_PRESETS.filter((p) => this.chosen().includes(p.id))) {
      const existing = this.crops().find((c) => c.preset.id === preset.id);
      if (existing) {
        results.push(existing);
        continue;
      }
      const box = cropBox(image.width, image.height, preset.width, preset.height);
      const { topCrop } = await smartcrop.crop(image, { width: box.width, height: box.height, minScale: 1, boost: this.boosts });
      results.push({ preset, ...clampCrop({ ...topCrop, width: box.width, height: box.height }, image.width, image.height) });
    }
    this.crops.set(results);
    this.working.set(false);
  }

  protected toggle(id: string): void {
    this.chosen.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    void this.computeAll();
  }

  protected upscaled(crop: CropResult): boolean {
    return isUpscaled(crop.width, crop.preset.width);
  }

  protected grab(event: PointerEvent, crop: CropResult): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging = { crop, x: event.clientX, y: event.clientY };
  }

  /** Dragging moves the photo inside the frame. */
  protected drag(event: PointerEvent): void {
    const image = this.image();
    const drag = this.dragging;
    if (!image || !drag) return;
    const canvas = event.target as HTMLCanvasElement;
    const perPixel = drag.crop.width / canvas.getBoundingClientRect().width;
    const moved = clampCrop(
      { ...drag.crop, x: drag.crop.x - (event.clientX - drag.x) * perPixel, y: drag.crop.y - (event.clientY - drag.y) * perPixel },
      image.width,
      image.height,
    );
    const next = { ...drag.crop, ...moved };
    this.dragging = { crop: next, x: event.clientX, y: event.clientY };
    this.crops.update((list) => list.map((c) => (c.preset.id === next.preset.id ? next : c)));
  }

  protected drop(): void {
    this.dragging = null;
  }

  private async render(crop: CropResult): Promise<Blob> {
    const image = this.image()!;
    const canvas = document.createElement('canvas');
    canvas.width = crop.preset.width;
    canvas.height = crop.preset.height;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    canvas.width = canvas.height = 0;
    return blob;
  }

  protected async downloadOne(crop: CropResult): Promise<void> {
    downloadBlob(await this.render(crop), `${this.fileName}-${crop.preset.id}.jpg`);
  }

  protected async downloadAll(): Promise<void> {
    const files = [];
    for (const crop of this.crops()) files.push({ name: `${this.fileName}-${crop.preset.id}.jpg`, blob: await this.render(crop) });
    downloadBlob(await buildZip(files), `${this.fileName}-crops.zip`);
  }

  protected reset(): void {
    const image = this.image();
    if (image) image.width = image.height = 0;
    this.image.set(null);
    this.crops.set([]);
  }
}
