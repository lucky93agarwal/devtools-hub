import { HEADERS, MIME_TYPES, STATUS_CODES, searchEntries } from './http-data';

describe('http-data', () => {
  it('has unique entries in order', () => {
    const codes = STATUS_CODES.map((s) => Number(s.key));
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(HEADERS.map((h) => h.key.toLowerCase())).size).toBe(HEADERS.length);
    expect(MIME_TYPES.length).toBeGreaterThan(40);
  });

  it('finds entries by code, name and topic', () => {
    expect(searchEntries(STATUS_CODES, '422')[0].title).toBe('Unprocessable Content');
    expect(searchEntries(STATUS_CODES, 'rate limit').map((s) => s.key)).toEqual(['429']);
    expect(searchEntries(HEADERS, 'cors preflight').map((h) => h.key)).toContain('Access-Control-Max-Age');
    expect(searchEntries(MIME_TYPES, 'apk')[0].title).toBe('application/vnd.android.package-archive');
  });
});
