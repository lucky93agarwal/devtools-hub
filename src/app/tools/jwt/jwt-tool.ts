import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { isPlatformBrowser } from '@angular/common';
import { TOOLS } from '../../core/tools';
import { copyText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { CreatedToken, JwtCreator } from './jwt-creator';
import { JWT_CONTENT } from './content';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { SAMPLE_SECRET, createSampleToken } from './jwt-sample';
import { CLAIM_INFO, TokenTiming, decodeJwt, timeClaims, tokenTiming } from './jwt-tools';
import { VerifyResult, keyKind, securityWarnings, verifySignature } from './jwt-verify';

/** How often relative times and the expiry badge refresh, in ms. */
const TICK_MS = 15_000;

const TIMING_TEXT: Record<TokenTiming, { label: string; detail: string; tone: 'danger' | 'warning' | 'success' | 'neutral' }> = {
  expired: { label: 'Expired', detail: 'The expiry time (exp) has passed.', tone: 'danger' },
  'not-yet-valid': { label: 'Not valid yet', detail: 'The not-before time (nbf) is still in the future.', tone: 'warning' },
  active: { label: 'Not expired', detail: 'The token is inside its time window.', tone: 'success' },
  'no-expiry': { label: 'No expiry', detail: 'The token has no exp claim, so it never expires by itself.', tone: 'neutral' },
};

@Component({
  selector: 'app-jwt-tool',
  imports: [Icon, JwtCreator, ToolInfoSection],
  templateUrl: './jwt-tool.html',
})
export class JwtTool {
  protected readonly tool = TOOLS.find((t) => t.path === 'jwt')!;
  protected readonly content = JWT_CONTENT;
  protected readonly icons = ICONS;

  protected readonly tabs = [
    { value: 'decode' as const, label: 'Decode and verify' },
    { value: 'create' as const, label: 'Create a token' },
  ];
  protected readonly mode = signal<'decode' | 'create'>('decode');

  protected readonly token = signal('');
  protected readonly now = signal(new Date());
  protected readonly copied = signal(false);
  protected readonly sampleSecret = SAMPLE_SECRET;

  /** Secret (HS) or public key (RS, PS, ES) typed by the user to check the signature. */
  protected readonly verifyKey = signal('');
  protected readonly secretIsBase64 = signal(false);
  protected readonly verifyResult = signal<VerifyResult | null>(null);
  /** The token currently in the box is the generated sample. */
  protected readonly sampleLoaded = signal(false);

  protected readonly result = computed(() => (this.token().trim() ? decodeJwt(this.token()) : null));
  protected readonly jwt = computed(() => {
    const result = this.result();
    return result?.ok ? result.jwt : null;
  });
  protected readonly error = computed(() => {
    const result = this.result();
    return result && !result.ok ? result.message : null;
  });
  protected readonly times = computed(() => {
    const jwt = this.jwt();
    return jwt ? timeClaims(jwt.payload, this.now()) : [];
  });
  protected readonly timing = computed(() => {
    const jwt = this.jwt();
    return jwt ? TIMING_TEXT[tokenTiming(jwt.payload, this.now())] : null;
  });
  protected readonly algorithm = computed(() => {
    const alg = this.jwt()?.header['alg'];
    return typeof alg === 'string' ? alg : null;
  });
  protected readonly keyKind = computed(() => keyKind(this.algorithm()));
  protected readonly verifyError = computed(() => {
    const result = this.verifyResult();
    return result?.status === 'error' ? result.message : null;
  });
  protected readonly warnings = computed(() => {
    const jwt = this.jwt();
    if (!jwt) return [];
    const secret = this.keyKind() === 'secret' ? { text: this.verifyKey(), isBase64: this.secretIsBase64() } : undefined;
    return securityWarnings(jwt.header, secret);
  });
  protected readonly claims = computed(() => {
    const jwt = this.jwt();
    if (!jwt) return [];
    return Object.entries(jwt.payload).map(([name, value]) => ({
      name,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      meaning: CLAIM_INFO[name] ?? '',
    }));
  });

  private copyTimer?: ReturnType<typeof setTimeout>;
  private readonly analytics = inject(Analytics);
  /** Last token and result sent as an event, so typing a key does not send one per keystroke. */
  private lastTracked = '';
  /** Increases with every check, so a slow result for an older key is ignored. */
  private verifyId = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.copyTimer));
    // Keep "expires in 5 minutes" and the badge current while the page is open.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(new Date()), TICK_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    }

    // Check the signature again whenever the token, key or key format changes.
    effect(() => {
      const jwt = this.jwt();
      const alg = this.algorithm();
      const key = this.verifyKey();
      const secretIsBase64 = this.secretIsBase64();
      const id = ++this.verifyId;
      if (!jwt || !alg || !this.keyKind() || !key.trim()) {
        this.verifyResult.set(null);
        return;
      }
      const kid = typeof jwt.header['kid'] === 'string' ? jwt.header['kid'] : undefined;
      void verifySignature({
        alg,
        signingInput: `${jwt.parts.header}.${jwt.parts.payload}`,
        signature: jwt.parts.signature,
        key,
        secretIsBase64,
        kid,
      }).then((result) => {
        if (id !== this.verifyId) return;
        this.verifyResult.set(result);
        const tracked = `${jwt.parts.signature}:${result.status}`;
        if (result.status !== 'error' && tracked !== this.lastTracked) {
          this.lastTracked = tracked;
          this.analytics.track('jwt-verify', { alg, result: result.status });
        }
      });
    });
  }

  protected onInput(value: string): void {
    this.sampleLoaded.set(false);
    this.token.set(value);
    this.now.set(new Date());
  }

  protected async useSample(): Promise<void> {
    this.onInput(await createSampleToken());
    this.sampleLoaded.set(true);
  }

  /** Shows a token made in the Create tab, with its key filled in so it verifies straight away. */
  protected openCreated(created: CreatedToken): void {
    this.onInput(created.token);
    this.secretIsBase64.set(created.secretIsBase64);
    this.verifyKey.set(created.key);
    this.mode.set('decode');
  }

  protected useSampleSecret(): void {
    this.secretIsBase64.set(false);
    this.verifyKey.set(SAMPLE_SECRET);
  }

  protected clear(): void {
    this.sampleLoaded.set(false);
    this.token.set('');
  }

  protected async copyPayload(): Promise<void> {
    const jwt = this.jwt();
    if (!jwt) return;
    this.copied.set(await copyText(jwt.payloadText));
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  /** Local date and time with the time zone, for example "15 Oct 2026, 22:30 GMT+5:30". */
  protected localTime(date: Date): string {
    // dateStyle cannot be combined with timeZoneName, so the parts are listed one by one.
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  }
}
