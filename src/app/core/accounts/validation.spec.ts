import { cleanMobile, emailError, fullMobile, mobileError, nameError, passwordError, passwordStrength, signupErrors } from './validation';

describe('account form rules', () => {
  it('checks names, emails and passwords', () => {
    expect(nameError('Rahul', 'first name')).toBe('');
    expect(nameError("D'Souza-Rao", 'last name')).toBe('');
    expect(nameError('राहुल', 'first name')).toBe('');
    expect(nameError('', 'first name')).toBe('Enter your first name.');
    expect(nameError('R2D2', 'first name')).toContain('only have letters');
    expect(emailError(' Name@Example.com ')).toBe('');
    expect(emailError('name@example')).toContain('valid email');
    expect(passwordError('short1')).toContain('at least 8');
    expect(passwordError('onlyletters')).toContain('letters and numbers');
    expect(passwordError('Password123')).toContain('too easy');
    expect(passwordError('Ganga-river-42')).toBe('');
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBeLessThanOrEqual(1);
    expect(passwordStrength('Ganga-river-42')).toBe(4);
  });

  it('checks Indian and other mobile numbers', () => {
    expect(mobileError('98765 43210', '+91')).toBe('');
    expect(mobileError('09876543210', '+91')).toBe('');
    expect(mobileError('5876543210', '+91')).toContain('starting with 6, 7, 8 or 9');
    expect(mobileError('98765', '+91')).toContain('10-digit');
    expect(mobileError('2025550143', '+1')).toBe('');
    expect(mobileError('12ab', '+44')).toContain('digits only');
    expect(cleanMobile('(987) 654-3210')).toBe('9876543210');
    expect(fullMobile('+91', '098765 43210')).toBe('+919876543210');
  });

  it('lists every problem of a sign-up form', () => {
    expect(signupErrors({ firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', countryCode: '+91', mobile: '9876543210', password: 'Ganga-river-42', acceptTerms: true })).toEqual({});
    const errors = signupErrors({ firstName: '', lastName: 'Rao', email: 'x', countryCode: '91', mobile: '1', password: 'a', acceptTerms: false });
    expect(Object.keys(errors).sort()).toEqual(['acceptTerms', 'countryCode', 'email', 'firstName', 'mobile', 'password']);
  });
});
