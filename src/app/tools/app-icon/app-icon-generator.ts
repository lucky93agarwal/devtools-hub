import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { downloadBlob, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { buildZip } from '../image-converter/zip';
import { APP_ICON_CONTENT } from './content';
import { IconStyle, planIcons } from './icon-plan';
import { IconRenderer, LoadedImage } from './icon-renderer';

/** Smaller images get blurry at 1024 px, so suggest a bigger one. */
const RECOMMENDED_SIZE = 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg';

@Component({
  selector: 'app-app-icon-generator',
  imports: [Icon, UploadBox, ToolInfoSection],
  templateUrl: './app-icon-generator.html',
})
export class AppIconGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'app-icon-generator')!;
  protected readonly content = APP_ICON_CONTENT;
  protected readonly icons = ICONS;
  protected readonly accept = ACCEPT;
  protected readonly maxSize = formatBytes(LIMITS.MAX_IMAGE_BYTES);

  protected readonly image = signal<LoadedImage | null>(null);
  protected readonly fileName = signal('');
  protected readonly background = signal('#ffffff');
  /** Percent of the icon left empty on each side. */
  protected readonly padding = signal(10);
  protected readonly android = signal(true);
  protected readonly ios = signal(true);
  protected readonly iosAllSizes = signal(false);
  protected readonly note = signal('');
  protected readonly error = signal('');
  protected readonly zipping = signal(false);
  /** Object URLs of the three previews. */
  protected readonly previews = signal<Record<IconStyle | 'ios', string> | null>(null);

  protected readonly plan = computed(() =>
    planIcons({
      android: this.android(),
      ios: this.ios(),
      iosAllSizes: this.iosAllSizes(),
      background: this.background(),
    }),
  );
  protected readonly fileCount = computed(() => this.plan().images.length + this.plan().texts.length);

  private readonly renderer = inject(IconRenderer);
  /** Increases with every redraw, so a slow older preview never replaces a newer one. */
  private previewRun = 0;
  private readonly analytics = inject(Analytics);

  constructor() {
    // Redraw the previews when the image or the look changes.
    effect(() => {
      const image = this.image();
      const options = { background: this.background(), padding: this.padding() / 100 };
      if (!image) return;
      void this.updatePreviews(image, options);
    });
    inject(DestroyRef).onDestroy(() => {
      this.revokePreviews();
      this.image()?.close();
    });
  }

  protected async choose(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    this.error.set('');
    this.note.set('');
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      this.error.set(`This image is ${formatBytes(file.size)}. The limit is ${this.maxSize}.`);
      return;
    }
    try {
      const loaded = await this.renderer.load(file);
      this.image()?.close();
      this.image.set(loaded);
      this.fileName.set(file.name);
      if (Math.min(loaded.width, loaded.height) < RECOMMENDED_SIZE) {
        this.note.set(
          `This image is ${loaded.width}×${loaded.height} px. Use at least ${RECOMMENDED_SIZE}×${RECOMMENDED_SIZE} px, or an SVG, so the largest icons stay sharp.`,
        );
      } else if (loaded.width !== loaded.height) {
        this.note.set('The image is not square, so it is centred with space around it.');
      }
    } catch {
      this.error.set('This image could not be read. Choose a PNG, JPG, WebP or SVG file.');
    }
  }

  protected reset(): void {
    this.revokePreviews();
    this.image()?.close();
    this.image.set(null);
    this.note.set('');
  }

  /** Draws every icon and downloads them as one ZIP laid out like the project folders. */
  protected async download(): Promise<void> {
    const image = this.image();
    if (!image || this.zipping()) return;
    this.zipping.set(true);
    try {
      const options = { background: this.background(), padding: this.padding() / 100 };
      const plan = this.plan();
      const files: { name: string; blob: Blob }[] = [];
      for (const icon of plan.images) {
        files.push({ name: icon.path, blob: await this.renderer.png(image, icon.size, icon.style, options) });
      }
      for (const text of plan.texts) files.push({ name: text.path, blob: new Blob([text.text]) });
      downloadBlob(await buildZip(files), 'app-icons.zip');
      this.analytics.track('app-icon-download', { android: this.android(), ios: this.ios(), files: files.length });
    } catch {
      this.error.set('The icons could not be made. Try another image.');
    } finally {
      this.zipping.set(false);
    }
  }

  private async updatePreviews(image: LoadedImage, options: { background: string; padding: number }): Promise<void> {
    const run = ++this.previewRun;
    const url = async (style: IconStyle) => URL.createObjectURL(await this.renderer.png(image, 192, style, options));
    const next = { square: await url('square'), round: await url('round'), foreground: await url('foreground'), ios: '' };
    next.ios = next.square;
    if (run !== this.previewRun) {
      for (const value of new Set(Object.values(next))) URL.revokeObjectURL(value);
      return;
    }
    this.revokePreviews();
    this.previews.set(next);
  }

  private revokePreviews(): void {
    const previews = this.previews();
    if (!previews) return;
    for (const value of new Set(Object.values(previews))) URL.revokeObjectURL(value);
    this.previews.set(null);
  }
}
