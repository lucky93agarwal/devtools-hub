import { Component, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { pageReady } from '../../core/accounts/ready';
import { emailError } from '../../core/accounts/validation';
import { Turnstile } from '../../shared/turnstile/turnstile';

/** Log in with email and password. */
@Component({
  selector: 'app-login-page',
  imports: [RouterLink, Turnstile],
  template: `
    <div class="container-tool flex justify-center pt-10 pb-16 sm:pt-16">
      <div class="w-full max-w-md">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Log in</h1>
        <p class="mt-2 text-muted">Welcome back. All tools also work without an account.</p>
        @if (auth.user(); as u) {
          <div class="card mt-6 p-5">
            <p>You are logged in as <strong>{{ u.email }}</strong>.</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <a routerLink="/account" class="btn-primary">My account</a>
              <button type="button" class="btn-secondary" (click)="auth.logout()">Log out</button>
            </div>
          </div>
        } @else {
          <form class="card mt-6 flex flex-col gap-4 p-5" method="post" novalidate (submit)="$event.preventDefault(); submit()">
            <fieldset class="contents" [disabled]="!ready()">
            @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
            <label class="flex flex-col gap-1 text-sm font-semibold">Email
              <input class="field font-normal" type="email" name="email" autocomplete="email" inputmode="email" [value]="email()" (input)="email.set($any($event.target).value)" [attr.aria-invalid]="!!emailProblem()" />
              @if (emailProblem()) { <span class="text-xs font-normal text-danger">{{ emailProblem() }}</span> }
            </label>
            <label class="flex flex-col gap-1 text-sm font-semibold">
              <span class="flex items-center justify-between">Password <a routerLink="/forgot-password" class="font-normal text-brand hover:underline">Forgot password?</a></span>
              <span class="relative flex">
                <input class="field w-full pr-16 font-normal" [type]="show() ? 'text' : 'password'" name="password" aria-label="Password" autocomplete="current-password" [value]="password()" (input)="password.set($any($event.target).value)" />
                <button type="button" class="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">{{ show() ? 'Hide' : 'Show' }}</button>
              </span>
            </label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)" /> Keep me logged in for 30 days</label>
            <app-turnstile (token)="captcha.set($event)" />
            <button type="submit" class="btn-primary" [disabled]="busy() || !ready()">{{ busy() ? 'Logging in…' : 'Log in' }}</button>
            <p class="text-center text-sm text-muted">New here? <a routerLink="/signup" class="font-semibold text-brand hover:underline">Create an account</a></p>
          </fieldset>
          </form>
        }
      </div>
    </div>
  `,
})
export class LoginPage {
  protected readonly ready = pageReady();
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly turnstile = viewChild(Turnstile);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly remember = signal(true);
  protected readonly show = signal(false);
  protected readonly captcha = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly emailProblem = signal('');

  protected async submit(): Promise<void> {
    this.error.set('');
    this.emailProblem.set(emailError(this.email()));
    if (this.emailProblem()) return;
    if (!this.password()) return this.error.set('Enter your password.');
    this.busy.set(true);
    try {
      await this.auth.login(this.email(), this.password(), this.remember(), this.captcha());
      const back = this.route.snapshot.queryParamMap.get('next');
      // Only go back to a page on this site.
      await this.router.navigateByUrl(back && back.startsWith('/') && !back.startsWith('//') ? back : '/account');
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not log in. Please try again.');
      this.turnstile()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}
