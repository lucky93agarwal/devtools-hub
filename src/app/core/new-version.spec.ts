import { isMissingFileError, loadNewVersion } from './new-version';

describe('isMissingFileError', () => {
  it('recognises each browser wording for a removed lazy file', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://example.com/chunk-AB12.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://example.com/chunk-AB12.js',
    ]) {
      expect(isMissingFileError(new TypeError(message))).toBe(true);
    }
  });

  it('looks inside promise rejections and wrapped errors', () => {
    const missing = new TypeError('Failed to fetch dynamically imported module: /chunk-X.js');
    expect(isMissingFileError({ rejection: missing })).toBe(true);
    expect(isMissingFileError(new Error('Navigation failed', { cause: missing }))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isMissingFileError(new Error('Unexpected token'))).toBe(false);
    expect(isMissingFileError(undefined)).toBe(false);
  });
});

describe('loadNewVersion', () => {
  beforeEach(() => sessionStorage.clear());

  it('loads the page fresh once, then stops to avoid a reload loop', () => {
    const go = vi.fn();
    expect(loadNewVersion('/jwt', go)).toBe(true);
    expect(go).toHaveBeenCalledWith('/jwt');
    expect(loadNewVersion('/jwt', go)).toBe(false);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the guard has passed', () => {
    const go = vi.fn();
    loadNewVersion('/jwt', go);
    sessionStorage.setItem('dth-new-version-reload', String(Date.now() - 60_000));
    expect(loadNewVersion('/json-compare', go)).toBe(true);
    expect(go).toHaveBeenLastCalledWith('/json-compare');
  });
});
