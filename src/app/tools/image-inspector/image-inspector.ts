import { Component, DestroyRef, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { Fact, Inspection, aspectRatio, inspectBytes } from './inspect';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image viewer and inspector',
  about:
    'Open HEIC, AVIF, WebP, TIFF and other images that your computer cannot show, and see everything the file says ' +
    'about itself: the real format (checked from the data, not the file name), dimensions, aspect ratio, bit depth, ' +
    'colour type and profile, compression and animation, plus EXIF details such as camera, lens, date, exposure, ' +
    'ISO and GPS location. You can also save a copy without any metadata before sharing a photo.',
  steps: [
    'Drop an image, for example an iPhone HEIC photo.',
    'Read the file, format and EXIF details, and check where it was taken if it has GPS data.',
    'Save a PNG or JPG copy, or a copy without metadata, if you need one.',
  ],
  faq: [
    {
      question: 'Why does the type differ from the file extension?',
      answer:
        'Files are sometimes renamed or saved with the wrong extension. The real type is read from the first bytes ' +
        'of the file; a mismatch is shown as a warning.',
    },
    {
      question: 'Does sharing a photo share its location?',
      answer:
        'Often, yes: phones store GPS coordinates in EXIF. If this tool shows a location, use "Save without ' +
        'metadata" before posting the photo publicly.',
    },
    { question: 'Is my photo uploaded?', answer: 'No. The file is read in your browser.' },
  ],
};

interface Result {
  name: string;
  size: number;
  declaredType: string;
  width: number;
  height: number;
  previewUrl: string;
  info: Inspection;
}

@Component({
  selector: 'app-image-inspector',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="image-inspector" [content]="content" privacy="Your image is read in your browser and never uploaded.">
      @if (error()) { <p class="mb-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ error() }}</p> }
      @if (!result()) {
        <app-upload-box title="Drop an image here" buttonLabel="Choose image" [hint]="'HEIC, AVIF, WebP, TIFF, JPG, PNG, GIF and more, up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="open($event)" />
        @if (working()) { <p class="mt-3 text-sm text-muted" role="status">Reading the image…</p> }
      } @else {
        @let r = result()!;
        <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div class="flex flex-col gap-3">
            <img [src]="r.previewUrl" alt="Preview" class="max-h-[28rem] w-full rounded-xl border border-line object-contain bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-primary" (click)="save('image/png')">Save as PNG</button>
              <button type="button" class="btn-secondary" (click)="save('image/jpeg')">Save as JPG</button>
              <button type="button" class="btn-secondary" (click)="reset()">Another image</button>
            </div>
            <p class="text-sm text-muted">Saved copies contain no EXIF or GPS metadata.</p>
          </div>
          <div class="flex flex-col gap-5 text-sm">
            @if (mismatch()) {
              <p class="rounded-xl border border-warning bg-warning/10 px-4 py-3">{{ mismatch() }}</p>
            }
            <section>
              <h2 class="text-lg font-semibold">File</h2>
              <dl class="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
                @for (f of fileFacts(); track f.label) { <dt class="text-muted">{{ f.label }}</dt><dd class="break-words">{{ f.value }}</dd> }
              </dl>
            </section>
            @if (r.info.format.length) {
              <section>
                <h2 class="text-lg font-semibold">Format</h2>
                <dl class="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
                  @for (f of r.info.format; track f.label) { <dt class="text-muted">{{ f.label }}</dt><dd class="break-words">{{ f.value }}</dd> }
                </dl>
              </section>
            }
            <section>
              <h2 class="text-lg font-semibold">EXIF</h2>
              @if (r.info.exif.length || r.info.gps) {
                <dl class="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
                  @for (f of r.info.exif; track f.label) { <dt class="text-muted">{{ f.label }}</dt><dd class="break-words">{{ f.value }}</dd> }
                  @if (r.info.gps; as g) {
                    <dt class="text-muted">GPS location</dt>
                    <dd>
                      {{ g.latitude.toFixed(5) }}, {{ g.longitude.toFixed(5) }}
                      <a class="ml-2 underline" target="_blank" rel="noopener" [href]="'https://www.openstreetmap.org/?mlat=' + g.latitude + '&mlon=' + g.longitude + '#map=15/' + g.latitude + '/' + g.longitude">Map</a>
                    </dd>
                  }
                </dl>
                <div class="mt-2"><app-copy-button [text]="report()" label="Copy all details" /></div>
              } @else {
                <p class="mt-2 text-muted">No EXIF metadata in this file.</p>
              }
            </section>
          </div>
        </div>
      }
    </app-tool-page>
  `,
})
export class ImageInspector {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);

  protected readonly result = signal<Result | null>(null);
  protected readonly error = signal('');
  protected readonly working = signal(false);
  protected readonly mismatch = signal('');
  protected readonly fileFacts = signal<Fact[]>([]);
  protected readonly report = signal('');
  private readonly encoder = inject(ImageEncoder);
  private file: File | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This file is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    this.working.set(true);
    this.error.set('');
    try {
      const info = inspectBytes(new Uint8Array(await file.arrayBuffer()));
      const bitmap = await this.encoder.read(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      const { width, height } = bitmap;
      bitmap.close();
      const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = canvas.height = 0;
      this.reset();
      this.file = file;
      const result: Result = { name: file.name, size: file.size, declaredType: file.type, width, height, previewUrl: preview ? URL.createObjectURL(preview) : '', info };
      this.result.set(result);
      const realType = info.type ?? 'Unknown';
      this.fileFacts.set([
        { label: 'Name', value: file.name },
        { label: 'Size', value: `${formatBytes(file.size)} (${file.size.toLocaleString('en')} bytes)` },
        { label: 'Real type', value: realType },
        { label: 'Dimensions', value: `${width} × ${height} px` },
        { label: 'Aspect ratio', value: aspectRatio(width, height) },
        { label: 'Megapixels', value: ((width * height) / 1e6).toFixed(2) },
        ...(file.lastModified ? [{ label: 'File date', value: new Date(file.lastModified).toLocaleString() }] : []),
      ]);
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const expected: Record<string, string[]> = {
        'image/jpeg': ['jpg', 'jpeg', 'jfif'],
        'image/png': ['png'],
        'image/webp': ['webp'],
        'image/gif': ['gif'],
        'image/heic': ['heic', 'heif'],
        'image/avif': ['avif'],
        'image/tiff': ['tif', 'tiff'],
        'image/bmp': ['bmp'],
        'image/svg+xml': ['svg'],
        'image/x-icon': ['ico'],
      };
      const ok = !info.type || (expected[info.type] ?? []).includes(extension);
      this.mismatch.set(ok ? '' : `The file is named .${extension} but is really ${info.type}.`);
      this.report.set(
        [...this.fileFacts(), ...info.format, ...info.exif, ...(info.gps ? [{ label: 'GPS', value: `${info.gps.latitude}, ${info.gps.longitude}` }] : [])]
          .map((f) => `${f.label}: ${f.value}`)
          .join('\n'),
      );
    } catch {
      this.error.set('This image could not be opened. The file may be damaged or in a format the browser cannot read.');
    } finally {
      this.working.set(false);
    }
  }

  /** A copy drawn from the pixels only, so no metadata is carried over. */
  protected async save(type: 'image/png' | 'image/jpeg'): Promise<void> {
    const file = this.file;
    if (!file) return;
    const bitmap = await this.encoder.read(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    if (type === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    canvas.width = canvas.height = 0;
    if (blob) downloadBlob(blob, `${baseName(file.name)}-clean.${type === 'image/png' ? 'png' : 'jpg'}`);
  }

  protected reset(): void {
    const url = this.result()?.previewUrl;
    if (url) URL.revokeObjectURL(url);
    this.result.set(null);
    this.file = null;
    this.mismatch.set('');
  }
}
