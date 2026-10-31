import { gistId } from './dartpad';

describe('gistId', () => {
  it('reads an id from a bare id, a gist link and a DartPad link', () => {
    expect(gistId('5c0e154dd50af4a9ac856908061291bc')).toBe('5c0e154dd50af4a9ac856908061291bc');
    expect(gistId('https://gist.github.com/someone/5C0E154DD50AF4A9AC856908061291BC')).toBe('5c0e154dd50af4a9ac856908061291bc');
    expect(gistId('https://dartpad.dev/?id=5c0e154dd50af4a9ac856908061291bc&theme=dark')).toBe('5c0e154dd50af4a9ac856908061291bc');
  });

  it('rejects text that is not an id', () => {
    expect(gistId('hello')).toBeNull();
    expect(gistId('javascript:alert(1)')).toBeNull();
  });
});
