import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, signal } from '@angular/core';
import { ACCOUNTS } from '../../core/app-config';
import { SOCIAL_PROVIDERS, type SocialProvider, methodLabel } from '../../core/accounts/login-methods';
import { visitorId } from '../../core/accounts/visits';

/** Messages for /login?social=… after Google / Facebook / Apple / GitHub sends the visitor back. */
export const SOCIAL_ERRORS: Record<string, string> = {
  cancelled: 'Login was cancelled. You can try again or use your email and password.',
  expired: 'That login took too long or was opened in another tab. Please try again.',
  failed: 'The login could not be completed. Please try again.',
  'no-email': 'That account does not share an email address with us, so we cannot create an account with it. Please try another option or your email.',
  unverified: 'That email is not confirmed there yet. Please confirm it first, or sign up with your email.',
  blocked: 'This account is blocked. Please contact support.',
  'not-configured': 'This login option is not available yet.',
};

/**
 * "Continue with Google / Facebook / Apple / GitHub". Each is a plain link to the server, which
 * sends the browser on to that site. A button shows only when the server has its keys.
 */
@Component({
  selector: 'app-social-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown().length) {
      <div class="flex flex-col gap-2">
        @for (p of shown(); track p) {
          <a class="btn-secondary flex items-center justify-center gap-3" [href]="link(p)">
            @switch (p) {
              @case ('google') {
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
              }
              @case ('facebook') {
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1877F2" /><path fill="#fff" d="M15.1 15.5l.5-3.3h-3.2V10c0-.9.4-1.8 1.9-1.8h1.4V5.4s-1.3-.2-2.6-.2c-2.6 0-4.3 1.6-4.3 4.5v2.5H6v3.3h2.8V24h3.6v-8.5z" /></svg>
              }
              @case ('apple') {
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.37 12.73c-.03-2.6 2.13-3.86 2.22-3.92-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.95-3.94.95-.82 0-2.07-.93-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.47 7.81 1.3 10.37.87 1.25 1.9 2.65 3.25 2.6 1.31-.05 1.8-.84 3.38-.84 1.57 0 2.02.84 3.4.82 1.4-.03 2.29-1.27 3.15-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.16zM13.78 5.1c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.29.69-3.03 1.56-.66.77-1.25 2-1.09 3.18 1.15.09 2.33-.58 3.05-1.45z" />
                </svg>
              }
              @case ('github') {
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                </svg>
              }
            }
            {{ verb() }} with {{ name(p) }}
          </a>
        }
        <p class="my-1 flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-line"></span>or with your email<span class="h-px flex-1 bg-line"></span></p>
      </div>
    }
  `,
})
export class SocialLogin {
  /** Where to go after logging in. */
  readonly next = input('/account');
  readonly remember = input(true);
  readonly verb = input('Continue');
  private readonly enabled = signal<Partial<Record<SocialProvider, boolean>>>({});
  protected readonly shown = computed(() => SOCIAL_PROVIDERS.filter((p) => this.enabled()[p]));
  protected readonly name = methodLabel;

  constructor() {
    afterNextRender(async () => {
      if (!ACCOUNTS.enabled || !navigator.onLine) return;
      try {
        const response = await fetch('/api/auth/providers', { credentials: 'same-origin' });
        if (response.ok) this.enabled.set((await response.json()) as Partial<Record<SocialProvider, boolean>>);
      } catch {
        // No accounts API here: no buttons.
      }
    });
  }

  protected link(provider: SocialProvider): string {
    const params = new URLSearchParams({ next: this.next(), remember: this.remember() ? '1' : '0', visitor: visitorId() });
    return `/api/auth/oauth/${provider}/start?${params}`;
  }
}
