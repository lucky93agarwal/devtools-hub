import { crackTime, entropyBits, generatePassword, generateSecret, pools, strength } from './password';

const ALL = { length: 20, lower: true, upper: true, digits: true, symbols: true, noSimilar: false };

describe('password', () => {
  it('has the asked length and every chosen kind of character', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(ALL);
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('leaves out confusable characters and refuses an empty choice', () => {
    const opts = { ...ALL, symbols: false, noSimilar: true, length: 200 };
    expect(generatePassword(opts)).not.toMatch(/[Il1O0o]/);
    expect(() => generatePassword({ ...ALL, lower: false, upper: false, digits: false, symbols: false })).toThrow();
    expect(pools({ ...ALL, upper: false, symbols: false }).join('')).toBe('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('makes secrets of the right size', () => {
    expect(generateSecret(32, 'hex')).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSecret(32, 'base64url')).toMatch(/^[\w-]{43}$/);
    expect(generateSecret(32, 'base64')).toMatch(/^[\w+/]{43}=$/);
  });

  it('rates strength from entropy', () => {
    expect(entropyBits(16, 94)).toBe(105);
    expect(strength(40).label).toBe('Weak');
    expect(strength(105).label).toBe('Very strong');
    expect(crackTime(30)).toBe('less than a minute');
    expect(crackTime(105)).toContain('billion years');
  });
});
