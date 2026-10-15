import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TOOLS } from '../../core/tools';
import { copyText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { createSampleToken } from './jwt-sample';
import { CLAIM_INFO, TokenTiming, decodeJwt, timeClaims, tokenTiming } from './jwt-tools';

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
  imports: [Icon],
  templateUrl: './jwt-tool.html',
})
export class JwtTool {
  protected readonly tool = TOOLS.find((t) => t.path === 'jwt')!;
  protected readonly icons = ICONS;

  protected readonly token = signal('');
  protected readonly now = signal(new Date());
  protected readonly copied = signal(false);

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

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.copyTimer));
    // Keep "expires in 5 minutes" and the badge current while the page is open.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(new Date()), TICK_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    }
  }

  protected onInput(value: string): void {
    this.token.set(value);
    this.now.set(new Date());
  }

  protected async useSample(): Promise<void> {
    this.onInput(await createSampleToken());
  }

  protected clear(): void {
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
