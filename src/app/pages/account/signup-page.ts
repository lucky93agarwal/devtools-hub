import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { pageReady } from '../../core/accounts/ready';
import { SignupInput, passwordStrength, signupErrors } from '../../core/accounts/validation';
import { Turnstile } from '../../shared/turnstile/turnstile';

export const COUNTRY_CODES: readonly { code: string; label: string }[] = [
  { code: '+91', label: 'India +91' },
  { code: '+1', label: 'USA / Canada +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+971', label: 'UAE +971' },
  { code: '+966', label: 'Saudi Arabia +966' },
  { code: '+974', label: 'Qatar +974' },
  { code: '+965', label: 'Kuwait +965' },
  { code: '+968', label: 'Oman +968' },
  { code: '+65', label: 'Singapore +65' },
  { code: '+60', label: 'Malaysia +60' },
  { code: '+61', label: 'Australia +61' },
  { code: '+64', label: 'New Zealand +64' },
  { code: '+49', label: 'Germany +49' },
  { code: '+33', label: 'France +33' },
  { code: '+31', label: 'Netherlands +31' },
  { code: '+81', label: 'Japan +81' },
  { code: '+977', label: 'Nepal +977' },
  { code: '+880', label: 'Bangladesh +880' },
  { code: '+94', label: 'Sri Lanka +94' },
];

const STRENGTH = ['', 'Weak', 'Okay', 'Good', 'Strong'];

/** Create an account: first and last name, email, mobile number and password. */
@Component({
  selector: 'app-signup-page',
  imports: [RouterLink, Turnstile],
  template: `
    <div class="container-tool flex justify-center pt-10 pb-16 sm:pt-16">
      <div class="w-full max-w-lg">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Create your account</h1>
        <p class="mt-2 text-muted">Free. All tools also work without an account.</p>
        <form class="card mt-6 flex flex-col gap-4 p-5" method="post" novalidate (submit)="$event.preventDefault(); submit()">
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-sm font-semibold">First name
              <input class="field font-normal" name="firstName" autocomplete="given-name" [value]="form().firstName" (input)="set('firstName', $any($event.target).value)" (blur)="touch('firstName')" [attr.aria-invalid]="!!shown('firstName')" />
              @if (shown('firstName')) { <span class="text-xs font-normal text-danger">{{ shown('firstName') }}</span> }
            </label>
            <label class="flex flex-col gap-1 text-sm font-semibold">Last name
              <input class="field font-normal" name="lastName" autocomplete="family-name" [value]="form().lastName" (input)="set('lastName', $any($event.target).value)" (blur)="touch('lastName')" [attr.aria-invalid]="!!shown('lastName')" />
              @if (shown('lastName')) { <span class="text-xs font-normal text-danger">{{ shown('lastName') }}</span> }
            </label>
          </div>
          <label class="flex flex-col gap-1 text-sm font-semibold">Email
            <input class="field font-normal" type="email" name="email" autocomplete="email" inputmode="email" [value]="form().email" (input)="set('email', $any($event.target).value)" (blur)="touch('email')" [attr.aria-invalid]="!!shown('email')" />
            @if (shown('email')) { <span class="text-xs font-normal text-danger">{{ shown('email') }}</span> }
          </label>
          <div class="flex flex-col gap-1 text-sm font-semibold">
            <span id="mobile-label">Mobile number</span>
            <div class="flex gap-2">
              <select class="field w-36 font-normal" aria-label="Country code" [value]="form().countryCode" (change)="set('countryCode', $any($event.target).value)">
                @for (c of countryCodes; track c.code) { <option [value]="c.code" [selected]="c.code === form().countryCode">{{ c.label }}</option> }
              </select>
              <input class="field min-w-0 flex-1 font-normal" type="tel" name="mobile" autocomplete="tel-national" inputmode="numeric" aria-labelledby="mobile-label" [value]="form().mobile" (input)="set('mobile', $any($event.target).value)" (blur)="touch('mobile')" [attr.aria-invalid]="!!shown('mobile')" />
            </div>
            @if (shown('mobile')) { <span class="text-xs font-normal text-danger">{{ shown('mobile') }}</span> }
          </div>
          <label class="flex flex-col gap-1 text-sm font-semibold">Password
            <span class="relative flex">
              <input class="field w-full pr-16 font-normal" [type]="show() ? 'text' : 'password'" name="password" aria-label="Password" autocomplete="new-password" [value]="form().password" (input)="set('password', $any($event.target).value)" (blur)="touch('password')" [attr.aria-invalid]="!!shown('password')" />
              <button type="button" class="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">{{ show() ? 'Hide' : 'Show' }}</button>
            </span>
            @if (form().password) {
              <span class="flex items-center gap-2 text-xs font-normal text-muted" aria-live="polite">
                <span class="flex h-1.5 flex-1 gap-1">
                  @for (i of [1, 2, 3, 4]; track i) { <span class="flex-1 rounded-full" [class]="i <= strength() ? strengthColour() : 'bg-line'"></span> }
                </span>
                Strength: {{ strengthLabel() }}
              </span>
            }
            <span class="text-xs font-normal" [class.text-danger]="!!shown('password')" [class.text-muted]="!shown('password')">{{ shown('password') || 'At least 8 characters, with letters and numbers.' }}</span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1" [checked]="form().acceptTerms" (change)="set('acceptTerms', $any($event.target).checked); touch('acceptTerms')" />
            <span>I agree to the <a routerLink="/terms" class="text-brand hover:underline">Terms of use</a> and the <a routerLink="/privacy" class="text-brand hover:underline">Privacy policy</a>.</span>
          </label>
          @if (shown('acceptTerms')) { <span class="-mt-3 text-xs text-danger">{{ shown('acceptTerms') }}</span> }
          <app-turnstile (token)="captcha.set($event)" />
          <button type="submit" class="btn-primary" [disabled]="busy() || !ready()">{{ busy() ? 'Creating your account…' : 'Create account' }}</button>
          <p class="text-center text-sm text-muted">Already have an account? <a routerLink="/login" class="font-semibold text-brand hover:underline">Log in</a></p>
        </form>
      </div>
    </div>
  `,
})
export class SignupPage {
  protected readonly ready = pageReady();
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly turnstile = viewChild(Turnstile);
  protected readonly countryCodes = COUNTRY_CODES;
  protected readonly form = signal<SignupInput>({ firstName: '', lastName: '', email: '', countryCode: '+91', mobile: '', password: '', acceptTerms: false });
  private readonly touched = signal<Set<keyof SignupInput>>(new Set());
  /** Messages from the server for one field (for example "email already used"). */
  private readonly serverFields = signal<Record<string, string>>({});
  protected readonly errors = computed(() => signupErrors(this.form()));
  protected readonly strength = computed(() => passwordStrength(this.form().password));
  protected readonly strengthLabel = computed(() => STRENGTH[this.strength()]);
  protected readonly strengthColour = computed(() => ['bg-line', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'][this.strength()]);
  protected readonly show = signal(false);
  protected readonly captcha = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected set<K extends keyof SignupInput>(key: K, value: SignupInput[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.serverFields.update((s) => ({ ...s, [key]: '' }));
  }

  protected touch(key: keyof SignupInput): void {
    this.touched.update((t) => new Set(t).add(key));
  }

  /** A field's message once it has been left (or the form was sent). */
  protected shown(key: keyof SignupInput): string {
    return this.serverFields()[key] || (this.touched().has(key) ? (this.errors()[key] ?? '') : '');
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    this.touched.set(new Set(Object.keys(this.form()) as (keyof SignupInput)[]));
    if (Object.keys(this.errors()).length) {
      this.error.set('Please check the highlighted fields.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.signup({ ...this.form(), captcha: this.captcha() });
      await this.router.navigateByUrl('/account?welcome=1');
    } catch (e) {
      if (e instanceof AccountError) {
        this.error.set(e.message);
        this.serverFields.set(e.fields);
      } else this.error.set('Could not create the account. Please try again.');
      this.turnstile()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}
