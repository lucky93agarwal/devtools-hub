import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { copyText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import {
  SIGNING_ALGORITHMS,
  SignResult,
  SigningAlgorithm,
  generateKeyPair,
  randomSecret,
  setClaim,
  signJwt,
} from './jwt-sign';
import { ALGORITHMS, securityWarnings } from './jwt-verify';

/** What the decoder needs to show and check a token made here. */
export interface CreatedToken {
  token: string;
  /** Secret (HS) or public key PEM (RS, PS, ES). */
  key: string;
  secretIsBase64: boolean;
}

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>> & { alg: SigningAlgorithm };

const nowSeconds = () => Math.floor(Date.now() / 1000);

@Component({
  selector: 'app-jwt-creator',
  imports: [Icon],
  templateUrl: './jwt-creator.html',
})
export class JwtCreator {
  /** Asks the page to open the new token in the decoder with its key filled in. */
  readonly openInDecoder = output<CreatedToken>();

  protected readonly icons = ICONS;
  protected readonly algorithms = SIGNING_ALGORITHMS;
  protected readonly expiryChoices = [
    { label: '15 minutes', seconds: 15 * 60 },
    { label: '1 hour', seconds: 3600 },
    { label: '1 day', seconds: 86_400 },
  ];

  protected readonly alg = signal<SigningAlgorithm>('HS256');
  protected readonly headerText = signal('{\n  "typ": "JWT"\n}');
  protected readonly payloadText = signal(
    JSON.stringify({ sub: 'user-1024', name: 'Test User', iat: nowSeconds(), exp: nowSeconds() + 3600 }, null, 2),
  );
  protected readonly secret = signal('');
  protected readonly secretIsBase64 = signal(false);
  protected readonly keyPair = signal<KeyPair | null>(null);
  protected readonly generating = signal(false);
  protected readonly result = signal<SignResult | null>(null);
  protected readonly copied = signal<'token' | 'key' | null>(null);
  /** Note under the payload, for example when a quick action could not be applied. */
  protected readonly payloadNote = signal('');

  protected readonly usesSecret = computed(() => ALGORITHMS[this.alg()].family === 'hmac');
  protected readonly warnings = computed(() =>
    this.usesSecret() ? securityWarnings({ alg: this.alg() }, { text: this.secret(), isBase64: this.secretIsBase64() }) : [],
  );
  protected readonly token = computed(() => {
    const result = this.result();
    return result?.ok ? result.token : null;
  });
  protected readonly errorMessage = computed(() => {
    const result = this.result();
    return result && !result.ok ? result.message : null;
  });

  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copyTimer));
  }

  protected async setAlgorithm(alg: SigningAlgorithm): Promise<void> {
    this.alg.set(alg);
    this.result.set(null);
    // A key pair belongs to one algorithm family, so make a matching one.
    if (ALGORITHMS[alg].family !== 'hmac' && this.keyPair()?.alg !== alg) await this.newKeyPair();
  }

  protected async newKeyPair(): Promise<void> {
    const alg = this.alg();
    this.generating.set(true);
    this.result.set(null);
    try {
      const pair = await generateKeyPair(alg);
      // The user may have picked another algorithm while this one was being made.
      if (alg === this.alg()) this.keyPair.set({ ...pair, alg });
    } finally {
      this.generating.set(false);
    }
  }

  protected generateSecret(): void {
    this.secretIsBase64.set(false);
    this.secret.set(randomSecret(this.alg()));
    this.result.set(null);
  }

  protected setIssuedNow(): void {
    this.updateClaim('iat', nowSeconds());
  }

  protected setExpiry(seconds: number | null): void {
    this.updateClaim('exp', seconds === null ? null : nowSeconds() + seconds);
  }

  protected async create(): Promise<void> {
    const pair = this.keyPair();
    if (!this.usesSecret() && (!pair || pair.alg !== this.alg())) {
      this.result.set({ ok: false, message: 'Generate a key pair first.' });
      return;
    }
    this.result.set(
      await signJwt(
        this.alg(),
        this.headerText(),
        this.payloadText(),
        this.usesSecret()
          ? { kind: 'secret', text: this.secret(), isBase64: this.secretIsBase64() }
          : { kind: 'pair', privateKey: pair!.privateKey },
      ),
    );
  }

  protected open(): void {
    const token = this.token();
    if (!token) return;
    this.openInDecoder.emit({
      token,
      key: this.usesSecret() ? this.secret() : this.keyPair()!.publicPem,
      secretIsBase64: this.usesSecret() && this.secretIsBase64(),
    });
  }

  protected async copy(what: 'token' | 'key'): Promise<void> {
    const text = what === 'token' ? this.token() : this.keyPair()?.publicPem;
    if (!text) return;
    this.copied.set((await copyText(text)) ? what : null);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(null), 2000);
  }

  protected onEdit(): void {
    // Edits make the last token out of date.
    this.result.set(null);
    this.payloadNote.set('');
  }

  private updateClaim(name: string, value: number | null): void {
    const updated = setClaim(this.payloadText(), name, value);
    if (updated === null) {
      this.payloadNote.set('Fix the payload JSON first; it must be an object.');
      return;
    }
    this.payloadText.set(updated);
    this.onEdit();
  }
}
