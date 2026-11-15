import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { extensionFor, parseImageText, sniffImageType, snippets, toBase64 } from './image-data';

const CONTENT: ToolContent = {
  aboutHeading: 'About this image to Base64 converter',
  about:
    'Turn an image into Base64 text or a data: URI and back. Drop a PNG, JPG, WebP, GIF, SVG or ICO file to get a ' +
    'data URI with ready-made HTML, CSS and Markdown snippets, or paste Base64 from an API response, a database or ' +
    'a stylesheet to see the image straight away and download it. The image type is detected from the data itself, ' +
    'so a missing or wrong data: prefix is not a problem.',
  steps: [
    'Choose Image to Base64 and drop an image, or choose Base64 to image and paste the text.',
    'Copy the data URI or one of the snippets, or check the decoded image, its type and size.',
    'Download the decoded image if you need the file.',
  ],
  faq: [
    {
      question: 'When should I inline an image as Base64?',
      answer:
        'For tiny icons and images in emails or single-file pages. Base64 is about 33% bigger than the file and is ' +
        'not cached on its own, so normal image files are better for anything larger than a few kilobytes.',
    },
    {
      question: 'My Base64 has no data: prefix. Will it work?',
      answer: 'Yes. The tool reads the first bytes to find out whether it is a PNG, JPG, GIF, WebP, SVG or another format.',
    },
    { question: 'Is my image uploaded?', answer: 'No. Encoding and decoding happen in your browser.' },
  ],
};

@Component({
  selector: 'app-image-base64',
  imports: [ToolPage, UploadBox, CopyButton],
  template: `
    <app-tool-page path="image-base64" [content]="content" privacy="Images are encoded and decoded in your browser and never uploaded.">
      <div class="flex rounded-full border border-line p-0.5 self-start w-fit" role="tablist" aria-label="Direction">
        <button type="button" role="tab" class="rounded-full px-4 py-1.5 text-sm font-semibold" [class]="mode() === 'encode' ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-selected]="mode() === 'encode'" (click)="mode.set('encode')">Image to Base64</button>
        <button type="button" role="tab" class="rounded-full px-4 py-1.5 text-sm font-semibold" [class]="mode() === 'decode' ? 'bg-brand text-on-brand' : 'text-muted'" [attr.aria-selected]="mode() === 'decode'" (click)="mode.set('decode')">Base64 to image</button>
      </div>

      @if (mode() === 'encode') {
        <app-upload-box class="mt-4 block" title="Drop an image here" buttonLabel="Choose image" [hint]="'Any image up to ' + maxSize + '. You can also paste one.'" accept="image/*,.svg,.ico" [filter]="false" (filesSelected)="encode($event)" />
        @if (encodeError()) { <p class="mt-3 text-sm text-danger">{{ encodeError() }}</p> }
        @if (encoded(); as e) {
          <div class="mt-4 grid gap-4 md:grid-cols-[12rem_1fr]">
            <div class="flex flex-col items-center gap-2 text-sm text-muted">
              <img [src]="e.uri" alt="Encoded image" class="max-h-48 max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
              {{ e.type }} · {{ formatBytes(e.size) }} → {{ formatBytes(e.uri.length) }} as text
            </div>
            <ul class="flex flex-col gap-3">
              @for (s of snippetList(); track s.label) {
                <li>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold">{{ s.label }}</span>
                    <app-copy-button [text]="s.text" [ariaLabel]="'Copy ' + s.label" />
                  </div>
                  <textarea class="field-code mt-1 h-16 w-full" readonly [attr.aria-label]="s.label" [value]="s.text"></textarea>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <textarea class="field-code mt-4 h-40 w-full" aria-label="Base64 or data URI" placeholder="Paste Base64 or a data:image/...;base64,... URI" spellcheck="false" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn-small" (click)="text.set(sample)">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!text()" (click)="text.set('')">Clear</button>
        </div>
        @if (decoded(); as d) {
          @if (d.ok) {
            <div class="mt-4 flex flex-col items-start gap-3">
              <img [src]="previewUrl()" alt="Decoded image" (load)="measure($event)" class="max-h-96 max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
              <p class="text-sm" role="status">{{ d.type }} · {{ formatBytes(d.bytes.length) }}@if (size()) { · {{ size() }} }</p>
              <button type="button" class="btn-primary" (click)="download()">Download .{{ extension() }}</button>
            </div>
          } @else if (text().trim()) {
            <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ d.message }}</p>
          }
        }
      }
    </app-tool-page>
  `,
})
export class ImageBase64 {
  protected readonly content = CONTENT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly formatBytes = formatBytes;
  /** A small SVG code icon, enough to show what the tool does. */
  protected readonly sample =
    'data:image/svg+xml;base64,' +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M20 22l-8 10 8 10M44 22l8 10-8 10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></svg>');

  protected readonly mode = signal<'encode' | 'decode'>('encode');
  protected readonly encoded = signal<{ uri: string; type: string; size: number; name: string } | null>(null);
  protected readonly encodeError = signal('');
  protected readonly snippetList = computed(() => {
    const e = this.encoded();
    return e ? snippets(e.uri, e.name) : [];
  });

  protected readonly text = signal('');
  protected readonly decoded = computed(() => (this.text().trim() ? parseImageText(this.text()) : null));
  protected readonly size = signal('');
  protected readonly extension = computed(() => {
    const d = this.decoded();
    return d?.ok ? extensionFor(d.type) : '';
  });
  private url: string | null = null;
  protected readonly previewUrl = computed(() => {
    const d = this.decoded();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = d?.ok ? URL.createObjectURL(new Blob([d.bytes as Uint8Array<ArrayBuffer>], { type: d.type })) : null;
    return this.url ?? '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.url) URL.revokeObjectURL(this.url);
    });
  }

  protected async encode(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.encodeError.set(`This file is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes) ?? (file.type.startsWith('image/') ? file.type : null);
    if (!type) {
      this.encodeError.set('This file does not look like an image.');
      return;
    }
    this.encodeError.set('');
    this.encoded.set({ uri: `data:${type};base64,${toBase64(bytes)}`, type, size: file.size, name: file.name });
  }

  protected measure(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.size.set(image.naturalWidth ? `${image.naturalWidth}×${image.naturalHeight} px` : '');
  }

  protected download(): void {
    const d = this.decoded();
    if (d?.ok) downloadBlob(new Blob([d.bytes as Uint8Array<ArrayBuffer>], { type: d.type }), `image.${extensionFor(d.type)}`);
  }
}
