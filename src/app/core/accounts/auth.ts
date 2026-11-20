import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ACCOUNTS } from '../app-config';
import type { SignupInput } from './validation';

export interface AccountUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  createdAt: number;
}

/** An error from the accounts API, with a message for people and, for forms, one per field. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * The signed-in user and every accounts call. The session is an HttpOnly cookie that
 * scripts cannot read; the browser sends it with each /api request.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly user = signal<AccountUser | null>(null);
  /** False until the first check with the server is done. */
  readonly checked = signal(false);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    // Without accounts switched on, nobody is logged in and the server is not asked.
    if (this.browser && ACCOUNTS.enabled) void this.refresh();
    else this.checked.set(true);
  }

  async refresh(): Promise<AccountUser | null> {
    // Offline (the site works as an installed app): there is no server to ask.
    if (!navigator.onLine) {
      this.checked.set(true);
      return this.user();
    }
    try {
      const { user } = await this.call<{ user: AccountUser | null }>('GET', '/api/auth/me');
      this.user.set(user);
    } catch {
      // No accounts API (for example a static preview): treat as signed out.
      this.user.set(null);
    }
    this.checked.set(true);
    return this.user();
  }

  async signup(input: SignupInput & { captcha: string }): Promise<AccountUser> {
    const { user } = await this.call<{ user: AccountUser }>('POST', '/api/auth/signup', input);
    this.user.set(user);
    return user;
  }

  async login(email: string, password: string, remember: boolean, captcha: string): Promise<AccountUser> {
    const { user } = await this.call<{ user: AccountUser }>('POST', '/api/auth/login', { email, password, remember, captcha });
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await this.call('POST', '/api/auth/logout', {}).catch(() => undefined);
    this.user.set(null);
  }

  forgotPassword(email: string, captcha: string): Promise<unknown> {
    return this.call('POST', '/api/auth/forgot-password', { email, captcha });
  }

  resetPassword(token: string, password: string): Promise<unknown> {
    return this.call('POST', '/api/auth/reset-password', { token, password });
  }

  async verifyEmail(token: string): Promise<void> {
    await this.call('POST', '/api/auth/verify-email', { token });
    if (this.user()) await this.refresh();
  }

  resendVerification(): Promise<unknown> {
    return this.call('POST', '/api/auth/resend-verification', {});
  }

  changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
    return this.call('POST', '/api/auth/change-password', { currentPassword, newPassword });
  }

  /** A JSON call to the accounts API; errors become AccountError with a readable message. */
  async call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new AccountError('Could not reach the server. Check your internet connection and try again.', 0);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
    if (!response.ok) {
      throw new AccountError(data.error ?? (response.status === 404 ? 'The accounts service is not available here.' : 'Something went wrong. Please try again.'), response.status, data.fields ?? {});
    }
    return data as T;
  }
}
