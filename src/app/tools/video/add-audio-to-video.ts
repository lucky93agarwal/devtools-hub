import { Component, DestroyRef, inject, signal } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { AUDIO_ACCEPT, MAX_MIX_SECONDS, MAX_VIDEO_BYTES, MediaInfo, VIDEO_ACCEPT, clock, describe, mixSounds, replaceAudio } from './media';

const CONTENT: ToolContent = {
  aboutHeading: 'About this add audio to video tool',
  about:
    'Put background music, a voice-over or sound effects on a video, right in your browser. Add as many audio files ' +
    'as you like, set when each one starts, its volume, whether it repeats to fill the video, and a fade in and out. ' +
    'Keep the video\'s own sound, turn it down under the music, or mute it completely. The picture is copied exactly ' +
    'as it is, without re-encoding, so the video keeps its quality and is saved quickly; only the sound is mixed and ' +
    'encoded. Nothing is uploaded.',
  steps: [
    'Drop a video.',
    'Add one or more audio files (MP3, WAV, M4A, OGG, or another video\'s sound).',
    'For each sound set the start time, volume, repeat and fade; set the volume of the video\'s own sound.',
    'Press Make video, watch the result and download it.',
  ],
  faq: [
    {
      question: 'Does the video lose quality?',
      answer: 'No. The video track is copied byte for byte. Only the new, mixed sound is encoded, as AAC in MP4 files or Opus in WebM files.',
    },
    {
      question: 'How do I replace the sound completely?',
      answer: 'Set "Video\'s own sound" to 0%. Only the sounds you added will be in the new video.',
    },
    {
      question: 'Can I use music from YouTube or Spotify?',
      answer: 'Only music you have the rights to. Use your own recordings or royalty-free music, especially for videos you publish.',
    },
    { question: 'Is my video uploaded?', answer: 'No. Mixing and saving happen on your device.' },
  ],
};

interface Sound {
  id: number;
  file: File;
  url: string;
  duration: number;
  offset: number;
  volume: number;
  loop: boolean;
  fade: number;
}

@Component({
  selector: 'app-add-audio-to-video',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="add-audio-to-video" [content]="content" privacy="Your video and sounds are mixed on your device and never uploaded.">
      @if (!video()) {
        <app-upload-box title="Drop a video here" buttonLabel="Choose video" [hint]="'MP4, MOV, WebM and more, up to ' + maxSize + '.'" [accept]="videoAccept" [filter]="false" (filesSelected)="chooseVideo($event)" />
        @if (error()) { <p class="mt-3 text-sm text-danger" role="alert">{{ error() }}</p> }
      } @else {
        <div class="grid gap-6 md:grid-cols-2">
          <div class="flex flex-col gap-2">
            <video [src]="videoUrl()" controls class="max-h-80 w-full rounded-xl bg-black" aria-label="Your video"></video>
            @if (info(); as i) {
              <p class="text-sm text-muted">{{ video()!.name }} · {{ clock(i.duration) }} · {{ i.width }}×{{ i.height }}@if (!i.audioCodec) { · no sound of its own }</p>
            }
          </div>
          <div class="card flex flex-col gap-3 p-4 text-sm">
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Video's own sound</span>{{ originalVolume() }}%</span>
              <input type="range" min="0" max="200" step="5" class="accent-brand" aria-label="Video's own sound" [value]="originalVolume()" [disabled]="!info()?.audioCodec" (input)="originalVolume.set($any($event.target).valueAsNumber)" />
              <span class="text-muted">0% removes it; lower it to play music underneath a voice.</span>
            </label>
            <button type="button" class="btn-secondary" (click)="soundInput.click()">+ Add audio</button>
            <input #soundInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" multiple [accept]="audioAccept" (change)="addSounds(soundInput)" />
            <button type="button" class="btn-primary" [disabled]="working() || (!sounds().length && originalVolume() === 100)" (click)="make()">{{ working() ? stage() : 'Make video' }}</button>
            @if (working() && percent()) {
              <div class="h-2 overflow-hidden rounded-full bg-page" role="progressbar" aria-label="Saving progress" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-brand" [style.width.%]="percent()"></div>
              </div>
            }
            <button type="button" class="btn-small self-start" [disabled]="working()" (click)="reset()">Another video</button>
          </div>
        </div>

        @if (sounds().length) {
          <ul class="mt-4 flex flex-col gap-3" aria-label="Added sounds">
            @for (sound of sounds(); track sound.id; let i = $index) {
              <li class="card flex flex-col gap-3 p-4 text-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-semibold">{{ i + 1 }}. {{ sound.file.name }} <span class="font-normal text-muted">({{ clock(sound.duration) }})</span></span>
                  <button type="button" class="btn-small" [attr.aria-label]="'Remove ' + sound.file.name" [disabled]="working()" (click)="remove(sound.id)">Remove</button>
                </div>
                <audio [src]="sound.url" controls class="w-full" [attr.aria-label]="'Listen to ' + sound.file.name"></audio>
                <div class="flex flex-wrap items-end gap-4">
                  <label class="flex flex-col gap-1"><span class="font-semibold">Starts at (s)</span>
                    <input type="number" min="0" step="0.1" class="field w-24" [attr.aria-label]="'Start of ' + sound.file.name" [value]="sound.offset" (input)="patch(sound.id, { offset: num($event) })" />
                  </label>
                  <label class="flex flex-col gap-1"><span class="font-semibold">Volume {{ sound.volume }}%</span>
                    <input type="range" min="0" max="200" step="5" class="w-36 accent-brand" [attr.aria-label]="'Volume of ' + sound.file.name" [value]="sound.volume" (input)="patch(sound.id, { volume: $any($event.target).valueAsNumber })" />
                  </label>
                  <label class="flex flex-col gap-1"><span class="font-semibold">Fade (s)</span>
                    <input type="number" min="0" max="10" step="0.5" class="field w-20" [attr.aria-label]="'Fade of ' + sound.file.name" [value]="sound.fade" (input)="patch(sound.id, { fade: num($event) })" />
                  </label>
                  <label class="flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="sound.loop" (change)="patch(sound.id, { loop: $any($event.target).checked })" /> Repeat to fill the video</label>
                </div>
              </li>
            }
          </ul>
        }

        @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
        @if (result(); as r) {
          <div class="card mt-4 flex flex-col gap-3 p-4 text-sm" role="status">
            <p class="font-semibold">Video ready: {{ r.name }} · {{ formatBytes(r.blob.size) }}</p>
            <video [src]="r.url" controls class="max-h-96 w-full rounded-xl bg-black" aria-label="New video"></video>
            <button type="button" class="btn-primary self-start" (click)="download()">Download {{ r.name }}</button>
          </div>
        }
      }
    </app-tool-page>
  `,
})
export class AddAudioToVideo {
  protected readonly content = CONTENT;
  protected readonly videoAccept = VIDEO_ACCEPT;
  protected readonly audioAccept = AUDIO_ACCEPT;
  protected readonly maxSize = formatBytes(MAX_VIDEO_BYTES);
  protected readonly formatBytes = formatBytes;
  protected readonly clock = clock;
  protected readonly video = signal<File | null>(null);
  protected readonly videoUrl = signal('');
  protected readonly info = signal<MediaInfo | null>(null);
  protected readonly sounds = signal<Sound[]>([]);
  protected readonly originalVolume = signal(100);
  protected readonly working = signal(false);
  protected readonly stage = signal('');
  protected readonly percent = signal(0);
  protected readonly error = signal('');
  protected readonly result = signal<{ blob: Blob; url: string; name: string } | null>(null);
  private nextId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected num(event: Event): number {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  protected async chooseVideo(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set(`This video is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    this.reset();
    this.error.set('');
    try {
      const info = await describe(file);
      if (!info.hasVideo) throw new Error('This file has no video in it. Choose a video file.');
      if (info.duration > MAX_MIX_SECONDS) throw new Error(`Videos longer than ${MAX_MIX_SECONDS / 60} minutes are not supported.`);
      this.video.set(file);
      this.videoUrl.set(URL.createObjectURL(file));
      this.info.set(info);
      if (!info.audioCodec) this.originalVolume.set(0);
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'This video could not be read.');
    }
  }

  protected async addSounds(element: HTMLInputElement): Promise<void> {
    const files = Array.from(element.files ?? []);
    element.value = '';
    for (const file of files) {
      try {
        const info = await describe(file);
        if (!info.audioCodec) {
          this.error.set(`${file.name} has no sound in it.`);
          continue;
        }
        this.sounds.update((list) => [
          ...list,
          { id: ++this.nextId, file, url: URL.createObjectURL(file), duration: info.duration, offset: 0, volume: 100, loop: false, fade: 0 },
        ]);
        this.error.set('');
      } catch {
        this.error.set(`${file.name} could not be read as audio.`);
      }
    }
  }

  protected patch(id: number, change: Partial<Sound>): void {
    this.sounds.update((list) => list.map((s) => (s.id === id ? { ...s, ...change } : s)));
  }

  protected remove(id: number): void {
    const sound = this.sounds().find((s) => s.id === id);
    if (sound) URL.revokeObjectURL(sound.url);
    this.sounds.update((list) => list.filter((s) => s.id !== id));
  }

  protected async make(): Promise<void> {
    const video = this.video();
    const info = this.info();
    if (!video || !info || this.working()) return;
    this.working.set(true);
    this.error.set('');
    this.percent.set(0);
    this.clearResult();
    try {
      const mix = await mixSounds(
        video,
        info.duration,
        info.audioCodec ? this.originalVolume() / 100 : 0,
        this.sounds().map((s) => ({ file: s.file, offset: s.offset, volume: s.volume / 100, loop: s.loop, fade: s.fade })),
        (text) => this.stage.set(text),
      );
      this.stage.set('Saving the video…');
      const { blob, extension } = await replaceAudio(video, mix, (p) => this.percent.set(Math.round(p * 100)));
      this.result.set({ blob, url: URL.createObjectURL(blob), name: `${baseName(video.name)}-with-audio.${extension}` });
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'The video could not be made.');
    } finally {
      this.working.set(false);
      this.stage.set('');
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
    for (const s of this.sounds()) URL.revokeObjectURL(s.url);
    this.sounds.set([]);
    if (this.videoUrl()) URL.revokeObjectURL(this.videoUrl());
    this.videoUrl.set('');
    this.video.set(null);
    this.info.set(null);
    this.originalVolume.set(100);
  }
}
