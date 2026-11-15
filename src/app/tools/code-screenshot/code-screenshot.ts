import { Component, ElementRef, afterRenderEffect, computed, signal, viewChild } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { downloadBlob } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { BACKDROPS, FRAMES, FrameId, LANGUAGES, SHADOWS, ShadowId, THEMES, Theme, Token, frameHeight, tokenize } from './highlight';

const SAMPLE = `suspend fun loadOrders(userId: String): List<Order> {
    // Cached for five minutes
    val cached = cache.get(userId)
    if (cached != null) return cached
    val orders = api.orders(userId, limit = 20)
    cache.put(userId, orders)
    return orders
}`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this code screenshot maker',
  about:
    'Share code as a clean image for slides, blog posts, social media and documentation. Paste code, pick the ' +
    'language, a colour theme and a background, and get a window-style picture with syntax colours, optional line ' +
    'numbers and a file name. Download it as a sharp PNG at twice the screen resolution, or copy it straight into a ' +
    'chat or document.',
  steps: [
    'Paste your code and choose its language.',
    'Pick a theme, a background and the padding.',
    'Download the PNG or copy the image.',
  ],
  faq: [
    { question: 'Is the code uploaded to make the image?', answer: 'No. The image is drawn in your browser with a canvas. Nothing is sent anywhere.' },
    { question: 'Why do the colours differ from my editor?', answer: 'This uses a small built-in highlighter for keywords, strings, comments, numbers and function names. It is made to look good, not to match one editor exactly.' },
    { question: 'Should I share code as an image?', answer: 'Images are great for slides and posts, but people cannot copy the code. In docs and answers, also include the code as text.' },
  ],
};

const FONT = "'JetBrains Mono Variable', ui-monospace, Menlo, Consolas, monospace";

@Component({
  selector: 'app-code-screenshot',
  imports: [ToolPage],
  template: `
    <app-tool-page path="code-screenshot" [content]="content" [wide]="true" privacy="The image is drawn in your browser. Your code is never uploaded.">
      <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div class="flex flex-col gap-3">
          <textarea class="field-code h-64" aria-label="Code" spellcheck="false" [value]="code()" (input)="code.set($any($event.target).value)"></textarea>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <label class="font-semibold">Language
              <select class="field mt-1 w-full" aria-label="Language" [value]="language()" (change)="language.set($any($event.target).value)">
                @for (l of languages; track l.value) { <option [value]="l.value" [selected]="l.value === language()">{{ l.label }}</option> }
              </select>
            </label>
            <label class="font-semibold">Theme
              <select class="field mt-1 w-full" aria-label="Code theme" (change)="themeId.set($any($event.target).value)">
                @for (t of themes; track t.id) { <option [value]="t.id" [selected]="t.id === themeId()">{{ t.label }}</option> }
              </select>
            </label>
            <label class="font-semibold">Background
              <select class="field mt-1 w-full" aria-label="Background" (change)="backdrop.set($any($event.target).value)">
                @for (b of backdrops; track b.id) { <option [value]="b.id" [selected]="b.id === backdrop()">{{ b.label }}</option> }
              </select>
            </label>
            @if (backdrop() === 'custom') {
              <div class="col-span-2 flex items-center gap-3 font-semibold">
                Gradient
                <input type="color" class="h-8 w-12 cursor-pointer rounded border border-line" aria-label="Gradient start colour" [value]="customFrom()" (input)="customFrom.set($any($event.target).value)" />
                <input type="color" class="h-8 w-12 cursor-pointer rounded border border-line" aria-label="Gradient end colour" [value]="customTo()" (input)="customTo.set($any($event.target).value)" />
                <select class="field" aria-label="Gradient direction" (change)="angle.set(+$any($event.target).value)">
                  <option value="135" [selected]="angle() === 135">Diagonal</option>
                  <option value="90" [selected]="angle() === 90">Left to right</option>
                  <option value="180" [selected]="angle() === 180">Top to bottom</option>
                </select>
              </div>
            }
            <label class="font-semibold">Window
              <select class="field mt-1 w-full" aria-label="Window frame" (change)="frame.set($any($event.target).value)">
                @for (f of frames; track f.id) { <option [value]="f.id" [selected]="f.id === frame()">{{ f.label }}</option> }
              </select>
            </label>
            <label class="font-semibold">Shadow
              <select class="field mt-1 w-full" aria-label="Shadow" (change)="shadow.set($any($event.target).value)">
                @for (sh of shadows; track sh.id) { <option [value]="sh.id" [selected]="sh.id === shadow()">{{ sh.label }}</option> }
              </select>
            </label>
            <label class="font-semibold">Corners: {{ radius() }}px
              <input type="range" class="mt-2 w-full" min="0" max="24" step="2" [value]="radius()" (input)="radius.set(+$any($event.target).value)" />
            </label>
            <label class="font-semibold">File name
              <input class="field mt-1 w-full" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="orders.kt" />
            </label>
            <label class="font-semibold">Padding: {{ padding() }}px
              <input type="range" class="mt-2 w-full" min="0" max="128" step="8" [value]="padding()" (input)="padding.set(+$any($event.target).value)" />
            </label>
            <label class="font-semibold">Font size: {{ fontSize() }}px
              <input type="range" class="mt-2 w-full" min="11" max="22" [value]="fontSize()" (input)="fontSize.set(+$any($event.target).value)" />
            </label>
            <label class="col-span-2 flex items-center gap-2"><input type="checkbox" [checked]="lineNumbers()" (change)="lineNumbers.set($any($event.target).checked)" /> Line numbers</label>
          </div>
        </div>
        <div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" (click)="download()">Download PNG</button>
            <button type="button" class="btn-secondary" (click)="copy()">{{ copied() ? 'Copied' : 'Copy image' }}</button>
          </div>
          @if (status()) { <p class="mt-2 text-sm text-muted" role="status">{{ status() }}</p> }
          <div class="mt-3 overflow-auto rounded-xl border border-line bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2">
            <canvas #canvas class="mx-auto block max-w-full" role="img" aria-label="Code screenshot preview"></canvas>
          </div>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class CodeScreenshot {
  protected readonly content = CONTENT;
  protected readonly languages = LANGUAGES;
  protected readonly themes = THEMES;
  protected readonly backdrops = BACKDROPS;
  protected readonly frames = FRAMES;
  protected readonly shadows = SHADOWS;
  protected readonly frame = signal<FrameId>('mac');
  protected readonly shadow = signal<ShadowId>('medium');
  protected readonly radius = signal(12);
  protected readonly customFrom = signal('#6366f1');
  protected readonly customTo = signal('#ec4899');
  /** Gradient direction in degrees, as in CSS. */
  protected readonly angle = signal(135);
  protected readonly code = signal(SAMPLE);
  protected readonly language = signal('kotlin');
  protected readonly themeId = signal('midnight');
  protected readonly backdrop = signal('indigo');
  protected readonly title = signal('Orders.kt');
  protected readonly padding = signal(48);
  protected readonly fontSize = signal(15);
  protected readonly lineNumbers = signal(true);
  protected readonly copied = signal(false);
  protected readonly status = signal('');
  private readonly tokens = computed(() => tokenize(this.code().replace(/\t/g, '    ').replace(/\s+$/, ''), this.language()));
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterRenderEffect(() => this.draw(this.canvas().nativeElement));
    onSharedInput((d) => this.code.set(d['input'] ?? ''));
  }

  private draw(canvas: HTMLCanvasElement): void {
    const theme: Theme = THEMES.find((t) => t.id === this.themeId()) ?? THEMES[0];
    const backdrop = BACKDROPS.find((b) => b.id === this.backdrop()) ?? BACKDROPS[0];
    const lines: Token[][] = this.tokens();
    const size = this.fontSize();
    const lineHeight = Math.round(size * 1.6);
    const pad = backdrop.css.length ? this.padding() : 0;
    const scale = 2;
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${size}px ${FONT}`;
    const charWidth = ctx.measureText('M').width;
    const gutter = this.lineNumbers() ? String(lines.length).length * charWidth + 20 : 0;
    const longest = Math.max(20, ...lines.map((l) => l.reduce((n, t) => n + t.text.length, 0)));
    const frame = this.frame();
    const title = this.title().trim();
    const header = frameHeight(frame, !!title);
    const radius = this.radius();
    const shadow = SHADOWS.find((x) => x.id === this.shadow()) ?? SHADOWS[0];
    const colours = backdrop.id === 'custom' ? [this.customFrom(), this.customTo()] : backdrop.css;
    const inner = 22;
    const windowWidth = Math.ceil(Math.max(360, gutter + longest * charWidth + inner * 2));
    const windowHeight = header + lines.length * lineHeight + inner;
    const width = windowWidth + pad * 2;
    const height = windowHeight + pad * 2;

    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    ctx.scale(scale, scale);

    if (colours.length) {
      const g = gradient(ctx, width, height, backdrop.id === 'custom' ? this.angle() : 135);
      g.addColorStop(0, colours[0]);
      g.addColorStop(1, colours[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    if (pad && shadow.alpha) {
      ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetY = shadow.offset;
    }
    ctx.fillStyle = theme.background;
    ctx.beginPath();
    ctx.roundRect(pad, pad, windowWidth, windowHeight, radius);
    ctx.fill();
    ctx.restore();

    if (frame === 'mac') {
      ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pad + 20 + i * 20, pad + 20, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (frame === 'windows') {
      // Minimise, maximise and close glyphs on the right.
      ctx.strokeStyle = theme.lineNumber;
      ctx.lineWidth = 1.2;
      const right = pad + windowWidth - 18;
      const y = pad + 18;
      ctx.beginPath();
      ctx.moveTo(right - 2 * 40 - 5, y);
      ctx.lineTo(right - 2 * 40 + 5, y);
      ctx.strokeRect(right - 40 - 5, y - 5, 10, 10);
      ctx.moveTo(right - 5, y - 5);
      ctx.lineTo(right + 5, y + 5);
      ctx.moveTo(right + 5, y - 5);
      ctx.lineTo(right - 5, y + 5);
      ctx.stroke();
    }
    if (title && frame !== 'none') {
      ctx.font = `${Math.max(11, size - 2)}px ${FONT}`;
      ctx.fillStyle = theme.lineNumber;
      ctx.textAlign = frame === 'windows' ? 'left' : 'center';
      ctx.fillText(title, frame === 'windows' ? pad + inner : pad + windowWidth / 2, pad + (frame === 'windows' ? 22 : 25));
      ctx.textAlign = 'left';
    }

    ctx.font = `${size}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      const y = pad + header + i * lineHeight + size;
      if (this.lineNumbers()) {
        ctx.fillStyle = theme.lineNumber;
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), pad + inner + gutter - 20, y);
        ctx.textAlign = 'left';
      }
      let x = pad + inner + gutter;
      for (const token of line) {
        ctx.fillStyle = theme.colors[token.kind] ?? theme.text;
        ctx.fillText(token.text, x, y);
        x += token.text.length * charWidth;
      }
    });
  }

  private blob(): Promise<Blob | null> {
    return new Promise((ok) => this.canvas().nativeElement.toBlob(ok, 'image/png'));
  }

  protected async download(): Promise<void> {
    const blob = await this.blob();
    if (blob) downloadBlob(blob, `${(this.title().trim() || 'code').replace(/[^\w.-]+/g, '-')}.png`);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob().then((b) => b!) })]);
      this.copied.set(true);
      this.status.set('');
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.status.set('This browser cannot copy images. Use Download PNG instead.');
    }
  }
}

/** A linear gradient across the image at an angle in CSS degrees (90 = left to right, 180 = top to bottom). */
function gradient(ctx: CanvasRenderingContext2D, width: number, height: number, degrees: number): CanvasGradient {
  const radians = ((degrees - 90) * Math.PI) / 180;
  const half = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const dx = Math.cos(radians) * half;
  const dy = Math.sin(radians) * half;
  return ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
}
