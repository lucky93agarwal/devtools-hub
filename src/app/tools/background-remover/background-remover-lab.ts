import { Component, DestroyRef, inject, signal } from '@angular/core';
import { formatBytes } from '../../shared/file-utils';
import { UploadBox } from '../../shared/upload-box/upload-box';
import { MODELS, ModelInfo, Remover, createRemover, downloadModel } from './bg-removal';

/**
 * Hidden test page for the background remover proof of concept (day 19).
 * Not linked anywhere and marked noindex; the real tool page comes on day 20.
 */
@Component({
  selector: 'app-background-remover-lab',
  imports: [UploadBox],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[40px] sm:leading-12">Background remover test</h1>
      <p class="mt-3 text-muted">
        Proof of concept with {{ model.name }} ({{ model.licence }}, {{ modelSize }}). The model downloads once and is
        cached; the image stays in your browser. Add ?model=birefnet-lite to try BiRefNet_lite.
      </p>

      <app-upload-box
        class="mt-8 block"
        title="Drop one image"
        buttonLabel="Choose image"
        accept="image/png,image/jpeg,image/webp"
        (filesSelected)="run($event[0])"
      />

      <div class="mt-4 text-sm leading-6" aria-live="polite">
        @for (line of log(); track $index) {
          <p>{{ line }}</p>
        }
      </div>

      @if (before() && after()) {
        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <figure>
            <img [src]="before()" alt="Original image" class="w-full rounded-xl border border-line" />
            <figcaption class="mt-1 text-sm text-muted">Before</figcaption>
          </figure>
          <figure>
            <img [src]="after()" alt="Image with the background removed" class="checkerboard w-full rounded-xl border border-line" />
            <figcaption class="mt-1 text-sm text-muted">After</figcaption>
          </figure>
        </div>
      }
    </div>
  `,
})
export class BackgroundRemoverLab {
  /** Model from the address, for example ?model=birefnet-lite; U2-Netp by default. */
  protected readonly model: ModelInfo =
    MODELS[new URLSearchParams(globalThis.location?.search ?? '').get('model') as ModelInfo['id']] ?? MODELS.u2netp;
  protected readonly modelSize = formatBytes(this.model.bytes);
  protected readonly log = signal<string[]>([]);
  protected readonly before = signal<string | null>(null);
  protected readonly after = signal<string | null>(null);

  private remover?: Remover;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected async run(file: File): Promise<void> {
    this.revoke();
    this.log.set([]);
    try {
      if (!this.remover) {
        let shown = -1;
        const started = performance.now();
        const bytes = await downloadModel(this.model, (fraction) => {
          const percent = Math.floor(fraction * 10) * 10;
          if (percent !== shown) {
            shown = percent;
            this.say(`Model: ${percent}%`);
          }
        });
        this.say(`Model ready in ${seconds(started)}`);
        const loading = performance.now();
        this.remover = await createRemover(this.model, bytes);
        this.say(`Runtime ready (CPU) in ${seconds(loading)}`);
      }
      const bitmap = await createImageBitmap(file);
      const total = performance.now();
      const { png, inferenceMs } = await this.remover.remove(bitmap);
      this.say(
        `Done: ${bitmap.width}x${bitmap.height}, model ${(inferenceMs / 1000).toFixed(1)} s, ` +
          `total ${seconds(total)}, PNG ${formatBytes(png.size)}`,
      );
      bitmap.close();
      this.before.set(URL.createObjectURL(file));
      this.after.set(URL.createObjectURL(png));
    } catch (e) {
      this.say(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private say(line: string): void {
    this.log.update((lines) => [...lines, line]);
  }

  private revoke(): void {
    for (const url of [this.before(), this.after()]) if (url) URL.revokeObjectURL(url);
    this.before.set(null);
    this.after.set(null);
  }
}

const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)} s`;
