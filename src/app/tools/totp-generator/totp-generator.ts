import { Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { drawToCanvas, makeQr } from '../qr-code-generator/qr';
import { Algorithm, DEFAULT_TOTP, base32Decode, buildOtpAuth, newSecret, parseOtpAuth, totp } from './totp';

const CONTENT: ToolContent = {
  aboutHeading: 'About this TOTP and 2FA code generator',
  about:
    'Time-based one-time passwords (TOTP) are the 6-digit codes from Google Authenticator, Microsoft Authenticator and ' +
    'similar apps. When you build or test two-factor login, this page shows the current and next code for a secret, ' +
    'makes new secrets, builds the otpauth:// link and its QR code for authenticator apps, and reads such links. ' +
    'SHA-1, SHA-256 and SHA-512, 6 or 8 digits and other periods are supported, and the codes match RFC 6238.',
  steps: [
    'Paste a Base32 secret or an otpauth:// link, or make a new secret.',
    'Check the settings match your server: algorithm, digits and period (usually SHA-1, 6 digits, 30 seconds).',
    'Compare the code with your app or server. The bar shows when the next one starts.',
    'To set up an authenticator app, fill in the issuer and account and scan the QR code.',
  ],
  faq: [
    { question: 'Why does my code not match?', answer: 'Usually the device clocks differ, or the algorithm, digits or period are different. Servers often also accept the previous and next code to allow for clock drift.' },
    { question: 'Is it safe to paste a real secret?', answer: 'Everything stays in your browser, but treat a real 2FA secret like a password. Use test secrets for development.' },
    { question: 'What is Base32?', answer: 'The letters A–Z and digits 2–7 used to write 2FA secrets so people can type them. Spaces and lowercase are fine.' },
  ],
};

@Component({
  selector: 'app-totp-generator',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="totp-generator" [content]="content" privacy="Codes are made in your browser. Secrets are never sent to a server.">
      <label for="totp-secret" class="text-sm leading-5 font-semibold">Secret (Base32) or otpauth:// link</label>
      <div class="mt-2 flex gap-2">
        <input id="totp-secret" class="field min-w-0 flex-1 font-mono" spellcheck="false" autocomplete="off" [value]="secret()" (input)="onSecret($any($event.target).value)" />
        <button type="button" class="btn-small" (click)="secret.set(newSecret())">New secret</button>
      </div>
      <div class="mt-3 flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-2"><span class="font-semibold">Algorithm</span>
          <select class="field py-1" [value]="algorithm()" (change)="algorithm.set($any($event.target).value)">
            <option value="SHA-1">SHA-1</option><option value="SHA-256">SHA-256</option><option value="SHA-512">SHA-512</option>
          </select>
        </label>
        <label class="flex items-center gap-2"><span class="font-semibold">Digits</span>
          <select class="field py-1" [value]="digits()" (change)="digits.set(+$any($event.target).value)"><option [value]="6">6</option><option [value]="8">8</option></select>
        </label>
        <label class="flex items-center gap-2"><span class="font-semibold">Period</span>
          <select class="field py-1" [value]="period()" (change)="period.set(+$any($event.target).value)"><option [value]="30">30 s</option><option [value]="60">60 s</option></select>
        </label>
      </div>

      <div class="card mt-6 p-6" aria-live="polite">
        @if (error()) {
          <p class="text-sm text-danger">This is not a valid Base32 secret (A–Z and 2–7).</p>
        } @else {
          <p class="text-sm text-muted">Current code</p>
          <div class="flex flex-wrap items-center gap-4">
            <p class="font-mono text-4xl font-bold tracking-[0.2em]">{{ current() || '······' }}</p>
            <app-copy-button [text]="current()" />
          </div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-page" role="progressbar" aria-label="Time left for this code" [attr.aria-valuenow]="left()" aria-valuemin="0" [attr.aria-valuemax]="period()">
            <div class="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear" [style.width.%]="(left() / period()) * 100"></div>
          </div>
          <p class="mt-2 text-sm text-muted">{{ left() }} s left · next code <span class="font-mono">{{ next() }}</span></p>
        }
      </div>

      <section class="mt-8 grid gap-6 md:grid-cols-[1fr_auto]" aria-labelledby="setup-heading">
        <div class="flex flex-col gap-3">
          <h2 id="setup-heading" class="text-xl leading-7">Set up an authenticator app</h2>
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Issuer (your app or company)</span><input class="field" [value]="issuer()" (input)="issuer.set($any($event.target).value)" /></label>
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Account</span><input class="field" [value]="account()" (input)="account.set($any($event.target).value)" /></label>
          <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">otpauth link</span><app-copy-button [text]="link()" /></div>
          <code class="card block p-3 font-mono text-xs break-all">{{ link() }}</code>
        </div>
        <canvas #qr class="aspect-square w-48 rounded-xl border border-line bg-white p-2 [image-rendering:pixelated]" role="img" aria-label="QR code for authenticator apps"></canvas>
      </section>
    </app-tool-page>
  `,
})
export class TotpGenerator {
  protected readonly content = CONTENT;
  protected readonly newSecret = newSecret;
  protected readonly secret = signal('JBSWY3DPEHPK3PXP');
  protected readonly algorithm = signal<Algorithm>(DEFAULT_TOTP.algorithm);
  protected readonly digits = signal(DEFAULT_TOTP.digits);
  protected readonly period = signal(DEFAULT_TOTP.period);
  protected readonly issuer = signal('DevTools24 Test');
  protected readonly account = signal('ada@example.com');
  protected readonly now = signal(0);
  protected readonly current = signal('');
  protected readonly next = signal('');

  private readonly key = computed(() => base32Decode(this.secret()));
  protected readonly error = computed(() => this.key() === null);
  protected readonly left = computed(() => (this.now() ? this.period() - (Math.floor(this.now() / 1000) % this.period()) : this.period()));
  protected readonly link = computed(() =>
    buildOtpAuth({ secret: this.secret(), issuer: this.issuer(), account: this.account(), algorithm: this.algorithm(), digits: this.digits(), period: this.period() }),
  );
  private readonly qr = viewChild.required<ElementRef<HTMLCanvasElement>>('qr');

  constructor() {
    let timer: ReturnType<typeof setInterval> | undefined;
    afterNextRender(() => {
      this.now.set(Date.now());
      timer = setInterval(() => this.now.set(Date.now()), 1000);
    });
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Recompute the codes when the 30-second window or a setting changes.
    effect(() => {
      const key = this.key();
      const now = this.now();
      const settings = { algorithm: this.algorithm(), digits: this.digits(), period: this.period() };
      const step = Math.floor(now / 1000 / settings.period);
      if (!key || !now) return;
      void Promise.all([totp(key, step * settings.period, settings), totp(key, (step + 1) * settings.period, settings)]).then(([c, n]) => {
        this.current.set(c);
        this.next.set(n);
      });
    });
    afterRenderEffect(() => {
      const qr = makeQr(this.link(), 'M');
      if (qr.ok) drawToCanvas(this.qr().nativeElement, qr.modules, { margin: 2, foreground: '#000000', background: '#ffffff' }, 384);
    });
  }

  protected onSecret(value: string): void {
    const parsed = value.trim().startsWith('otpauth://') ? parseOtpAuth(value) : null;
    if (!parsed) {
      this.secret.set(value);
      return;
    }
    this.secret.set(parsed.secret);
    this.issuer.set(parsed.issuer);
    this.account.set(parsed.account);
    this.algorithm.set(parsed.algorithm);
    this.digits.set(parsed.digits);
    this.period.set(parsed.period);
  }
}
