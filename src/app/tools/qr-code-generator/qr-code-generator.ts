import { Component, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { downloadBlob, downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { QR_CONTENT } from './content';
import { Ecc, QrStyle, WifiSecurity, drawToCanvas, emailPayload, makeQr, phonePayload, toSvg, wifiPayload } from './qr';

type Kind = 'text' | 'wifi' | 'email' | 'phone';

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

@Component({
  selector: 'app-qr-code-generator',
  imports: [Icon, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap rounded-3xl border border-line p-0.5 sm:w-fit sm:rounded-full" role="tablist" aria-label="QR code content">
        @for (tab of kinds; track tab.value) {
          <button
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="kind() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
            [attr.aria-selected]="kind() === tab.value"
            (click)="kind.set(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <div class="mt-6 grid gap-8 md:grid-cols-[1fr_auto]">
        <div class="flex flex-col gap-4">
          @switch (kind()) {
            @case ('text') {
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Link or text</span>
                <textarea rows="4" class="field-code" spellcheck="false" placeholder="https://example.com or any text" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
              </label>
            }
            @case ('wifi') {
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Network name (SSID)</span>
                <input class="field" autocomplete="off" [value]="ssid()" (input)="ssid.set($any($event.target).value)" />
              </label>
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Security</span>
                <select class="field" [value]="security()" (change)="security.set($any($event.target).value)">
                  <option value="WPA">WPA, WPA2 or WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">None (open network)</option>
                </select>
              </label>
              @if (security() !== 'nopass') {
                <label class="flex flex-col gap-2 text-sm leading-5">
                  <span class="font-semibold">Password</span>
                  <input class="field" autocomplete="off" [value]="wifiPassword()" (input)="wifiPassword.set($any($event.target).value)" />
                </label>
              }
              <label class="flex items-center gap-2 text-sm leading-5">
                <input type="checkbox" class="size-4 accent-brand" [checked]="hidden()" (change)="hidden.set($any($event.target).checked)" />
                Hidden network
              </label>
            }
            @case ('email') {
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">To</span>
                <input type="email" class="field" [value]="emailTo()" (input)="emailTo.set($any($event.target).value)" />
              </label>
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Subject</span>
                <input class="field" [value]="emailSubject()" (input)="emailSubject.set($any($event.target).value)" />
              </label>
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Message</span>
                <textarea rows="3" class="field-code font-sans" [value]="emailBody()" (input)="emailBody.set($any($event.target).value)"></textarea>
              </label>
            }
            @case ('phone') {
              <label class="flex flex-col gap-2 text-sm leading-5">
                <span class="font-semibold">Phone number</span>
                <input type="tel" class="field" placeholder="+91 98765 43210" [value]="phone()" (input)="phone.set($any($event.target).value)" />
              </label>
            }
          }

          <fieldset class="card grid gap-4 p-4 sm:grid-cols-2">
            <legend class="sr-only">QR code style</legend>
            <label class="flex flex-col gap-2 text-sm leading-5">
              <span class="font-semibold">Error correction</span>
              <select class="field" [value]="ecc()" (change)="ecc.set($any($event.target).value)">
                <option value="L">Low (7%), smallest code</option>
                <option value="M">Medium (15%)</option>
                <option value="Q">Quartile (25%)</option>
                <option value="H">High (30%), survives a logo on top</option>
              </select>
            </label>
            <label class="flex flex-col gap-2 text-sm leading-5">
              <span class="font-semibold">PNG size</span>
              <select class="field" [value]="pixels()" (change)="pixels.set(+$any($event.target).value)">
                @for (size of sizes; track size) {
                  <option [value]="size">{{ size }} × {{ size }} px</option>
                }
              </select>
            </label>
            <label class="flex items-center gap-3 text-sm leading-5">
              <input type="color" class="h-9 w-12 cursor-pointer rounded border border-line" aria-label="Code colour" [value]="foreground()" (input)="foreground.set($any($event.target).value)" />
              <span class="font-semibold">Code colour</span>
            </label>
            <label class="flex items-center gap-3 text-sm leading-5">
              <input type="color" class="h-9 w-12 cursor-pointer rounded border border-line" aria-label="Background colour" [disabled]="transparent()" [value]="background()" (input)="background.set($any($event.target).value)" />
              <span class="font-semibold">Background</span>
              <span class="flex items-center gap-1.5">
                <input type="checkbox" class="size-4 accent-brand" [checked]="transparent()" (change)="transparent.set($any($event.target).checked)" />
                Transparent
              </span>
            </label>
            <label class="flex flex-col gap-2 text-sm leading-5 sm:col-span-2">
              <span class="flex justify-between"><span class="font-semibold">Quiet zone</span><span class="text-muted">{{ margin() }} modules</span></span>
              <input type="range" min="0" max="8" class="accent-brand" [value]="margin()" (input)="margin.set($any($event.target).valueAsNumber)" />
            </label>
          </fieldset>
        </div>

        <div class="flex flex-col items-center gap-4 md:w-72">
          <div class="checkerboard grid aspect-square w-full max-w-72 place-items-center rounded-xl border border-line p-2">
            <canvas #preview class="aspect-square h-auto w-full [image-rendering:pixelated]" [class.invisible]="!modules()" role="img" [attr.aria-label]="modules() ? 'QR code preview' : null"></canvas>
          </div>
          <div class="min-h-12 text-center text-sm leading-5" aria-live="polite">
            @if (error(); as message) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
            } @else if (modules(); as m) {
              <p class="text-muted">{{ m.length }} × {{ m.length }} modules · {{ bytes() }} bytes</p>
              @if (warning(); as message) {
                <p class="mt-2 rounded-xl border border-warning bg-warning/10 px-3 py-2">{{ message }}</p>
              }
            } @else {
              <p class="text-muted">Fill in the details to see your QR code.</p>
            }
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <button type="button" class="btn-primary" [disabled]="!modules()" (click)="downloadPng()">
              <app-icon [path]="icons.download" [size]="20" />
              PNG
            </button>
            <button type="button" class="btn-secondary" [disabled]="!modules()" (click)="downloadSvg()">
              <app-icon [path]="icons.download" [size]="20" />
              SVG
            </button>
          </div>
        </div>
      </div>

      <p class="mt-6 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        QR codes are made in your browser. Wi-Fi passwords and links are never sent to a server.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class QrCodeGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'qr-code-generator')!;
  protected readonly content = QR_CONTENT;
  protected readonly icons = ICONS;
  protected readonly sizes = [256, 512, 1024, 2048];
  protected readonly kinds: { value: Kind; label: string }[] = [
    { value: 'text', label: 'Link or text' },
    { value: 'wifi', label: 'Wi-Fi' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
  ];

  protected readonly kind = signal<Kind>('text');
  protected readonly text = signal('https://devtools24.in');
  protected readonly ssid = signal('');
  protected readonly wifiPassword = signal('');
  protected readonly security = signal<WifiSecurity>('WPA');
  protected readonly hidden = signal(false);
  protected readonly emailTo = signal('');
  protected readonly emailSubject = signal('');
  protected readonly emailBody = signal('');
  protected readonly phone = signal('');
  protected readonly ecc = signal<Ecc>('M');
  protected readonly pixels = signal(1024);
  protected readonly foreground = signal('#000000');
  protected readonly background = signal('#ffffff');
  protected readonly transparent = signal(false);
  protected readonly margin = signal(4);

  protected readonly payload = computed(() => {
    switch (this.kind()) {
      case 'wifi':
        return this.ssid() ? wifiPayload(this.ssid(), this.wifiPassword(), this.security(), this.hidden()) : '';
      case 'email':
        return this.emailTo().trim() ? emailPayload(this.emailTo(), this.emailSubject(), this.emailBody()) : '';
      case 'phone':
        return this.phone().replace(/[^\d+]/g, '') ? phonePayload(this.phone()) : '';
      default:
        return this.text();
    }
  });
  private readonly qr = computed(() => makeQr(this.payload(), this.ecc()));
  protected readonly modules = computed(() => {
    const qr = this.qr();
    return qr.ok ? qr.modules : null;
  });
  protected readonly error = computed(() => {
    const qr = this.qr();
    return qr.ok ? null : qr.error || null;
  });
  protected readonly bytes = computed(() => new TextEncoder().encode(this.payload()).length);
  private readonly style = computed<QrStyle>(() => ({
    margin: this.margin(),
    foreground: this.foreground(),
    background: this.transparent() ? 'transparent' : this.background(),
  }));
  /** Codes that many phone cameras cannot read. */
  protected readonly warning = computed(() => {
    if (this.transparent()) return 'Put a transparent code on a light background, or some scanners will not read it.';
    const fg = luminance(this.foreground());
    const bg = luminance(this.background());
    if (fg > bg) return 'The code is lighter than its background. Many scanners only read dark codes on light backgrounds.';
    if ((bg + 0.05) / (fg + 0.05) < 4) return 'The colours are too similar. Use more contrast so the code scans reliably.';
    if (this.margin() < 2) return 'A quiet zone below 2 modules can stop some scanners from finding the code.';
    return null;
  });

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('preview');
  private readonly analytics = inject(Analytics);

  constructor() {
    // Browser only: there is no canvas while the page is prerendered.
    afterRenderEffect(() => {
      const modules = this.modules();
      if (modules) drawToCanvas(this.canvas().nativeElement, modules, this.style(), 576);
    });
  }

  protected downloadPng(): void {
    const modules = this.modules();
    if (!modules) return;
    const canvas = document.createElement('canvas');
    drawToCanvas(canvas, modules, this.style(), this.pixels());
    canvas.toBlob((blob) => blob && downloadBlob(blob, 'qr-code.png'), 'image/png');
    this.analytics.track('qr-download', { format: 'png', kind: this.kind() });
  }

  protected downloadSvg(): void {
    const modules = this.modules();
    if (!modules) return;
    downloadText(toSvg(modules, this.style()), 'qr-code.svg', 'image/svg+xml');
    this.analytics.track('qr-download', { format: 'svg', kind: this.kind() });
  }
}
