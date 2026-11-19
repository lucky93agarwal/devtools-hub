import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { COMPRESS_CANCELLED, CompressLevel, MAX_VIDEO_BYTES, MediaInfo, VIDEO_ACCEPT, VideoContainer, clock, compressVideo, describe, scaledSize } from './media';

const CONTENT: ToolContent = {
  aboutHeading: 'About this video compressor and converter',
  about:
    'Make a video smaller so it fits in WhatsApp, email or a form upload, or change its format: MP4 for any phone ' +
    'and website, WebM for the web, MOV for Apple apps, or MKV. Pick a quality, or type the file size you need and ' +
    'the compressor works out the bitrate. You can also lower the resolution and frame rate, remove the sound and ' +
    'keep only part of the video. Everything runs on your device, so large and private videos are never uploaded.',
  steps: [
    'Drop a video (MP4, MOV, WebM, MKV and more).',
    'Choose the format, and how much to compress: a quality or a target size in MB.',
    'Optionally lower the resolution or frame rate, remove the sound or cut it to a start and end.',
    'Press Compress, compare the sizes and download the new video.',
  ],
  faq: [
    {
      question: 'How small can I make it?',
      answer:
        'Any size, but very small targets make the picture blocky. Lowering the resolution to 720p or 480p keeps a ' +
        'small file sharp. As a guide, 1 minute of 720p video looks good at about 8 to 12 MB.',
    },
    {
      question: 'Which format should I choose?',
      answer: 'MP4 (H.264) plays on every phone, computer and website. WebM is smaller for the web. MOV suits iMovie and Final Cut. MKV is for players like VLC.',
    },
    {
      question: 'Why is it slow on my phone?',
      answer: 'The video is re-encoded on your device, so it takes about as long as the video plays on a laptop, and longer on phones.',
    },
    { question: 'Is my video uploaded?', answer: 'No. The video is read, compressed and saved in your browser.' },
  ],
};

@Component({
  selector: 'app-video-compressor',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="video-compressor" [content]="content" privacy="Your video is compressed on your device and never uploaded.">
      @if (!file()) {
        <app-upload-box title="Drop a video here" buttonLabel="Choose video" [hint]="'MP4, MOV, WebM, MKV and more, up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
      } @else {
        <div class="grid gap-6 md:grid-cols-2">
          <div class="flex flex-col gap-2">
            <video [src]="videoUrl()" controls class="max-h-80 w-full rounded-xl bg-black" aria-label="Your video"></video>
            @if (info(); as i) {
              <p class="text-sm text-muted">{{ file()!.name }} · {{ formatBytes(file()!.size) }} · {{ clock(i.duration) }} · {{ i.width }}×{{ i.height }}@if (i.videoCodec) { · {{ i.videoCodec.toUpperCase() }} }</p>
            }
          </div>
          <fieldset class="card flex flex-col gap-4 p-4 text-sm" [disabled]="working()">
            <legend class="sr-only">Compression settings</legend>
            <label class="flex flex-col gap-1"><span class="font-semibold">Format</span>
              <select class="field" aria-label="Output format" (change)="container.set($any($event.target).value)">
                <option value="mp4">MP4 (H.264): plays everywhere</option>
                <option value="webm">WebM (VP9): small, for the web</option>
                <option value="mov">MOV: for Apple apps</option>
                <option value="mkv">MKV</option>
              </select>
            </label>
            <label class="flex flex-col gap-1"><span class="font-semibold">Compression</span>
              <select class="field" aria-label="Compression" (change)="level.set($any($event.target).value)">
                <option value="smaller">Smallest file</option>
                <option value="balanced" selected>Balanced</option>
                <option value="better">Better quality</option>
                <option value="target">Target size…</option>
              </select>
            </label>
            @if (level() === 'target') {
              <label class="flex flex-col gap-1"><span class="font-semibold">Target size (MB)</span>
                <input type="number" min="0.5" step="0.5" class="field w-32" aria-label="Target size in MB" [value]="targetMb()" (input)="targetMb.set(num($event) ?? 10)" />
              </label>
            }
            <div class="flex flex-wrap gap-3">
              <label class="flex flex-col gap-1"><span class="font-semibold">Resolution</span>
                <select class="field" aria-label="Resolution" (change)="height.set(+$any($event.target).value)">
                  <option value="0">Keep ({{ info()?.width }}×{{ info()?.height }})</option>
                  @for (h of heights; track h) { <option [value]="h">{{ h }}p</option> }
                </select>
              </label>
              <label class="flex flex-col gap-1"><span class="font-semibold">Frame rate</span>
                <select class="field" aria-label="Frame rate" (change)="fps.set(+$any($event.target).value)">
                  <option value="0">Keep</option>
                  <option value="60">60 fps</option>
                  <option value="30">30 fps</option>
                  <option value="24">24 fps</option>
                  <option value="15">15 fps</option>
                </select>
              </label>
            </div>
            <div class="flex gap-3">
              <label class="flex flex-col gap-1"><span class="font-semibold">Start (seconds)</span>
                <input type="number" min="0" step="0.1" class="field w-28" aria-label="Start time" placeholder="0" [value]="start() ?? ''" (input)="start.set(num($event))" />
              </label>
              <label class="flex flex-col gap-1"><span class="font-semibold">End (seconds)</span>
                <input type="number" min="0" step="0.1" class="field w-28" aria-label="End time" placeholder="End" [value]="end() ?? ''" (input)="end.set(num($event))" />
              </label>
            </div>
            <label class="flex items-center gap-2"><input type="checkbox" aria-label="Remove sound" [checked]="removeSound()" (change)="removeSound.set($any($event.target).checked)" /> Remove the sound</label>
            <p class="text-muted">Output: {{ outSize().width }}×{{ outSize().height }}</p>
            @if (level() === 'target' && targetTooBig()) {
              <p class="text-muted" role="note">Your video is already {{ formatBytes(file()!.size) }}, smaller than {{ targetMb() }} MB. The new file will not be bigger than the original.</p>
            }
            <button type="button" class="btn-primary" [disabled]="!info() || working()" (click)="compress()">{{ working() ? 'Compressing… ' + percent() + '%' : 'Compress video' }}</button>
            <button type="button" class="btn-secondary" [disabled]="working()" (click)="reset()">Another video</button>
          </fieldset>
          @if (working()) {
            <button type="button" class="btn-secondary md:col-start-2" (click)="cancel()">Cancel</button>
          }
        </div>
        @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
        @if (result(); as r) {
          <div class="card mt-4 flex flex-col gap-3 p-4 text-sm" role="status">
            <p class="font-semibold">Ready: {{ r.name }} · {{ formatBytes(file()!.size) }} → {{ formatBytes(r.blob.size) }} ({{ saving(r.blob.size) }})</p>
            @if (r.blob.size >= file()!.size) {
              <p class="rounded-lg bg-amber-500/15 px-3 py-2" role="note">The new file is not smaller: your video was already well compressed. Keep the original, or choose a lower resolution or frame rate.</p>
            } @else if (r.target && r.blob.size > r.target * 1.15) {
              <p class="rounded-lg bg-amber-500/15 px-3 py-2" role="note">{{ formatBytes(r.target) }} could not be reached at this size. Choose a lower resolution or frame rate for a smaller file.</p>
            }
            <video [src]="r.url" controls class="max-h-80 w-full rounded-xl bg-black" aria-label="Compressed video"></video>
            <button type="button" class="btn-primary self-start" (click)="download()">Download {{ r.name }}</button>
          </div>
        }
      }
    </app-tool-page>
  `,
})
export class VideoCompressor {
  protected readonly content = CONTENT;
  protected readonly accept = VIDEO_ACCEPT;
  protected readonly maxSize = formatBytes(MAX_VIDEO_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly clock = clock;
  protected readonly heights = [1080, 720, 480, 360];
  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal('');
  protected readonly info = signal<MediaInfo | null>(null);
  protected readonly container = signal<VideoContainer>('mp4');
  protected readonly level = signal<CompressLevel>('balanced');
  protected readonly targetMb = signal(10);
  protected readonly height = signal(0);
  protected readonly fps = signal(0);
  protected readonly removeSound = signal(false);
  protected readonly start = signal<number | null>(null);
  protected readonly end = signal<number | null>(null);
  protected readonly working = signal(false);
  protected readonly percent = signal(0);
  protected readonly error = signal('');
  protected readonly result = signal<{ blob: Blob; url: string; name: string; target?: number } | null>(null);
  protected readonly targetTooBig = computed(() => !!this.file() && this.targetMb() * 1024 * 1024 >= this.file()!.size);
  private abort: AbortController | null = null;
  protected readonly outSize = computed(() => scaledSize(this.info()?.width ?? 0, this.info()?.height ?? 0, this.height()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected num(event: Event): number | null {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  protected saving(size: number): string {
    const original = this.file()?.size ?? 0;
    if (!original) return '';
    const change = Math.round((1 - size / original) * 100);
    return change >= 0 ? `${change}% smaller` : `${-change}% larger`;
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set(`This video is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    this.reset();
    this.file.set(file);
    this.videoUrl.set(URL.createObjectURL(file));
    try {
      const info = await describe(file);
      if (!info.hasVideo) throw new Error('no video');
      this.info.set(info);
      // A sensible target: half of the original size.
      this.targetMb.set(Math.max(1, Math.round(file.size / 1024 / 1024 / 2)));
    } catch {
      this.error.set('This file could not be read as a video. It may be damaged, audio only, or in a format the browser cannot open.');
    }
  }

  protected async compress(): Promise<void> {
    const file = this.file();
    if (!file || this.working()) return;
    this.working.set(true);
    this.percent.set(0);
    this.error.set('');
    this.clearResult();
    this.abort = new AbortController();
    const target = this.level() === 'target' ? this.targetMb() * 1024 * 1024 : undefined;
    try {
      const { blob, extension } = await compressVideo(
        file,
        {
          container: this.container(),
          level: this.level(),
          targetBytes: this.targetMb() * 1024 * 1024,
          height: this.height(),
          fps: this.fps(),
          removeSound: this.removeSound(),
          start: this.start() ?? undefined,
          end: this.end() ?? undefined,
          signal: this.abort.signal,
        },
        (p) => this.percent.set(Math.round(p * 100)),
      );
      this.result.set({ blob, url: URL.createObjectURL(blob), name: `${baseName(file.name)}-compressed.${extension}`, target });
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'The video could not be compressed.';
      this.error.set(message === COMPRESS_CANCELLED ? 'Cancelled.' : message);
    } finally {
      this.working.set(false);
      this.abort = null;
    }
  }

  protected cancel(): void {
    this.abort?.abort();
  }

  protected download(): void {
    const r = this.result();
    if (r) downloadBlob(r.blob, r.name);
  }

  private clearResult(): void {
    const r = this.result();
    if (r) URL.revokeObjectURL(r.url);
    this.result.set(null);
  }

  protected reset(): void {
    this.abort?.abort();
    this.clearResult();
    if (this.videoUrl()) URL.revokeObjectURL(this.videoUrl());
    this.videoUrl.set('');
    this.file.set(null);
    this.info.set(null);
    this.error.set('');
  }
}
