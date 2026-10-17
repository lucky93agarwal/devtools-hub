import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { IMAGE_ACCEPT, isSupportedImage } from '../image-converter/image-list';
import { MODELS, ORT_WASM_BYTES } from './bg-removal';
import { BeforeAfter } from './before-after';
import { BACKGROUND_COLOURS, NewBackground, composeBackground } from './compose';
import { BACKGROUND_REMOVER_CONTENT } from './content';
import { RemoveProgress, RemoverClient } from './remover-client';

type State =
  | { kind: 'empty' }
  | { kind: 'working'; progress: RemoveProgress | null; fileName: string }
  | { kind: 'done'; originalUrl: string; resultUrl: string; png: Blob; name: string; width: number; height: number; ms: number }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-background-remover',
  imports: [Icon, UploadBox, ToolInfoSection, BeforeAfter],
  templateUrl: './background-remover.html',
})
export class BackgroundRemover {
  protected readonly tool = TOOLS.find((t) => t.path === 'background-remover')!;
  protected readonly content = BACKGROUND_REMOVER_CONTENT;
  protected readonly icons = ICONS;
  protected readonly accept = IMAGE_ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);
  /** First-use download: the model plus the ONNX Runtime WebAssembly file. */
  protected readonly firstUseSize = formatBytes(MODELS.u2netp.bytes + ORT_WASM_BYTES);
  protected readonly formatBytes = formatBytes;

  protected readonly state = signal<State>({ kind: 'empty' });
  protected readonly colours = BACKGROUND_COLOURS;

  /** What goes behind the cut-out in the preview and the download. */
  protected readonly background = signal<NewBackground>({ kind: 'transparent' });
  /** Last colour picked, kept when switching to another background and back. */
  protected readonly colour = signal<string>(BACKGROUND_COLOURS[0].value);
  /** Object URL of the chosen background image, for the preview. */
  protected readonly backgroundImageUrl = signal<string | null>(null);
  protected readonly backgroundNote = signal('');
  protected readonly saving = signal(false);

  protected readonly previewColour = computed(() => {
    const background = this.background();
    return background.kind === 'colour' ? background.colour : null;
  });
  protected readonly previewImage = computed(() => (this.background().kind === 'image' ? this.backgroundImageUrl() : null));

  protected readonly working = computed(() => {
    const state = this.state();
    return state.kind === 'working' ? state : null;
  });
  protected readonly done = computed(() => {
    const state = this.state();
    return state.kind === 'done' ? state : null;
  });
  protected readonly error = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : null;
  });
  protected readonly modelPercent = computed(() => {
    const progress = this.working()?.progress;
    return progress?.stage === 'model' ? Math.round(progress.fraction * 100) : null;
  });

  private readonly client = inject(RemoverClient);
  private readonly analytics = inject(Analytics);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.releaseUrls();
      this.releaseBackgroundImage();
    });
  }

  protected async start(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (!isSupportedImage(file)) {
      this.fail('Choose a PNG, JPG or WebP image.');
      return;
    }
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.fail(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }

    this.releaseUrls();
    this.state.set({ kind: 'working', progress: null, fileName: file.name });
    try {
      const result = await this.client.remove(file, (progress) =>
        this.state.update((state) => (state.kind === 'working' ? { ...state, progress } : state)),
      );
      this.state.set({
        kind: 'done',
        originalUrl: URL.createObjectURL(file),
        resultUrl: URL.createObjectURL(result.png),
        png: result.png,
        name: `${baseName(file.name)}-no-background.png`,
        width: result.width,
        height: result.height,
        ms: result.ms,
      });
      this.analytics.track('background-remove', { result: 'done', seconds: Math.round(result.ms / 1000) });
    } catch (e) {
      if (e instanceof Error && e.message === 'Replaced by a newer image.') return;
      this.fail(e instanceof Error ? e.message : 'The background could not be removed.');
      this.analytics.track('background-remove', { result: 'error' });
    }
  }

  protected useTransparent(): void {
    this.background.set({ kind: 'transparent' });
  }

  protected useColour(colour: string): void {
    this.colour.set(colour);
    this.background.set({ kind: 'colour', colour });
  }

  protected onBackgroundFile(element: HTMLInputElement): void {
    this.useBackgroundImage(Array.from(element.files ?? []));
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
  }

  /** A background photo; it is scaled to cover the whole image, like a wallpaper. */
  protected useBackgroundImage(files: File[]): void {
    const file = files[0];
    this.backgroundNote.set('');
    if (!file) return;
    if (!isSupportedImage(file) || file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.backgroundNote.set(`Choose a PNG, JPG or WebP image up to ${this.maxSize} for the background.`);
      return;
    }
    this.releaseBackgroundImage();
    this.backgroundImageUrl.set(URL.createObjectURL(file));
    this.background.set({ kind: 'image', file });
  }

  /** Saves the cut-out with the chosen background as a PNG. */
  protected async download(): Promise<void> {
    const done = this.done();
    if (!done || this.saving()) return;
    const background = this.background();
    this.saving.set(true);
    try {
      const png = await composeBackground(done.png, background);
      const suffix = background.kind === 'transparent' ? 'no-background' : 'new-background';
      downloadBlob(png, done.name.replace(/-no-background\.png$/, `-${suffix}.png`));
      this.analytics.track('background-download', { background: background.kind });
    } catch {
      this.backgroundNote.set('The image could not be saved. Try another background.');
    } finally {
      this.saving.set(false);
    }
  }

  protected reset(): void {
    this.releaseUrls();
    this.releaseBackgroundImage();
    this.background.set({ kind: 'transparent' });
    this.backgroundNote.set('');
    this.state.set({ kind: 'empty' });
  }

  private releaseBackgroundImage(): void {
    const url = this.backgroundImageUrl();
    if (url) URL.revokeObjectURL(url);
    this.backgroundImageUrl.set(null);
  }

  private fail(message: string): void {
    this.releaseUrls();
    this.state.set({ kind: 'error', message });
  }

  private releaseUrls(): void {
    const done = this.done();
    if (done) {
      URL.revokeObjectURL(done.originalUrl);
      URL.revokeObjectURL(done.resultUrl);
    }
  }
}
