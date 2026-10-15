import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ConvertError, FORMATS, ImageEncoder, ImageFormat, labelOf, outputName } from './image-encoder';
import { DEFAULT_IMAGE_LIMITS, IMAGE_ACCEPT, describePlan, planAdd } from './image-list';
import { buildZip } from './zip';

/** One image in the batch and where it is in the conversion. */
export interface ImageItem {
  id: number;
  file: File;
  /** Object URL for the thumbnail; revoked when the item is removed. */
  previewUrl: string;
  /** waiting: in the current run but not started yet. */
  state: 'ready' | 'waiting' | 'converting' | 'done' | 'error';
  result?: { blob: Blob; name: string };
  error?: string;
}

@Component({
  selector: 'app-image-converter',
  imports: [Icon, UploadBox],
  templateUrl: './image-converter.html',
})
export class ImageConverter {
  protected readonly tool = TOOLS.find((t) => t.path === 'image-converter')!;
  protected readonly icons = ICONS;
  protected readonly limits = DEFAULT_IMAGE_LIMITS;
  protected readonly accept = IMAGE_ACCEPT;
  protected readonly formats = FORMATS;
  protected readonly formatBytes = formatBytes;

  protected readonly items = signal<ImageItem[]>([]);
  /** Notes about files that were not added, from the last time files were chosen. */
  protected readonly notes = signal<string[]>([]);
  protected readonly format = signal<ImageFormat>('webp');
  protected readonly converting = signal(false);
  protected readonly zipping = signal(false);
  /** Size of the current run, for the overall progress bar. */
  protected readonly runTotal = signal(0);

  protected readonly count = computed(() => this.items().length);
  protected readonly full = computed(() => this.count() >= this.limits.maxImages);
  protected readonly totalBytes = computed(() => this.items().reduce((sum, item) => sum + item.file.size, 0));
  protected readonly pending = computed(() => this.items().filter((item) => item.state !== 'done').length);
  protected readonly doneItems = computed(() => this.items().filter((item) => item.state === 'done'));
  protected readonly failedCount = computed(() => this.items().filter((item) => item.state === 'error').length);
  /** Images finished (done or failed) in the current run. */
  protected readonly runFinished = computed(
    () => this.runTotal() - this.items().filter((item) => item.state === 'waiting' || item.state === 'converting').length,
  );
  protected readonly runPercent = computed(() =>
    this.runTotal() ? Math.round((this.runFinished() / this.runTotal()) * 100) : 0,
  );

  private readonly encoder = inject(ImageEncoder);
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
    const added: ImageItem[] = plan.added.map((file) => ({
      id: ++this.nextId,
      file,
      previewUrl: URL.createObjectURL(file),
      state: 'ready',
    }));
    this.items.update((items) => [...items, ...added]);
    this.notes.set(describePlan(plan, this.limits));
  }

  /** A new target format makes earlier results out of date. */
  protected setFormat(format: ImageFormat): void {
    if (format === this.format()) return;
    this.format.set(format);
    this.items.update((items) =>
      items.map((item) => (item.state === 'converting' ? item : { ...item, state: 'ready', result: undefined, error: undefined })),
    );
  }

  /** Converts every image that is not done yet, one at a time to keep memory use low. */
  protected async convertAll(): Promise<void> {
    if (this.converting()) return;
    const queue = this.items().filter((item) => item.state !== 'done');
    if (!queue.length) return;
    this.converting.set(true);
    this.runTotal.set(queue.length);
    const format = this.format();
    for (const item of queue) this.patch(item.id, { state: 'waiting', error: undefined });
    try {
      for (const item of queue) {
        // The item may have been removed while an earlier one was converting.
        if (!this.items().some((other) => other.id === item.id)) continue;
        this.patch(item.id, { state: 'converting', error: undefined });
        try {
          const blob = await this.encoder.convert(item.file, format);
          this.patch(item.id, { state: 'done', result: { blob, name: outputName(item.file.name, format) } });
        } catch (e) {
          const message = e instanceof ConvertError ? e.message : 'This image could not be converted.';
          this.patch(item.id, { state: 'error', error: message });
        }
      }
    } finally {
      this.converting.set(false);
    }
  }

  protected download(item: ImageItem): void {
    if (item.result) downloadBlob(item.result.blob, item.result.name);
  }

  /** One ZIP with every converted image. */
  protected async downloadZip(): Promise<void> {
    const done = this.doneItems();
    if (!done.length || this.zipping()) return;
    this.zipping.set(true);
    try {
      const zip = await buildZip(done.map((item) => item.result!));
      downloadBlob(zip, `converted-images-${this.format()}.zip`);
    } finally {
      this.zipping.set(false);
    }
  }

  protected remove(item: ImageItem): void {
    URL.revokeObjectURL(item.previewUrl);
    if (item.state === 'waiting') this.runTotal.update((n) => n - 1);
    this.items.update((items) => items.filter((other) => other.id !== item.id));
    this.notes.set([]);
  }

  protected clearAll(): void {
    this.items().forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.items.set([]);
    this.notes.set([]);
    this.runTotal.set(0);
  }

  /** Short type label, for example "PNG". */
  protected typeLabel(file: File): string {
    const fromType = file.type.split('/')[1];
    const fromName = file.name.split('.').pop();
    return (fromType || fromName || '').replace('jpeg', 'jpg').toUpperCase();
  }

  /** Size change in plain words, for example "62% smaller". */
  protected sizeChange(before: number, after: number): string {
    if (!before) return '';
    const percent = Math.round(((after - before) / before) * 100);
    if (percent === 0) return 'same size';
    return percent < 0 ? `${-percent}% smaller` : `${percent}% larger`;
  }

  protected readonly labelOf = labelOf;

  private patch(id: number, changes: Partial<ImageItem>): void {
    this.items.update((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
}
