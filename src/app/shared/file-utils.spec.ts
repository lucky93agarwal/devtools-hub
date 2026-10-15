import { baseName, formatBytes } from './file-utils';

describe('file utils', () => {
  it('removes only the last extension', () => {
    expect(baseName('data.json')).toBe('data');
    expect(baseName('data.backup.json')).toBe('data.backup');
    expect(baseName('README')).toBe('README');
    expect(baseName('.env')).toBe('.env');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
