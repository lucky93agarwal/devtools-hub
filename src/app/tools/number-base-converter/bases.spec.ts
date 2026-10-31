import { bitLength, fixedWidth, group, parseInBase, toBase } from './bases';

describe('bases', () => {
  it('reads numbers with prefixes, separators and signs', () => {
    expect(parseInBase('0xFF', 16)).toEqual({ ok: true, value: 255n });
    expect(parseInBase('1010_1111', 2)).toEqual({ ok: true, value: 175n });
    expect(parseInBase('-0o17', 8)).toEqual({ ok: true, value: -15n });
    expect(parseInBase('zz', 36)).toEqual({ ok: true, value: 1295n });
    expect(parseInBase('18446744073709551616', 10)).toEqual({ ok: true, value: 2n ** 64n });
  });

  it('names a digit that does not belong to the base', () => {
    expect(parseInBase('102', 2)).toEqual({ ok: false, error: '“2” is not a digit in base 2 (use 0 to 1).' });
    expect(parseInBase('fg', 16)).toEqual({ ok: false, error: '“g” is not a digit in base 16.' });
    expect(parseInBase('0x', 16)).toMatchObject({ ok: false });
  });

  it('writes and groups digits', () => {
    expect(toBase(255n, 2)).toBe('11111111');
    expect(toBase(-255n, 16)).toBe('-ff');
    expect(group('101011', 4)).toBe('10 1011');
    expect(group('1048576', 3, ',')).toBe('1,048,576');
    expect(group('-1048576', 3, ',')).toBe('-1,048,576');
  });

  it('gives the two’s complement pattern of a fixed width', () => {
    expect(fixedWidth(-1n, 8)).toEqual({ bits: 8, pattern: 255n, unsigned: 255n, signed: -1n });
    expect(fixedWidth(200n, 8)).toEqual({ bits: 8, pattern: 200n, unsigned: 200n, signed: -56n });
    expect(fixedWidth(256n, 8).pattern).toBeNull();
    expect(fixedWidth(-129n, 8).pattern).toBeNull();
    expect(bitLength(255n)).toBe(8);
    expect(bitLength(0n)).toBe(0);
  });
});
