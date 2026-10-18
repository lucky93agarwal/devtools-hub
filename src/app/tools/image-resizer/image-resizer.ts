import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ImageToolsNav } from '../../shared/image-tools-nav/image-tools-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ConvertError, ImageFormat, labelOf, sameFormat } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT, DEFAULT_IMAGE_LIMITS, describePlan, limitsHit, planAdd } from '../image-converter/image-list';
import { buildZip } from '../image-converter/zip';
import { IMAGE_RESIZER_CONTENT } from './content';
import { FitMode, PRESETS, SizeSpec } from './resize-math';
import { ResizeResult, Resizer } from './resizer';

export interface ResizeItem {
  id: number;
  file: File;
  previewUrl: string;
  state: 'ready' | 'working' | 'done' | 'error';
  result?: ResizeResult & { name: string };
  error?: string;
}

export type SizeMode = 'size' | 'percent' | 'preset';
export type OutputFormat = 'same' | 'jpg' | 'png' | 'webp' | 'avif';

@Component({
  selector: 'app-image-resizer',
  imports: [Icon, UploadBox, ToolInfoSection, ImageToolsNav],
  templateUrl: './image-resizer.html',
})
export class ImageResizer {
  protected readonly tool = TOOLS.find((t) => t.path === 'image-resizer')!;
  protected readonly content = IMAGE_RESIZER_CONTENT;
  protected readonly icons = ICONS;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly limits = DEFAULT_IMAGE_LIMITS;
  protected readonly presets = PRESETS;
  protected readonly formatBytes = formatBytes;
  protected readonly fits: { value: FitMode; label: string }[] = [
    { value: 'fit', label: 'Fit inside (keep shape)' },
    { value: 'fill', label: 'Fill and crop edges' },
    { value: 'pad', label: 'Fit and fill sides with colour' },
    { value: 'stretch', label: 'Stretch to exact size' },
  ];
  protected readonly outputs: { value: OutputFormat; label: string }[] = [
    { value: 'same', label: 'Same as original' },
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
    { value: 'avif', label: 'AVIF' },
  ];

  protected readonly items = signal<ResizeItem[]>([]);
  protected readonly notes = signal<string[]>([]);
  protected readonly mode = signal<SizeMode>('size');
  protected readonly width = signal<number | null>(1080);
  protected readonly height = signal<number | null>(null);
  protected readonly fit = signal<FitMode>('fit');
  protected readonly percent = signal(50);
  protected readonly presetId = signal(PRESETS[0].id);
  protected readonly output = signal<OutputFormat>('same');
  protected readonly quality = signal(90);
  protected readonly background = signal('#ffffff');
  /** Size limit in KB, or null for none. */
  protected readonly maxKb = signal<number | null>(null);
  protected readonly working = signal(false);
  protected readonly zipping = signal(false);

  protected readonly spec = computed<SizeSpec>(() => {
    if (this.mode() === 'percent') return { mode: 'percent', percent: this.percent() };
    if (this.mode() === 'preset') {
      const preset = PRESETS.find((p) => p.id === this.presetId())!;
      return { mode: 'size', width: preset.width, height: preset.height, fit: 'fill' };
    }
    return { mode: 'size', width: this.width(), height: this.height(), fit: this.fit() };
  });
  /** The fit choice only matters when both sides are set. */
  protected readonly bothSides = computed(() => this.mode() === 'size' && !!this.width() && !!this.height());
  protected readonly lossy = computed(() => ['same', 'jpg', 'webp', 'avif'].includes(this.output()));
  protected readonly doneItems = computed(() => this.items().filter((item) => item.state === 'done'));
  protected readonly pending = computed(() => this.items().filter((item) => item.state !== 'done').length);
  protected readonly full = computed(() => this.items().length >= this.limits.maxImages);

  private readonly resizer = inject(Resizer);
  private readonly analytics = inject(Analytics);
  private nextId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.items().forEach((item) => URL.revokeObjectURL(item.previewUrl)));
  }

  protected addFiles(files: File[]): void {
    const plan = planAdd(
      this.items().map((item) => item.file),
      files,
      this.limits,
    );
    const added = plan.added.map(
      (file): ResizeItem => ({ id: ++this.nextId, file, previewUrl: URL.createObjectURL(file), state: 'ready' }),
    );
    this.items.update((items) => [...items, ...added]);
    this.notes.set(describePlan(plan, this.limits));
    for (const limit of limitsHit(plan)) this.analytics.limitHit('image-resizer', limit);
  }

  /** Reads a number input; empty means "not set". */
  protected numberOrNull(value: string): number | null {
    const number = Math.round(Number(value));
    return value.trim() && Number.isFinite(number) && number > 0 ? number : null;
  }

  /** Any setting change makes earlier results out of date. */
  protected changed(): void {
    this.items.update((items) =>
      items.map((item) => (item.state === 'working' ? item : { ...item, state: 'ready', result: undefined, error: undefined })),
    );
  }

  protected async resizeAll(): Promise<void> {
    if (this.working()) return;
    const queue = this.items().filter((item) => item.state !== 'done');
    if (!queue.length) return;
    if (this.mode() === 'size' && !this.width() && !this.height()) {
      this.notes.set(['Enter a width, a height or both.']);
      return;
    }
    this.working.set(true);
    const spec = this.spec();
    try {
      for (const item of queue) {
        if (!this.items().some((other) => other.id === item.id)) continue;
        this.patch(item.id, { state: 'working', error: undefined });
        const format: ImageFormat = this.output() === 'same' ? sameFormat(item.file) : (this.output() as ImageFormat);
        try {
          const result = await this.resizer.resize(item.file, spec, {
            format,
            quality: this.quality() / 100,
            background: this.background(),
            maxBytes: this.maxKb() ? this.maxKb()! * 1024 : null,
          });
          const name = `${baseName(item.file.name)}-${result.width}x${result.height}.${format}`;
          this.patch(item.id, { state: 'done', result: { ...result, name } });
        } catch (e) {
          const message = e instanceof ConvertError ? e.message : 'This image could not be resized.';
          this.patch(item.id, { state: 'error', error: message });
        }
      }
    } finally {
      this.working.set(false);
      this.analytics.track('image-resize', { mode: this.mode(), images: queue.length, limit: !!this.maxKb() });
    }
  }

  protected download(item: ResizeItem): void {
    if (item.result) downloadBlob(item.result.blob, item.result.name);
  }

  protected async downloadZip(): Promise<void> {
    const done = this.doneItems();
    if (!done.length || this.zipping()) return;
    this.zipping.set(true);
    try {
      downloadBlob(await buildZip(done.map((item) => item.result!)), 'resized-images.zip');
    } finally {
      this.zipping.set(false);
    }
  }

  protected remove(item: ResizeItem): void {
    URL.revokeObjectURL(item.previewUrl);
    this.items.update((items) => items.filter((other) => other.id !== item.id));
    this.notes.set([]);
  }

  protected clearAll(): void {
    this.items().forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.items.set([]);
    this.notes.set([]);
  }

  protected formatLabel(item: ResizeItem): string {
    return labelOf(this.output() === 'same' ? sameFormat(item.file) : (this.output() as ImageFormat));
  }

  private patch(id: number, changes: Partial<ResizeItem>): void {
    this.items.update((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
}
