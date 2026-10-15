import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { DEFAULT_IMAGE_LIMITS, IMAGE_ACCEPT, describePlan, planAdd } from './image-list';

/** One image in the batch. */
export interface ImageItem {
  id: number;
  file: File;
  /** Object URL for the thumbnail; revoked when the item is removed. */
  previewUrl: string;
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
  protected readonly formatBytes = formatBytes;

  protected readonly items = signal<ImageItem[]>([]);
  /** Notes about files that were not added, from the last time files were chosen. */
  protected readonly notes = signal<string[]>([]);

  protected readonly count = computed(() => this.items().length);
  protected readonly full = computed(() => this.count() >= this.limits.maxImages);
  protected readonly totalBytes = computed(() => this.items().reduce((sum, item) => sum + item.file.size, 0));

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
    const added = plan.added.map((file) => ({ id: ++this.nextId, file, previewUrl: URL.createObjectURL(file) }));
    this.items.update((items) => [...items, ...added]);
    this.notes.set(describePlan(plan, this.limits));
  }

  protected remove(item: ImageItem): void {
    URL.revokeObjectURL(item.previewUrl);
    this.items.update((items) => items.filter((other) => other.id !== item.id));
    this.notes.set([]);
  }

  protected clearAll(): void {
    this.items().forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.items.set([]);
    this.notes.set([]);
  }

  /** Short type label, for example "PNG". */
  protected typeLabel(file: File): string {
    const fromType = file.type.split('/')[1];
    const fromName = file.name.split('.').pop();
    return (fromType || fromName || '').replace('jpeg', 'jpg').toUpperCase();
  }
}
