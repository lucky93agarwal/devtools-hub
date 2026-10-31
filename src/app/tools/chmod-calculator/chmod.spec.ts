import { describe as explain, parseMode, toOctal, toSymbolic, toSymbolicCommand, toggleBit } from './chmod';

describe('chmod', () => {
  it('reads numbers and symbols', () => {
    expect(parseMode('755')).toEqual({ ok: true, mode: 0o755 });
    expect(parseMode('0644')).toEqual({ ok: true, mode: 0o644 });
    expect(parseMode('4755')).toEqual({ ok: true, mode: 0o4755 });
    expect(parseMode('-rwxr-xr-x')).toEqual({ ok: true, mode: 0o755 });
    expect(parseMode('drwxrwxrwt')).toEqual({ ok: true, mode: 0o1777 });
    expect(parseMode('rwSr--r--')).toEqual({ ok: true, mode: 0o4644 });
    expect(parseMode('789')).toMatchObject({ ok: false });
    expect(parseMode('rwxrwx')).toMatchObject({ ok: false });
  });

  it('writes the number, the symbols and the u=,g=,o= command', () => {
    expect(toOctal(0o644)).toBe('644');
    expect(toOctal(0o4755)).toBe('4755');
    expect(toSymbolic(0o755)).toBe('rwxr-xr-x');
    expect(toSymbolic(0o4755)).toBe('rwsr-xr-x');
    expect(toSymbolic(0o1776)).toBe('rwxrwxrwT');
    expect(toSymbolicCommand(0o750)).toBe('u=rwx,g=rx,o=');
    expect(toSymbolicCommand(0o2775)).toBe('u=rwx,g=rwxs,o=rx');
  });

  it('toggles one permission and explains the result', () => {
    expect(toggleBit(0o644, 0, 2)).toBe(0o744);
    expect(toggleBit(0o644, 2, 0)).toBe(0o640);
    expect(explain(0o640)).toEqual(['The owner can read and write.', 'The group can read.', 'Everyone else has no access.']);
    expect(explain(0o777).at(-1)).toBe('Warning: anyone on the system can change this file.');
  });
});
