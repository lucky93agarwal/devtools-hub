import { Component, afterNextRender, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { PasswordOptions, SecretFormat, crackTime, entropyBits, generatePassword, generateSecret, pools, strength } from './password';

const CONTENT: ToolContent = {
  aboutHeading: 'About this password and secret generator',
  about:
    "Make strong passwords for databases, admin accounts and Wi-Fi, and random secrets for JWT signing keys, API keys, " +
    'session secrets and encryption keys. Everything comes from your browser’s cryptographically secure random number ' +
    'generator, without the bias of naive methods. The strength meter shows the entropy in bits and roughly how long ' +
    'an offline attack would take.',
  steps: [
    'Choose Password or Secret key.',
    'For a password, pick the length and the kinds of characters. Leave out look-alike characters if people will type it.',
    'For a secret, pick the size and the format your framework expects (hex or Base64).',
    'Copy a value. A new set is made each time you choose Generate.',
  ],
  faq: [
    { question: 'How long should a password be?', answer: 'At least 16 characters for accounts and 20 or more for database and admin passwords. Length matters more than symbols.' },
    { question: 'How big should a JWT secret be?', answer: 'For HS256, at least 32 random bytes (256 bits); 64 bytes for HS512. Never use a word or a short phrase.' },
    { question: 'Are the passwords stored or sent anywhere?', answer: 'No. They are made in your browser and disappear when you leave the page.' },
  ],
};

@Component({
  selector: 'app-password-generator',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="password-generator" [content]="content" privacy="Made in your browser with its secure random number generator. Nothing is stored or sent.">
      <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="What to make">
        @for (tab of tabs; track tab.value) {
          <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="kind() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="kind() === tab.value" (click)="kind.set(tab.value); regenerate()">
            {{ tab.label }}
          </button>
        }
      </div>

      @if (kind() === 'password') {
        <div class="card mt-6 grid gap-4 p-4 sm:grid-cols-2">
          <label class="flex flex-col gap-2 text-sm leading-5 sm:col-span-2">
            <span class="flex justify-between"><span class="font-semibold">Length</span><span class="text-muted">{{ options().length }} characters</span></span>
            <input type="range" min="8" max="128" class="accent-brand" aria-label="Password length" [value]="options().length" (input)="set('length', $any($event.target).valueAsNumber)" />
          </label>
          @for (o of toggles; track o.key) {
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" class="size-4 accent-brand" [checked]="options()[o.key]" (change)="set(o.key, $any($event.target).checked)" />
              {{ o.label }}
            </label>
          }
        </div>
      } @else {
        <div class="card mt-6 flex flex-wrap gap-4 p-4">
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Size</span>
            <select class="field" [value]="bytes()" (change)="bytes.set(+$any($event.target).value); regenerate()">
              <option [value]="16">16 bytes (128 bits)</option>
              <option [value]="32">32 bytes (256 bits) – HS256, AES-256</option>
              <option [value]="64">64 bytes (512 bits) – HS512</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Format</span>
            <select class="field" [value]="format()" (change)="format.set($any($event.target).value); regenerate()">
              <option value="hex">Hex</option>
              <option value="base64url">Base64URL</option>
              <option value="base64">Base64</option>
            </select>
          </label>
        </div>
      }

      @if (problem(); as message) {
        <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ message }}</p>
      }
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm" aria-live="polite">
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="rating().tone === 'success' ? 'bg-success/15 text-success' : rating().tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-danger/10 text-danger'">{{ rating().label }}</span>
          <span class="ml-2 text-muted">{{ bits() }} bits of entropy · cracking would take {{ crack() }}</span>
        </p>
        <button type="button" class="btn-primary" (click)="regenerate()">Generate</button>
      </div>
      <ul class="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line" aria-label="Generated values">
        @for (value of values(); track $index) {
          <li class="flex items-center gap-3 px-4 py-2.5">
            <code class="min-w-0 flex-1 font-mono text-sm break-all">{{ value }}</code>
            <app-copy-button [text]="value" [ariaLabel]="'Copy value ' + ($index + 1)" />
          </li>
        }
      </ul>
    </app-tool-page>
  `,
})
export class PasswordGenerator {
  protected readonly content = CONTENT;
  protected readonly tabs = [
    { value: 'password' as const, label: 'Password' },
    { value: 'secret' as const, label: 'Secret key' },
  ];
  protected readonly toggles: { key: 'lower' | 'upper' | 'digits' | 'symbols' | 'noSimilar'; label: string }[] = [
    { key: 'lower', label: 'Lowercase (a–z)' },
    { key: 'upper', label: 'Uppercase (A–Z)' },
    { key: 'digits', label: 'Digits (0–9)' },
    { key: 'symbols', label: 'Symbols (!@#…)' },
    { key: 'noSimilar', label: 'Leave out look-alikes (I l 1 O 0 o)' },
  ];
  protected readonly kind = signal<'password' | 'secret'>('password');
  protected readonly options = signal<PasswordOptions>({ length: 20, lower: true, upper: true, digits: true, symbols: true, noSimilar: false });
  protected readonly bytes = signal(32);
  protected readonly format = signal<SecretFormat>('base64url');
  protected readonly values = signal<string[]>([]);
  protected readonly problem = signal<string | null>(null);

  protected readonly bits = computed(() =>
    this.kind() === 'secret' ? this.bytes() * 8 : entropyBits(this.options().length, pools(this.options()).join('').length),
  );
  protected readonly rating = computed(() => strength(this.bits()));
  protected readonly crack = computed(() => crackTime(this.bits()));

  constructor() {
    afterNextRender(() => this.regenerate());
  }

  protected set<K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
    this.regenerate();
  }

  protected regenerate(): void {
    try {
      this.values.set(Array.from({ length: 5 }, () => (this.kind() === 'secret' ? generateSecret(this.bytes(), this.format()) : generatePassword(this.options()))));
      this.problem.set(null);
    } catch (error) {
      this.values.set([]);
      this.problem.set((error as Error).message);
    }
  }
}
