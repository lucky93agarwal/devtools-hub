import { base32Decode, base32Encode, buildOtpAuth, hotp, newSecret, parseOtpAuth, totp } from './totp';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('totp', () => {
  it('matches the RFC 4226 HOTP test values', async () => {
    const secret = ascii('12345678901234567890');
    const expected = ['755224', '287082', '359152', '969429', '338314'];
    for (let i = 0; i < expected.length; i++) expect(await hotp(secret, i, 'SHA-1', 6)).toBe(expected[i]);
  });

  it('matches the RFC 6238 TOTP test values for SHA-1, SHA-256 and SHA-512', async () => {
    expect(await totp(ascii('12345678901234567890'), 59, { algorithm: 'SHA-1', digits: 8, period: 30 })).toBe('94287082');
    expect(await totp(ascii('12345678901234567890123456789012'), 59, { algorithm: 'SHA-256', digits: 8, period: 30 })).toBe('46119246');
    expect(await totp(ascii('1234567890123456789012345678901234567890123456789012345678901234'), 1111111109, { algorithm: 'SHA-512', digits: 8, period: 30 })).toBe('25091201');
  });

  it('encodes and decodes Base32 secrets', () => {
    expect(base32Encode(ascii('12345678901234567890'))).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(Array.from(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')!)).toEqual(Array.from(ascii('12345678901234567890')));
    expect(base32Decode('not base32!')).toBeNull();
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('reads and builds otpauth links', () => {
    const link = 'otpauth://totp/ACME%20Co:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8';
    expect(parseOtpAuth(link)).toEqual({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'ACME Co', account: 'ada@example.com', algorithm: 'SHA-256', digits: 8, period: 30 });
    expect(buildOtpAuth({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Shop', account: 'ada', algorithm: 'SHA-1', digits: 6, period: 30 })).toBe(
      'otpauth://totp/Shop%3Aada?secret=JBSWY3DPEHPK3PXP&issuer=Shop',
    );
    expect(parseOtpAuth('https://x.dev')).toBeNull();
  });
});
