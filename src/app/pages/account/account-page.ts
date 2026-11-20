import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { pageReady } from '../../core/accounts/ready';
import { passwordError } from '../../core/accounts/validation';

/** The signed-in user's account: details, email confirmation, password and log out. */
@Component({
  selector: 'app-account-page',
  imports: [RouterLink],
  template: `
    <div class="container-tool pt-10 pb-16 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">My account</h1>
      @if (!auth.checked()) {
        <p class="mt-6 text-muted">Loading…</p>
      } @else if (auth.user(); as u) {
        @if (welcome()) {
          <p class="mt-4 rounded-xl border border-success bg-success/10 px-4 py-3 text-sm" role="status">Welcome, {{ u.firstName }}! Your account is ready. We sent a link to {{ u.email }} to confirm your email.</p>
        }
        <section class="card mt-6 p-5" aria-labelledby="details">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="details" class="text-xl leading-7">Your details</h2>
            @if (u.role === 'admin') { <a routerLink="/admin" class="btn-small">Open admin panel</a> }
          </div>
          <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt class="text-muted">Name</dt><dd class="font-semibold">{{ u.firstName }} {{ u.lastName }}</dd>
            <dt class="text-muted">Email</dt>
            <dd class="flex flex-wrap items-center gap-2"><span class="font-semibold">{{ u.email }}</span>
              @if (u.emailVerified) { <span class="chip !border-success !py-0.5 !text-success">✓ Confirmed</span> }
              @else {
                <span class="chip !border-warning !py-0.5 !text-warning">Not confirmed</span>
                <button type="button" class="btn-small" [disabled]="resending()" (click)="resend()">{{ resent() ? 'Sent again ✓' : 'Send the link again' }}</button>
              }
            </dd>
            <dt class="text-muted">Mobile</dt><dd class="font-semibold">{{ u.mobile }}</dd>
            <dt class="text-muted">Account type</dt><dd class="font-semibold">{{ u.role === 'admin' ? 'Admin' : 'Free' }}</dd>
            <dt class="text-muted">Member since</dt><dd class="font-semibold">{{ date(u.createdAt) }}</dd>
          </dl>
          @if (note()) { <p class="mt-3 text-sm text-danger" role="alert">{{ note() }}</p> }
        </section>

        <section class="card mt-6 p-5" aria-labelledby="password-heading">
          <h2 id="password-heading" class="text-xl leading-7">Change password</h2>
          <form class="mt-4 flex max-w-md flex-col gap-3" method="post" novalidate (submit)="$event.preventDefault(); changePassword()">
            @if (pwMessage()) { <p class="rounded-xl border px-4 py-3 text-sm" [class]="pwOk() ? 'border-success bg-success/10' : 'border-danger bg-danger/10'" role="status">{{ pwMessage() }}</p> }
            <label class="flex flex-col gap-1 text-sm font-semibold">Current password
              <input class="field font-normal" type="password" aria-label="Current password" autocomplete="current-password" [value]="current()" (input)="current.set($any($event.target).value)" />
            </label>
            <label class="flex flex-col gap-1 text-sm font-semibold">New password
              <input class="field font-normal" type="password" aria-label="New password" autocomplete="new-password" [value]="next()" (input)="next.set($any($event.target).value)" />
              <span class="text-xs font-normal text-muted">At least 8 characters, with letters and numbers. Other devices will be logged out.</span>
            </label>
            <button type="submit" class="btn-secondary self-start" [disabled]="pwBusy() || !ready()">{{ pwBusy() ? 'Saving…' : 'Change password' }}</button>
          </form>
        </section>

        <button type="button" class="btn-secondary mt-6" (click)="logout()">Log out</button>
      } @else {
        <div class="card mt-6 max-w-md p-5">
          <p>Please log in to see your account.</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <a routerLink="/login" [queryParams]="{ next: '/account' }" class="btn-primary">Log in</a>
            <a routerLink="/signup" class="btn-secondary">Create an account</a>
          </div>
        </div>
      }
    </div>
  `,
})
export class AccountPage {
  protected readonly ready = pageReady();
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly welcome = signal(inject(ActivatedRoute).snapshot.queryParamMap.has('welcome'));
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);
  protected readonly note = signal('');
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly pwBusy = signal(false);
  protected readonly pwMessage = signal('');
  protected readonly pwOk = signal(false);

  protected date(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected async resend(): Promise<void> {
    this.resending.set(true);
    this.note.set('');
    try {
      await this.auth.resendVerification();
      this.resent.set(true);
    } catch (e) {
      this.note.set(e instanceof AccountError ? e.message : 'Could not send the email.');
    } finally {
      this.resending.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    this.pwOk.set(false);
    const problem = this.current() ? passwordError(this.next()) : 'Enter your current password.';
    this.pwMessage.set(problem);
    if (problem) return;
    this.pwBusy.set(true);
    try {
      await this.auth.changePassword(this.current(), this.next());
      this.pwOk.set(true);
      this.pwMessage.set('Your password was changed. Other devices were logged out.');
      this.current.set('');
      this.next.set('');
    } catch (e) {
      this.pwMessage.set(e instanceof AccountError ? e.message : 'Could not change the password.');
    } finally {
      this.pwBusy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
