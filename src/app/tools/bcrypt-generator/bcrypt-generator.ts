import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { ARGON2_DEFAULTS, HashKind, describeHash, hashPassword, verifyPassword } from './password-hash';

const CONTENT: ToolContent = {
  aboutHeading: 'About this bcrypt and Argon2 tool',
  about:
    'Passwords must be stored as slow, salted hashes so a stolen database does not reveal them. This tool makes bcrypt ' +
    'and Argon2id hashes like your server does, and checks whether a password matches a stored hash, which helps when ' +
    'a login fails and you are unsure whether the password or the code is wrong. It reads hashes from PHP ($2y$), ' +
    'Node.js and Java ($2a$, $2b$) and from Argon2 libraries.',
  steps: [
    'To make a hash: choose bcrypt or Argon2id, type the password and choose Hash. Higher cost is slower and safer.',
    'To check a hash: switch to Verify, paste the stored hash and type the password.',
    'Read the result: Match or No match, and the settings stored in the hash.',
    'Use test passwords here, not real users’ passwords.',
  ],
  faq: [
    { question: 'Why is the hash different every time?', answer: 'Each hash has a new random salt stored inside it. That is how it should be; verification still works because the salt is read back from the hash.' },
    { question: 'Which cost should I use?', answer: 'For bcrypt, 12 is a good default today (about 250 ms on a server). For Argon2id, OWASP suggests at least 19 MiB of memory and 2 passes.' },
    { question: 'Is my password sent anywhere?', answer: 'No. Hashing runs in your browser with WebAssembly.' },
  ],
};

@Component({
  selector: 'app-bcrypt-generator',
  imports: [Icon, CopyButton, ToolPage],
  template: `
    <app-tool-page path="bcrypt-generator" [content]="content" privacy="Hashed in your browser. Passwords and hashes are never sent to a server.">
      <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Mode">
        @for (tab of tabs; track tab.value) {
          <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="mode() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="mode() === tab.value" (click)="mode.set(tab.value)">
            {{ tab.label }}
          </button>
        }
      </div>

      <div class="mt-6 grid max-w-2xl gap-4">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Password</span>
          <input class="field font-mono" autocomplete="off" spellcheck="false" [value]="password()" (input)="password.set($any($event.target).value)" />
        </label>
        @if (mode() === 'hash') {
          <div class="flex flex-wrap items-end gap-4">
            <label class="flex flex-col gap-1 text-sm leading-5">
              <span class="font-semibold">Algorithm</span>
              <select class="field" [value]="kind()" (change)="kind.set($any($event.target).value)">
                <option value="bcrypt">bcrypt</option>
                <option value="argon2id">Argon2id</option>
              </select>
            </label>
            @if (kind() === 'bcrypt') {
              <label class="flex flex-col gap-1 text-sm leading-5">
                <span class="font-semibold">Cost: {{ cost() }}</span>
                <input type="range" min="4" max="14" class="accent-brand" aria-label="bcrypt cost" [value]="cost()" (input)="cost.set($any($event.target).valueAsNumber)" />
              </label>
            } @else {
              <p class="text-sm text-muted">19 MiB memory, 2 passes, 1 lane (OWASP minimum)</p>
            }
            <button type="button" class="btn-primary" [disabled]="!password() || busy()" (click)="hash()">{{ busy() ? 'Hashing…' : 'Hash' }}</button>
          </div>
          @if (result(); as r) {
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold">Hash</span>
              <app-copy-button [text]="r" />
            </div>
            <code class="card block p-4 font-mono text-sm break-all" aria-label="Hash">{{ r }}</code>
            <p class="text-sm text-muted">{{ describe(r) }}</p>
          }
        } @else {
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Stored hash</span>
            <input class="field font-mono" spellcheck="false" placeholder="$2y$10$… or $argon2id$v=19$…" [value]="stored()" (input)="stored.set($any($event.target).value)" />
          </label>
          @if (storedInfo(); as info) {
            <p class="text-sm text-muted">{{ info }}</p>
          }
          <button type="button" class="btn-primary w-fit" [disabled]="!password() || !stored() || busy()" (click)="verify()">{{ busy() ? 'Checking…' : 'Check' }}</button>
        }
        <div aria-live="polite">
          @if (match() === true) {
            <p class="flex items-center gap-2 font-semibold text-success"><app-icon [path]="icons.check" [size]="18" /> Match: this password produces the hash.</p>
          } @else if (match() === false) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm font-semibold">No match: this password does not produce the hash.</p>
          }
          @if (problem(); as message) {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ message }}</p>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class BcryptGenerator {
  protected readonly content = CONTENT;
  protected readonly icons = ICONS;
  protected readonly tabs = [
    { value: 'hash' as const, label: 'Hash' },
    { value: 'verify' as const, label: 'Verify' },
  ];
  protected readonly mode = signal<'hash' | 'verify'>('hash');
  protected readonly kind = signal<HashKind>('bcrypt');
  protected readonly cost = signal(12);
  protected readonly password = signal('');
  protected readonly stored = signal('');
  protected readonly result = signal('');
  protected readonly match = signal<boolean | null>(null);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly storedInfo = computed(() => describeHash(this.stored()));
  protected readonly describe = describeHash;

  protected async hash(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    this.match.set(null);
    try {
      this.result.set(await hashPassword(this.password(), this.kind(), this.cost(), ARGON2_DEFAULTS));
    } catch (error) {
      this.problem.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    this.match.set(null);
    try {
      this.match.set(await verifyPassword(this.password(), this.stored()));
    } catch (error) {
      this.problem.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
