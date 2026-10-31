import { Component, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { AES_FORMATS, AesFormat, decrypt, encrypt } from './aes';

const CONTENT: ToolContent = {
  aboutHeading: 'About this AES encryption tool',
  about:
    'Encrypt and decrypt text with a password using AES-256 and your browser’s built-in Web Crypto. The recommended ' +
    'format is AES-256-GCM with a key made from the password by PBKDF2 (600,000 rounds), which also detects any ' +
    'change to the encrypted text. The OpenSSL-compatible format matches openssl enc -aes-256-cbc -pbkdf2 -iter 10000 ' +
    '-md sha256 -base64, so text encrypted here can be decrypted in a terminal and the other way round. Useful for ' +
    'testing encrypted payloads and sharing a secret through a channel you do not fully trust.',
  steps: [
    'Choose Encrypt or Decrypt and the format.',
    'Type the password. Both sides must use the same password and format.',
    'Paste the text and choose the button. Copy the result.',
  ],
  faq: [
    { question: 'Can you recover my text if I forget the password?', answer: 'No. Without the password the text cannot be decrypted, by anyone.' },
    { question: 'How do I decrypt in a terminal?', answer: 'For the OpenSSL format: echo "<text>" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 10000 -md sha256 -base64 -A -pass pass:<password>' },
    { question: 'Should I use this to protect production data?', answer: 'Use your platform’s key management for production. This page is for testing and occasional manual encryption.' },
  ],
};

@Component({
  selector: 'app-aes-encryption',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="aes-encryption" [content]="content" privacy="Encrypted in your browser with Web Crypto. Text and passwords are never sent to a server.">
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Mode">
          @for (tab of tabs; track tab.value) {
            <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
              [class]="mode() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="mode() === tab.value" (click)="setMode(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Format</span>
          <select class="field" [value]="format()" (change)="format.set($any($event.target).value)">
            @for (f of formats; track f.value) {
              <option [value]="f.value">{{ f.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Password</span>
          <input type="password" class="field font-mono" autocomplete="off" [value]="password()" (input)="password.set($any($event.target).value)" />
        </label>
      </div>
      <p class="mt-2 text-sm text-muted">{{ hint() }}</p>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-semibold">{{ mode() === 'encrypt' ? 'Text to encrypt' : 'Encrypted text (Base64)' }}</span>
          <textarea rows="8" class="field-code" spellcheck="false" [value]="input()" (input)="input.set($any($event.target).value)"></textarea>
        </label>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">Result</span>
            <app-copy-button [text]="output()" />
          </div>
          <textarea rows="8" class="field-code" readonly aria-label="Result" [value]="output()"></textarea>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-4">
        <button type="button" class="btn-primary" [disabled]="!input() || !password() || busy()" (click)="run()">{{ busy() ? 'Working…' : mode() === 'encrypt' ? 'Encrypt' : 'Decrypt' }}</button>
        @if (problem(); as message) {
          <p class="text-sm text-danger" role="alert">{{ message }}</p>
        }
      </div>
    </app-tool-page>
  `,
})
export class AesEncryption {
  protected readonly content = CONTENT;
  protected readonly formats = AES_FORMATS;
  protected readonly tabs = [
    { value: 'encrypt' as const, label: 'Encrypt' },
    { value: 'decrypt' as const, label: 'Decrypt' },
  ];
  protected readonly mode = signal<'encrypt' | 'decrypt'>('encrypt');
  protected readonly format = signal<AesFormat>('gcm');
  protected readonly password = signal('');
  protected readonly input = signal('');
  protected readonly output = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected hint(): string {
    return AES_FORMATS.find((f) => f.value === this.format())!.hint;
  }

  protected setMode(mode: 'encrypt' | 'decrypt'): void {
    if (mode === this.mode()) return;
    // Carry the result over, so encrypting and then decrypting is one click.
    if (this.output()) this.input.set(this.output());
    this.output.set('');
    this.problem.set(null);
    this.mode.set(mode);
  }

  protected async run(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      if (this.mode() === 'encrypt') this.output.set(await encrypt(this.input(), this.password(), this.format()));
      else {
        const r = await decrypt(this.input(), this.password(), this.format());
        this.output.set(r.ok ? r.text : '');
        this.problem.set(r.ok ? null : r.error);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
