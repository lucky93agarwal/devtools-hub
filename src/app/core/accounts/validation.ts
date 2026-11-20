/**
 * Rules for account forms, shared by the website (instant messages) and the server
 * (which never trusts the browser). Each function returns an error message, or '' when fine.
 */

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  /** Country calling code with +, for example "+91". */
  countryCode: string;
  mobile: string;
  password: string;
  acceptTerms: boolean;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function nameError(value: string, label: string): string {
  const v = value.trim();
  if (!v) return `Enter your ${label}.`;
  if (v.length > 50) return `${capital(label)} is too long (50 letters at most).`;
  // Letters of any language, spaces, dots, apostrophes and hyphens.
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(v)) return `${capital(label)} can only have letters, spaces, dots, apostrophes and hyphens.`;
  return '';
}

export function emailError(value: string): string {
  const v = cleanEmail(value);
  if (!v) return 'Enter your email address.';
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address, like name@example.com.';
  return '';
}

/** Digits only, without spaces, dashes, brackets or a leading 0. */
export function cleanMobile(value: string): string {
  return value.replace(/[\s()-]/g, '').replace(/^0+/, '');
}

export function countryCodeError(value: string): string {
  return /^\+\d{1,4}$/.test(value.trim()) ? '' : 'Choose a country code, like +91.';
}

export function mobileError(value: string, countryCode: string): string {
  const v = cleanMobile(value);
  if (!v) return 'Enter your mobile number.';
  if (!/^\d+$/.test(v)) return 'A mobile number has digits only.';
  if (countryCode.trim() === '+91') return /^[6-9]\d{9}$/.test(v) ? '' : 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
  return v.length >= 6 && v.length <= 14 ? '' : 'Enter a valid mobile number.';
}

/** The number in one standard form: +<country code><number>. */
export function fullMobile(countryCode: string, mobile: string): string {
  return `${countryCode.trim()}${cleanMobile(mobile)}`;
}

export function passwordError(value: string): string {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use letters and numbers together.';
  if (/^(password|12345678|qwerty)/i.test(value)) return 'This password is too easy to guess.';
  return '';
}

/** 0–4: how strong a password looks, for the meter under the field. */
export function passwordStrength(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= PASSWORD_MIN) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return passwordError(value) ? Math.min(score, 1) : Math.max(score, 2);
}

/** Every problem with a sign-up form, by field. Empty when the form is fine. */
export function signupErrors(input: SignupInput): Partial<Record<keyof SignupInput, string>> {
  const errors: Partial<Record<keyof SignupInput, string>> = {
    firstName: nameError(input.firstName, 'first name'),
    lastName: nameError(input.lastName, 'last name'),
    email: emailError(input.email),
    countryCode: countryCodeError(input.countryCode),
    mobile: mobileError(input.mobile, input.countryCode),
    password: passwordError(input.password),
    acceptTerms: input.acceptTerms ? '' : 'Please accept the Terms and Privacy Policy.',
  };
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as Partial<Record<keyof SignupInput, string>>;
}
