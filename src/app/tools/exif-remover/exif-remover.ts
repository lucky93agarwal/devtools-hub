import { Component, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { buildZip } from '../image-converter/zip';
import { sniffImageType } from '../image-base64/image-data';
import { Fact, inspectBytes } from '../image-inspector/inspect';
import { jpegOrientation, stripJpeg, stripPng, stripWebp } from './strip';

const CONTENT: ToolContent = {
  aboutHeading: 'About this EXIF remover',
  about:
    'Photos from phones and cameras carry hidden metadata: the camera and lens, the exact time, editing software ' +
    'and often the GPS location where the photo was taken. This tool shows what each photo contains and removes it ' +
    'in one click before you share or upload it. JPG, PNG and WebP files are cleaned without re-encoding, so the ' +
    'image quality and size do not change; other formats such as HEIC are saved as a clean JPG.',
  steps: [
    'Drop up to 50 photos or a folder.',
    'See what each photo reveals, including whether it has a GPS location.',
    'Download the cleaned photos one by one or as a ZIP.',
  ],
  faq: [
    {
      question: 'Does removing EXIF lower the quality?',
      answer:
        'Not for JPG, PNG and WebP: only the metadata blocks are cut out and the image data is copied as it is. ' +
        'HEIC, TIFF and other formats are re-saved as a high-quality JPG.',
    },
    {
      question: 'My photo is sideways after cleaning. Why?',
      answer:
        'Phones often store rotation in EXIF. When a JPG has a rotation set, this tool draws it upright and saves it ' +
        'at 95% quality instead, so it always shows the right way up.',
    },
    {
      question: 'Do social networks remove EXIF anyway?',
      answer:
        'Many do, but email, chat apps sending "as file", cloud links and many websites do not. Cleaning it yourself ' +
        'is the safe choice.',
    },
  ],
};

interface Item {
  id: number;
  file: File;
  found: Fact[];
  gps: boolean;
  status: 'ready' | 'done' | 'error';
  result?: Blob;
  name?: string;
  note?: string;
}

@Component({
  selector: 'app-exif-remover',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="exif-remover" [content]="content" privacy="Photos are cleaned in your browser and never uploaded.">
      <app-upload-box [title]="'Drop up to ' + maxImages + ' photos or a folder here'" buttonLabel="Choose photos" [hint]="'JPG, PNG, WebP, HEIC and more, up to ' + maxSize + ' each.'" [accept]="accept" [multiple]="true" [folders]="true" [filter]="false" (filesSelected)="add($event)" />
      @if (items().length) {
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="clean()">{{ busy() ? 'Cleaning…' : 'Remove metadata from ' + items().length + (items().length === 1 ? ' photo' : ' photos') }}</button>
          <button type="button" class="btn-secondary" [disabled]="!done().length" (click)="downloadAll()">Download all</button>
          <button type="button" class="btn-small" (click)="items.set([])">Clear</button>
          @if (withGps()) { <span class="rounded-full bg-danger/15 px-3 py-1 text-sm font-semibold">{{ withGps() }} with GPS location</span> }
        </div>
        <ul class="mt-4 flex flex-col gap-2" aria-label="Photos">
          @for (item of items(); track item.id) {
            <li class="card flex flex-col gap-2 px-4 py-3 text-sm leading-5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="min-w-0 truncate font-semibold">{{ item.file.name }}</span>
                @if (item.status === 'done') {
                  <span class="text-success">Clean · {{ item.note }}</span>
                  <button type="button" class="btn-small" (click)="downloadOne(item)">Download</button>
                } @else if (item.status === 'error') {
                  <span class="text-danger">{{ item.note }}</span>
                }
              </div>
              @if (item.found.length) {
                <p class="text-muted">
                  @if (item.gps) { <span class="font-semibold text-danger">GPS location · </span> }
                  @for (f of item.found; track f.label; let last = $last) { {{ f.label }}: {{ f.value }}@if (!last) { · } }
                </p>
              } @else {
                <p class="text-muted">No EXIF found.</p>
              }
            </li>
          }
        </ul>
      }
    </app-tool-page>
  `,
})
export class ExifRemover {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxImages = LIMITS.MAX_IMAGES;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly items = signal<Item[]>([]);
  protected readonly busy = signal(false);
  protected readonly done = computed(() => this.items().filter((i) => i.result));
  protected readonly withGps = computed(() => this.items().filter((i) => i.gps).length);
  private readonly encoder = inject(ImageEncoder);
  private nextId = 0;

  protected async add(files: File[]): Promise<void> {
    const room = LIMITS.MAX_IMAGES - this.items().length;
    const picked = files.filter((f) => f.size <= LIMITS.MAX_IMAGE_BYTES).slice(0, Math.max(0, room));
    const added: Item[] = [];
    for (const file of picked) {
      const info = inspectBytes(new Uint8Array(await file.arrayBuffer()));
      added.push({ id: ++this.nextId, file, found: info.exif, gps: !!info.gps, status: 'ready' });
    }
    this.items.update((list) => [...list, ...added]);
  }

  protected async clean(): Promise<void> {
    this.busy.set(true);
    for (const item of this.items()) {
      try {
        const result = await this.cleanOne(item.file);
        this.patch(item.id, { status: 'done', ...result });
      } catch {
        this.patch(item.id, { status: 'error', note: 'This file could not be cleaned.' });
      }
    }
    this.busy.set(false);
  }

  private async cleanOne(file: File): Promise<{ result: Blob; name: string; note: string }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    const keep = (out: Uint8Array, removed: string[]) => ({
      result: new Blob([out as Uint8Array<ArrayBuffer>], { type: type! }),
      name: `${baseName(file.name)}-clean.${file.name.split('.').pop()}`,
      note: removed.length ? `removed ${removed.join(', ')}, quality unchanged` : 'nothing to remove',
    });
    if (type === 'image/jpeg' && jpegOrientation(bytes) === 1) {
      const { bytes: out, removed } = stripJpeg(bytes);
      return keep(out, removed);
    }
    if (type === 'image/png') {
      const { bytes: out, removed } = stripPng(bytes);
      return keep(out, removed);
    }
    if (type === 'image/webp') {
      const { bytes: out, removed } = stripWebp(bytes);
      return keep(out, removed);
    }
    // Rotated JPGs and other formats: draw the pixels (upright) and save a fresh JPG with no metadata.
    const bitmap = await this.encoder.read(file);
    const canvas = bitmapToCanvas(bitmap);
    bitmap.close();
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    canvas.width = canvas.height = 0;
    return { result: blob, name: `${baseName(file.name)}-clean.jpg`, note: 'saved as a new JPG with no metadata' };
  }

  private patch(id: number, change: Partial<Item>): void {
    this.items.update((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  protected downloadOne(item: Item): void {
    if (item.result) downloadBlob(item.result, item.name!);
  }

  protected async downloadAll(): Promise<void> {
    const files = this.done().map((i) => ({ name: i.name!, blob: i.result! }));
    if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
    else downloadBlob(await buildZip(files), 'clean-photos.zip');
  }
}
