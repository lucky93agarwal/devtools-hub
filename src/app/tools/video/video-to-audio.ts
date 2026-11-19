import { Component, DestroyRef, inject, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { AudioFormat, MAX_VIDEO_BYTES, MediaInfo, VIDEO_ACCEPT, clock, containerFor, describe, extractAudio } from './media';

const CONTENT: ToolContent = {
  aboutHeading: 'About this video to audio converter',
  about:
    'Take the sound out of any video: a recorded talk, a song from a music video, a voice note sent as video or the ' +
    'audio of a screen recording. Choose Original to copy the sound exactly as it is inside the video, which is ' +
    'instant and loses nothing, or save it as MP3 for any player, WAV for editing or M4A for Apple devices. You can ' +
    'cut it to a start and end time. Large files work too, because the video is read in pieces on your own device ' +
    'and never uploaded.',
  steps: [
    'Drop a video (MP4, MOV, WebM, MKV and more).',
    'Pick Original, MP3, WAV or M4A, and a start and end time if you only need part of it.',
    'Press Extract audio, listen to the result and download it.',
  ],
  faq: [
    {
      question: 'Which format should I choose?',
      answer:
        'Original keeps the exact sound with no quality loss and is the fastest. MP3 plays everywhere. WAV is ' +
        'uncompressed, best for editing in Audacity or a DAW, but large. M4A (AAC) suits iPhones and iTunes.',
    },
    {
      question: 'Why does "Original" give an M4A or OGG file?',
      answer: 'That is the format the sound is stored in inside the video: MP4 videos usually hold AAC (M4A) and WebM videos Opus (OGG).',
    },
    { question: 'Is my video uploaded?', answer: 'No. Everything happens in your browser, so even private recordings stay on your device.' },
  ],
};

@Component({
  selector: 'app-video-to-audio',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="video-to-audio" [content]="content" privacy="Your video is read on your device and never uploaded.">
      @if (!file()) {
        <app-upload-box title="Drop a video here" buttonLabel="Choose video" [hint]="'MP4, MOV, WebM, MKV and more, up to ' + maxSize + '.'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
      } @else {
        <div class="grid gap-6 md:grid-cols-2">
          <div class="flex flex-col gap-2">
            <video [src]="videoUrl()" controls class="max-h-80 w-full rounded-xl bg-black" aria-label="Your video"></video>
            @if (info(); as i) {
              <p class="text-sm text-muted">{{ file()!.name }} · {{ formatBytes(file()!.size) }} · {{ clock(i.duration) }}@if (i.audioCodec) { · sound: {{ i.audioCodec.toUpperCase() }} } @else { · no sound }</p>
            }
          </div>
          <fieldset class="card flex flex-col gap-4 p-4 text-sm" [disabled]="working()">
            <legend class="sr-only">Audio settings</legend>
            <label class="flex flex-col gap-1"><span class="font-semibold">Save as</span>
              <select class="field" aria-label="Save as" (change)="format.set($any($event.target).value)">
                <option value="original">Original{{ originalExtension() ? ' (.' + originalExtension() + ', no quality loss)' : '' }}</option>
                <option value="mp3">MP3</option>
                <option value="wav">WAV (uncompressed)</option>
                <option value="m4a">M4A (AAC)</option>
              </select>
            </label>
            <div class="flex gap-3">
              <label class="flex flex-col gap-1"><span class="font-semibold">Start (seconds)</span>
                <input type="number" min="0" step="0.1" class="field w-28" aria-label="Start time" placeholder="0" [value]="start() ?? ''" (input)="start.set(num($event))" />
              </label>
              <label class="flex flex-col gap-1"><span class="font-semibold">End (seconds)</span>
                <input type="number" min="0" step="0.1" class="field w-28" aria-label="End time" placeholder="End" [value]="end() ?? ''" (input)="end.set(num($event))" />
              </label>
            </div>
            <button type="button" class="btn-primary" [disabled]="!info()?.audioCodec" (click)="extract()">{{ working() ? 'Extracting… ' + percent() + '%' : 'Extract audio' }}</button>
            <button type="button" class="btn-secondary" (click)="reset()">Another video</button>
          </fieldset>
        </div>
        @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
        @if (result(); as r) {
          <div class="card mt-4 flex flex-col gap-3 p-4 text-sm" role="status">
            <p class="font-semibold">Audio ready: {{ r.name }} · {{ formatBytes(r.blob.size) }}{{ r.reencoded ? '' : ' · copied with no quality loss' }}</p>
            <audio [src]="r.url" controls class="w-full" aria-label="Extracted audio"></audio>
            <button type="button" class="btn-primary self-start" (click)="download()">Download {{ r.name }}</button>
          </div>
        }
      }
    </app-tool-page>
  `,
})
export class VideoToAudio {
  protected readonly content = CONTENT;
  protected readonly accept = VIDEO_ACCEPT;
  protected readonly maxSize = formatBytes(MAX_VIDEO_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly clock = clock;
  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal('');
  protected readonly info = signal<MediaInfo | null>(null);
  protected readonly originalExtension = signal('');
  protected readonly format = signal<AudioFormat>('original');
  protected readonly start = signal<number | null>(null);
  protected readonly end = signal<number | null>(null);
  protected readonly working = signal(false);
  protected readonly percent = signal(0);
  protected readonly error = signal('');
  protected readonly result = signal<{ blob: Blob; url: string; name: string; reencoded: boolean } | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected num(event: Event): number | null {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(value) && value >= 0 ? value : null;
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
      this.info.set(info);
      this.originalExtension.set(containerFor(info.audioCodec)?.extension ?? '');
      if (!info.audioCodec) this.error.set('This video has no sound to extract.');
    } catch {
      this.error.set('This file could not be read. It may be damaged or in a format the browser cannot open.');
    }
  }

  protected async extract(): Promise<void> {
    const file = this.file();
    if (!file || this.working()) return;
    this.working.set(true);
    this.percent.set(0);
    this.error.set('');
    this.clearResult();
    try {
      const { blob, extension, reencoded } = await extractAudio(file, this.format(), { start: this.start() ?? undefined, end: this.end() ?? undefined }, (p) =>
        this.percent.set(Math.round(p * 100)),
      );
      this.result.set({ blob, url: URL.createObjectURL(blob), name: `${baseName(file.name)}.${extension}`, reencoded });
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'The audio could not be extracted.');
    } finally {
      this.working.set(false);
    }
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
    this.clearResult();
    if (this.videoUrl()) URL.revokeObjectURL(this.videoUrl());
    this.videoUrl.set('');
    this.file.set(null);
    this.info.set(null);
    this.error.set('');
  }
}
