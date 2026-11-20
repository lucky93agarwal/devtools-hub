import { ACCOUNTS, turnstileKeyFor } from '../app-config';

describe('CAPTCHA key by address', () => {
  it('uses the real key on devtools24.in, the test key locally and none elsewhere', () => {
    expect(turnstileKeyFor('devtools24.in')).toBe(ACCOUNTS.turnstileSiteKey);
    expect(turnstileKeyFor('www.devtools24.in')).toBe(ACCOUNTS.turnstileSiteKey);
    expect(turnstileKeyFor('localhost')).toBe('1x00000000000000000000AA');
    expect(turnstileKeyFor('devtools-hub.agarwal-lucky93.workers.dev')).toBe('');
    expect(turnstileKeyFor('notdevtools24.in')).toBe('');
  });
});
