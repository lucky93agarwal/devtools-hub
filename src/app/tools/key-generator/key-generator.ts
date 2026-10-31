import { Component, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { KEY_ALGS, KeyAlg, KeyPair, generateKeyPair, jwkToPem, pemToJwk } from './keys';

const CONTENT: ToolContent = {
  aboutHeading: 'About this key pair and JWK tool',
  about:
    'Signing JWTs with RS256, ES256 or EdDSA, setting up OAuth or publishing a JWKS endpoint needs key pairs in the ' +
    'right format. Generate RSA, ECDSA or Ed25519 keys with your browser’s Web Crypto and get them as PEM (PKCS#8 and ' +
    'SPKI), as JWK, and as a JWKS ready for /.well-known/jwks.json, with a standard RFC 7638 thumbprint as the kid. ' +
    'The converter turns PEM keys, including older PKCS#1 RSA keys, into JWK and JWKs back into PEM.',
  steps: [
    'Choose the algorithm your library expects, such as RS256 or ES256, and Generate.',
    'Keep the private key secret: put it in your secrets manager, never in Git.',
    'Publish the JWKS (public key only) so others can verify your tokens.',
    'To convert an existing key, switch to PEM → JWK or JWK → PEM and paste it.',
  ],
  faq: [
    { question: 'Which algorithm should I choose?', answer: 'RS256 works everywhere. ES256 gives much smaller keys and signatures with the same security. EdDSA (Ed25519) is fast and modern, but check that your libraries support it.' },
    { question: 'Is it safe to make keys in a browser?', answer: 'The keys are made by Web Crypto with a secure random source and never leave the page. For production signing keys, many teams still prefer keys generated inside a KMS or HSM.' },
    { question: 'What is the kid?', answer: 'The key id: here the RFC 7638 thumbprint of the public key. Put it in the JWT header so verifiers know which key from the JWKS to use.' },
  ],
};

@Component({
  selector: 'app-key-generator',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="key-generator" [content]="content" privacy="Keys are made and converted in your browser with Web Crypto. Nothing is sent to a server.">
      <div class="flex w-fit flex-wrap rounded-3xl border border-line p-0.5 sm:rounded-full" role="tablist" aria-label="Mode">
        @for (tab of tabs; track tab.value) {
          <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="mode() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="mode() === tab.value" (click)="mode.set(tab.value)">
            {{ tab.label }}
          </button>
        }
      </div>

      @if (mode() === 'generate') {
        <div class="mt-6 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Algorithm</span>
            <select class="field" [value]="alg()" (change)="alg.set($any($event.target).value)">
              @for (a of algs; track a.value) {
                <option [value]="a.value">{{ a.label }}</option>
              }
            </select>
          </label>
          @if (alg().startsWith('RS') || alg().startsWith('PS')) {
            <label class="flex flex-col gap-1 text-sm"><span class="font-semibold">Key size</span>
              <select class="field" [value]="bits()" (change)="bits.set(+$any($event.target).value)"><option [value]="2048">2048 bits</option><option [value]="3072">3072 bits</option><option [value]="4096">4096 bits</option></select>
            </label>
          }
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Generating…' : 'Generate' }}</button>
        </div>
        @if (problem(); as message) {
          <p class="mt-4 text-sm text-danger" role="alert">{{ message }}</p>
        }
        @if (pair(); as p) {
          <p class="mt-4 text-sm">Key id (kid): <code class="font-mono">{{ p.kid }}</code></p>
          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            @for (block of [{ l: 'Private key (PEM, keep secret)', v: p.privatePem, f: 'private.pem' }, { l: 'Public key (PEM)', v: p.publicPem, f: 'public.pem' }, { l: 'JWKS (public, for /.well-known/jwks.json)', v: p.jwks, f: 'jwks.json' }, { l: 'Private JWK (keep secret)', v: json(p.privateJwk), f: 'private.jwk.json' }]; track block.l) {
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-semibold">{{ block.l }}</span>
                  <span class="flex gap-2"><app-copy-button [text]="block.v" [ariaLabel]="'Copy ' + block.l" /><button type="button" class="btn-small" (click)="save(block.v, block.f)">Download</button></span>
                </div>
                <textarea rows="8" class="field-code" readonly [attr.aria-label]="block.l" [value]="block.v"></textarea>
              </div>
            }
          </div>
        }
      } @else {
        <div class="mt-6 grid gap-4 lg:grid-cols-2">
          <label class="flex flex-col gap-2">
            <span class="text-sm font-semibold">{{ mode() === 'pem' ? 'PEM key' : 'JWK or JWKS' }}</span>
            <textarea rows="12" class="field-code" spellcheck="false" [placeholder]="mode() === 'pem' ? '-----BEGIN PUBLIC KEY-----' : '{&quot;kty&quot;: &quot;EC&quot;, …}'" [value]="convertInput()" (input)="convertInput.set($any($event.target).value)"></textarea>
          </label>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">{{ mode() === 'pem' ? 'JWK' : 'PEM' }}</span><app-copy-button [text]="convertOutput()" /></div>
            <textarea rows="12" class="field-code" readonly aria-label="Converted key" [value]="convertOutput()"></textarea>
          </div>
        </div>
        <div class="mt-3 flex items-center gap-3">
          <button type="button" class="btn-primary" [disabled]="!convertInput().trim()" (click)="convert()">Convert</button>
          <span class="text-sm" [class]="convertError() ? 'text-danger' : 'text-muted'" aria-live="polite">{{ convertError() ?? convertKind() }}</span>
        </div>
      }
    </app-tool-page>
  `,
})
export class KeyGenerator {
  protected readonly content = CONTENT;
  protected readonly algs = KEY_ALGS;
  protected readonly tabs = [
    { value: 'generate' as const, label: 'Generate' },
    { value: 'pem' as const, label: 'PEM → JWK' },
    { value: 'jwk' as const, label: 'JWK → PEM' },
  ];
  protected readonly mode = signal<'generate' | 'pem' | 'jwk'>('generate');
  protected readonly alg = signal<KeyAlg>('ES256');
  protected readonly bits = signal(2048);
  protected readonly pair = signal<KeyPair | null>(null);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly convertInput = signal('');
  protected readonly convertOutput = signal('');
  protected readonly convertError = signal<string | null>(null);
  protected readonly convertKind = signal('');

  protected json(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  protected async generate(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      this.pair.set(await generateKeyPair(this.alg(), this.bits()));
    } catch (error) {
      this.problem.set(this.alg() === 'EdDSA' ? 'This browser cannot make Ed25519 keys yet. Use a current Chrome, Edge, Firefox or Safari, or choose ES256.' : (error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async convert(): Promise<void> {
    const r = this.mode() === 'pem' ? await pemToJwk(this.convertInput()) : await jwkToPem(this.convertInput());
    this.convertOutput.set(r.ok ? r.text : '');
    this.convertError.set(r.ok ? null : r.error);
    this.convertKind.set(r.ok ? r.kind : '');
  }

  protected save(text: string, name: string): void {
    downloadText(text, name, 'text/plain');
  }
}
