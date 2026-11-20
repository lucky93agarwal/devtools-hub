import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { pageReady } from '../../core/accounts/ready';
import { emailError, passwordError, passwordStrength } from '../../core/accounts/validation';
import { Turnstile } from '../../shared/turnstile/turnstile';

/** Forgot password: sends a reset link by email. */
@Component({
  selector: 'app-forgot-page',
  imports: [RouterLink, Turnstile],
  template: `
    <div class="container-tool flex justify-center pt-10 pb-16 sm:pt-16">
      <div class="w-full max-w-md">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Forgot your password?</h1>
        <p class="mt-2 text-muted">Enter your account's email and we will send you a link to choose a new password.</p>
        @if (sent()) {
          <div class="card mt-6 p-5" role="status">
            <p class="font-semibold">Check your email</p>
            <p class="mt-2 text-sm text-muted">If an account exists for <strong class="text-ink">{{ email() }}</strong>, we sent a reset link to it. The link works for 30 minutes. Also look in the spam folder.</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <a routerLink="/login" class="btn-secondary">Back to log in</a>
              <button type="button" class="btn-small" (click)="sent.set(false)">Use another email</button>
            </div>
          </div>
        } @else {
          <form class="card mt-6 flex flex-col gap-4 p-5" method="post" novalidate (submit)="$event.preventDefault(); submit()">
            @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
            <label class="flex flex-col gap-1 text-sm font-semibold">Email
              <input class="field font-normal" type="email" name="email" autocomplete="email" inputmode="email" [value]="email()" (input)="email.set($any($event.target).value)" />
            </label>
            <app-turnstile (token)="captcha.set($event)" />
            <button type="submit" class="btn-primary" [disabled]="busy() || !ready()">{{ busy() ? 'Sending…' : 'Send reset link' }}</button>
            <p class="text-center text-sm text-muted"><a routerLink="/login" class="font-semibold text-brand hover:underline">Back to log in</a></p>
          </form>
        }
      </div>
    </div>
  `,
})
export class ForgotPage {
  protected readonly ready = pageReady();
  private readonly auth = inject(Auth);
  private readonly turnstile = viewChild(Turnstile);
  protected readonly email = signal('');
  protected readonly captcha = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.error.set(emailError(this.email()));
    if (this.error()) return;
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.email(), this.captcha());
      this.sent.set(true);
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not send the link. Please try again.');
      this.turnstile()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}

/** Reset password: opened from the email link (?token=…). */
@Component({
  selector: 'app-reset-page',
  imports: [RouterLink],
  template: `
    <div class="container-tool flex justify-center pt-10 pb-16 sm:pt-16">
      <div class="w-full max-w-md">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Choose a new password</h1>
        @if (done()) {
          <div class="card mt-6 p-5" role="status">
            <p class="font-semibold">Your password was changed.</p>
            <p class="mt-2 text-sm text-muted">For your safety you were logged out on every device. Log in with your new password.</p>
            <a routerLink="/login" class="btn-primary mt-4">Log in</a>
          </div>
        } @else if (!token()) {
          <div class="card mt-6 p-5" role="alert">
            <p>This page needs the link from the reset email.</p>
            <a routerLink="/forgot-password" class="btn-secondary mt-4">Send a new link</a>
          </div>
        } @else {
          <form class="card mt-6 flex flex-col gap-4 p-5" method="post" novalidate (submit)="$event.preventDefault(); submit()">
            @if (error()) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}
                @if (expired()) { <a routerLink="/forgot-password" class="ml-1 font-semibold text-brand hover:underline">Send a new link</a> }
              </p>
            }
            <label class="flex flex-col gap-1 text-sm font-semibold">New password
              <input class="field font-normal" [type]="show() ? 'text' : 'password'" name="password" aria-label="New password" autocomplete="new-password" [value]="password()" (input)="password.set($any($event.target).value)" />
              <span class="text-xs font-normal text-muted">At least 8 characters, with letters and numbers. Strength: {{ ['—', 'Weak', 'Okay', 'Good', 'Strong'][strength()] }}</span>
            </label>
            <label class="flex flex-col gap-1 text-sm font-semibold">Repeat the new password
              <input class="field font-normal" [type]="show() ? 'text' : 'password'" name="repeat" aria-label="Repeat the new password" autocomplete="new-password" [value]="repeat()" (input)="repeat.set($any($event.target).value)" />
            </label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="show()" (change)="show.set($any($event.target).checked)" /> Show passwords</label>
            <button type="submit" class="btn-primary" [disabled]="busy() || !ready()">{{ busy() ? 'Saving…' : 'Save new password' }}</button>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPage {
  protected readonly ready = pageReady();
  private readonly auth = inject(Auth);
  protected readonly token = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '');
  protected readonly password = signal('');
  protected readonly repeat = signal('');
  protected readonly show = signal(false);
  protected readonly strength = computed(() => passwordStrength(this.password()));
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');
  protected readonly expired = signal(false);

  protected async submit(): Promise<void> {
    this.expired.set(false);
    const problem = passwordError(this.password()) || (this.password() !== this.repeat() ? 'The two passwords are not the same.' : '');
    this.error.set(problem);
    if (problem) return;
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.token(), this.password());
      await this.auth.refresh();
      this.done.set(true);
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not save the password. Please try again.');
      this.expired.set(e instanceof AccountError && /link/.test(e.message));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Email confirmation: opened from the email link (?token=…). */
@Component({
  selector: 'app-verify-page',
  imports: [RouterLink],
  template: `
    <div class="container-tool flex justify-center pt-10 pb-16 sm:pt-16">
      <div class="w-full max-w-md">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Confirm your email</h1>
        <div class="card mt-6 p-5" role="status">
          @switch (state()) {
            @case ('working') { <p>Confirming…</p> }
            @case ('done') {
              <p class="font-semibold">Your email is confirmed. Thank you!</p>
              <a [routerLink]="auth.user() ? '/account' : '/login'" class="btn-primary mt-4">{{ auth.user() ? 'Go to my account' : 'Log in' }}</a>
            }
            @default {
              <p>{{ error() }}</p>
              <a routerLink="/account" class="btn-secondary mt-4">Send a new link from my account</a>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class VerifyPage {
  protected readonly auth = inject(Auth);
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly error = signal('');

  constructor() {
    const token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
    if (typeof window === 'undefined') return;
    this.auth
      .verifyEmail(token)
      .then(() => this.state.set('done'))
      .catch((e) => {
        this.error.set(e instanceof AccountError ? e.message : 'This link did not work.');
        this.state.set('failed');
      });
  }
}
