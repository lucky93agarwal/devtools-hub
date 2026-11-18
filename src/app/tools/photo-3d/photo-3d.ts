import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { LIMITS } from '../../core/app-config';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { bitmapToCanvas, canvasToBlob } from '../../shared/image-canvas';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { ImageEncoder } from '../image-converter/image-encoder';
import { CONVERTER_ACCEPT } from '../image-converter/image-list';
import { DEPTH_MODEL, inputSize } from './depth';
import type { DepthRequest, DepthResponse } from './depth.worker';
import { Motion, Photo3dRenderer, motionAt, smoothDepth } from './renderer';

const CONTENT: ToolContent = {
  aboutHeading: 'About this 3D photo maker',
  about:
    'Turn any flat photo into a moving 3D photo, like Facebook 3D photos and the iPhone depth effect. An AI model ' +
    '(Depth Anything V2) works out how far away every part of the picture is, and the photo is then drawn with ' +
    'near things moving more than far ones, so it looks like you are looking through a window. Move your mouse or ' +
    'tilt your phone, or pick an animation, then download it as a video for Instagram, WhatsApp status or a ' +
    'website. You can also download the depth map, which Facebook accepts to make its own 3D photos.',
  steps: [
    'Drop a photo. People, pets, products and landscapes with a clear foreground work best.',
    'Wait a few seconds while the AI works out the depth (the model downloads once, about 27 MB).',
    'Move the mouse or tilt your phone, or choose an animation, strength and focus.',
    'Download the video or the depth map.',
  ],
  faq: [
    {
      question: 'Why do edges sometimes stretch?',
      answer:
        'A single photo has no information about what is behind an object, so when the view moves, the hidden part is ' +
        'filled by stretching nearby pixels. Lower the strength, or set the focus to the main subject, to keep it subtle.',
    },
    {
      question: 'How do I post it as a Facebook 3D photo?',
      answer:
        'Download the depth map, then upload your photo and the depth map together in one Facebook post; name the ' +
        'depth map like the photo with "_depth" before .png. Facebook builds its own 3D photo from them.',
    },
    { question: 'Is my photo uploaded?', answer: 'No. The AI runs on your device and the photo never leaves it.' },
  ],
};

const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'follow', label: 'Follow mouse / tilt' },
  { id: 'circle', label: 'Circle' },
  { id: 'sway', label: 'Left and right' },
  { id: 'bob', label: 'Up and down' },
  { id: 'zoom', label: 'Zoom in' },
];

/** The 3D view is drawn at most this many pixels across, which is sharp and smooth on phones. */
const VIEW_SIDE = 1600;

@Component({
  selector: 'app-photo-3d',
  imports: [ToolPage, UploadBox],
  template: `
    <app-tool-page path="photo-3d" [content]="content" [wide]="true" privacy="The AI runs on your device. Your photo is never uploaded.">
      @if (!loaded()) {
        <app-upload-box title="Drop a photo here" buttonLabel="Choose image" [hint]="'JPG, PNG, HEIC, WebP and more, up to ' + maxSize + '. First use downloads the AI model (' + modelSize + ').'" [accept]="accept" [filter]="false" (filesSelected)="choose($event)" />
      }
      @if (stage(); as s) {
        <div class="card mt-4 flex flex-col gap-2 p-4 text-sm" role="status">
          <p class="font-semibold">{{ s }}</p>
          @if (modelPercent() !== null && modelPercent()! < 100) {
            <div class="h-2 overflow-hidden rounded-full bg-page" role="progressbar" aria-label="Model download" [attr.aria-valuenow]="modelPercent()" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full rounded-full bg-brand transition-[width]" [style.width.%]="modelPercent()"></div>
            </div>
          }
        </div>
      }
      @if (error()) { <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }

      <div [class.hidden]="!ready()" class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div class="flex flex-col gap-2">
          <canvas #view class="mx-auto block max-h-[75vh] max-w-full touch-none rounded-xl" role="img" aria-label="3D photo" (pointermove)="pointer($event)" (pointerleave)="target = { x: 0, y: 0 }"></canvas>
          @if (showDepth()) {
            <canvas #depthView class="mx-auto block max-h-48 max-w-full rounded-lg border border-line" role="img" aria-label="Depth map"></canvas>
          }
        </div>
        <fieldset class="card flex flex-col gap-4 p-4 text-sm" [disabled]="recording()">
          <legend class="sr-only">3D settings</legend>
          <label class="flex flex-col gap-1"><span class="font-semibold">Movement</span>
            <select class="field" aria-label="Movement" (change)="motion.set($any($event.target).value)">
              @for (m of motions; track m.id) { <option [value]="m.id" [selected]="m.id === motion()">{{ m.label }}</option> }
            </select>
          </label>
          @if (motion() === 'follow' && tiltPossible()) {
            <button type="button" class="btn-small self-start" (click)="useTilt()">{{ tilting() ? 'Tilt is on' : 'Use phone tilt' }}</button>
          }
          <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Strength</span>{{ strength() }}</span>
            <input type="range" min="1" max="10" class="accent-brand" aria-label="Strength" [value]="strength()" (input)="strength.set($any($event.target).valueAsNumber)" />
          </label>
          <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Focus</span>{{ focus() < 34 ? 'Background' : focus() > 66 ? 'Foreground' : 'Middle' }}</span>
            <input type="range" min="0" max="100" class="accent-brand" aria-label="Focus" [value]="focus()" (input)="focus.set($any($event.target).valueAsNumber)" />
          </label>
          @if (motion() !== 'follow') {
            <label class="flex flex-col gap-1"><span class="flex justify-between"><span class="font-semibold">Loop length</span>{{ seconds() }} s</span>
              <input type="range" min="2" max="8" class="accent-brand" aria-label="Loop length" [value]="seconds()" (input)="seconds.set($any($event.target).valueAsNumber)" />
            </label>
          }
          <label class="flex items-center gap-2"><input type="checkbox" class="size-4 accent-brand" [checked]="showDepth()" (change)="showDepth.set($any($event.target).checked)" /> Show depth map</label>
          <button type="button" class="btn-primary" [disabled]="!canRecord" (click)="recordVideo()">{{ recording() ? 'Recording… ' + recordPercent() + '%' : 'Download video' }}</button>
          @if (!canRecord) { <p class="text-muted">This browser cannot record video. Try Chrome, Edge or Safari.</p> }
          <button type="button" class="btn-secondary" (click)="downloadDepth()">Download depth map</button>
          <button type="button" class="btn-secondary" (click)="reset()">Another photo</button>
          @if (depthMs()) { <p class="text-muted">Depth worked out in {{ depthMs() }} s.</p> }
        </fieldset>
      </div>
    </app-tool-page>
  `,
})
export class Photo3d {
  protected readonly content = CONTENT;
  protected readonly accept = CONVERTER_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  protected readonly modelSize = formatBytes(DEPTH_MODEL.bytes);
  protected readonly motions = MOTIONS;
  protected readonly canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

  protected readonly loaded = signal(false);
  protected readonly ready = signal(false);
  protected readonly stage = signal('');
  protected readonly modelPercent = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly motion = signal<Motion>('follow');
  protected readonly strength = signal(5);
  protected readonly focus = signal(50);
  protected readonly seconds = signal(4);
  protected readonly showDepth = signal(false);
  protected readonly recording = signal(false);
  protected readonly recordPercent = signal(0);
  protected readonly depthMs = signal(0);
  protected readonly tilting = signal(false);
  protected readonly tiltPossible = signal(false);
  protected target = { x: 0, y: 0 };

  private readonly view = viewChild<ElementRef<HTMLCanvasElement>>('view');
  private readonly depthView = viewChild<ElementRef<HTMLCanvasElement>>('depthView');
  private readonly encoder = inject(ImageEncoder);
  private renderer: Photo3dRenderer | null = null;
  private worker?: Worker;
  private depth: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  private current = { x: 0, y: 0 };
  private frame = 0;
  private started = 0;
  private fileName = 'photo';
  private nextId = 0;
  private readonly settings = computed(() => ({ strength: this.strength(), focus: this.focus(), motion: this.motion(), seconds: this.seconds() }));

  constructor() {
    afterNextRender(() => this.tiltPossible.set(typeof DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches));
    effect(() => {
      // Restart the loop timing when the animation changes.
      this.settings();
      this.started = performance.now();
    });
    effect(() => {
      const canvas = this.depthView()?.nativeElement;
      if (canvas && this.depth) this.paintDepth(canvas);
    });
    inject(DestroyRef).onDestroy(() => {
      // Nothing to clean up when the page is prerendered on the server.
      if (typeof window === 'undefined') return;
      cancelAnimationFrame(this.frame);
      this.worker?.terminate();
      this.renderer?.dispose();
      removeEventListener('deviceorientation', this.onTilt);
    });
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    this.error.set('');
    let photo: HTMLCanvasElement;
    try {
      const bitmap = await this.encoder.read(file);
      photo = bitmapToCanvas(bitmap, VIEW_SIDE);
      bitmap.close();
    } catch {
      this.error.set('This image could not be read.');
      return;
    }
    this.fileName = baseName(file.name);
    this.loaded.set(true);
    this.stage.set('Preparing the 3D model…');
    try {
      const size = inputSize(photo.width, photo.height);
      const small = document.createElement('canvas');
      small.width = size.width;
      small.height = size.height;
      const context = small.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(photo, 0, 0, size.width, size.height);
      const rgba = context.getImageData(0, 0, size.width, size.height).data;
      const result = await this.estimate({ id: ++this.nextId, rgba, width: size.width, height: size.height });
      this.depth = { data: smoothDepth(result.depth, result.width, result.height), width: result.width, height: result.height };
      this.depthMs.set(Math.round(result.ms / 100) / 10);
      this.start(photo);
    } catch (e) {
      this.loaded.set(false);
      this.error.set(e instanceof Error ? e.message : 'Depth could not be worked out.');
    } finally {
      this.stage.set('');
      this.modelPercent.set(null);
    }
  }

  private estimate(request: DepthRequest): Promise<Extract<DepthResponse, { kind: 'done' }>> {
    this.worker ??= new Worker(new URL('./depth.worker', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<DepthResponse>) => {
        if (data.kind === 'model') {
          this.modelPercent.set(Math.round(data.fraction * 100));
          this.stage.set(data.fraction < 1 ? `Downloading the 3D model (first time only)… ${Math.round(data.fraction * 100)}%` : 'Preparing the 3D model…');
        } else if (data.kind === 'working') {
          this.stage.set('Working out the depth of your photo…');
        } else if (data.kind === 'done') {
          resolve(data);
        } else {
          reject(new Error(data.message));
        }
      };
      worker.onerror = () => {
        this.worker?.terminate();
        this.worker = undefined;
        reject(new Error('The 3D model could not run on this device.'));
      };
      worker.postMessage(request, [request.rgba.buffer]);
    });
  }

  private start(photo: HTMLCanvasElement): void {
    const canvas = this.view()!.nativeElement;
    canvas.width = photo.width;
    canvas.height = photo.height;
    this.renderer?.dispose();
    this.renderer = new Photo3dRenderer(canvas);
    this.renderer.setImage(photo);
    this.renderer.setDepth(this.depth!.data, this.depth!.width, this.depth!.height);
    this.ready.set(true);
    this.started = performance.now();
    cancelAnimationFrame(this.frame);
    const loop = () => {
      this.drawFrame((performance.now() - this.started) / 1000);
      this.frame = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Draws the view at `time` seconds into the animation. */
  private drawFrame(time: number, motion: Motion = this.motion()): void {
    if (!this.renderer) return;
    const amount = this.strength() * 0.007;
    let move = { x: 0, y: 0, dolly: 0 };
    if (motion === 'follow') {
      // Ease towards the pointer so the movement feels smooth.
      this.current.x += (this.target.x - this.current.x) * 0.12;
      this.current.y += (this.target.y - this.current.y) * 0.12;
      move = { ...this.current, dolly: 0 };
    } else {
      move = motionAt(motion, (time / this.seconds()) % 1);
    }
    this.renderer.draw({ x: move.x * amount, y: move.y * amount, dolly: move.dolly * amount * 3, focus: this.focus() / 100, zoom: 1 + amount * 1.6 });
  }

  protected pointer(event: PointerEvent): void {
    if (this.tilting()) return;
    const box = (event.target as HTMLElement).getBoundingClientRect();
    this.target = { x: ((event.clientX - box.left) / box.width) * 2 - 1, y: ((event.clientY - box.top) / box.height) * 2 - 1 };
  }

  private readonly onTilt = (event: DeviceOrientationEvent) => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.target = { x: clamp((event.gamma ?? 0) / 25), y: clamp(((event.beta ?? 45) - 45) / 25) };
  };

  protected async useTilt(): Promise<void> {
    const request = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (request && (await request().catch(() => 'denied')) !== 'granted') {
      this.error.set('Tilt was not allowed. Move your finger on the photo instead.');
      return;
    }
    addEventListener('deviceorientation', this.onTilt);
    this.tilting.set(true);
  }

  private paintDepth(canvas: HTMLCanvasElement): void {
    const depth = this.depth!;
    canvas.width = depth.width;
    canvas.height = depth.height;
    const image = new ImageData(depth.width, depth.height);
    for (let i = 0; i < depth.data.length; i++) image.data.set([depth.data[i], depth.data[i], depth.data[i], 255], i * 4);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
  }

  protected async downloadDepth(): Promise<void> {
    if (!this.depth) return;
    const canvas = document.createElement('canvas');
    this.paintDepth(canvas);
    downloadBlob(await canvasToBlob(canvas), `${this.fileName}_depth.png`);
  }

  /** Records two loops of the animation (a circle when following the mouse) as a video. */
  protected async recordVideo(): Promise<void> {
    const canvas = this.view()?.nativeElement;
    if (!canvas || this.recording()) return;
    const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) {
      this.error.set('This browser cannot record video.');
      return;
    }
    const motion: Motion = this.motion() === 'follow' ? 'circle' : this.motion();
    const duration = this.seconds() * 2;
    this.recording.set(true);
    cancelAnimationFrame(this.frame);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();
    const began = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const time = (performance.now() - began) / 1000;
        this.recordPercent.set(Math.min(100, Math.round((time / duration) * 100)));
        this.drawFrame(time, motion);
        if (time < duration) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    recorder.stop();
    await done;
    stream.getTracks().forEach((track) => track.stop());
    const extension = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    downloadBlob(new Blob(chunks, { type: type.split(';')[0] }), `${this.fileName}-3d.${extension}`);
    this.recording.set(false);
    this.started = performance.now();
    const loop = () => {
      this.drawFrame((performance.now() - this.started) / 1000);
      this.frame = requestAnimationFrame(loop);
    };
    loop();
  }

  protected reset(): void {
    cancelAnimationFrame(this.frame);
    this.renderer?.dispose();
    this.renderer = null;
    this.depth = null;
    this.loaded.set(false);
    this.ready.set(false);
    this.depthMs.set(0);
  }
}
