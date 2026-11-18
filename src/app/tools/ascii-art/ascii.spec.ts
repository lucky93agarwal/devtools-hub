import { CHARSETS, asHtml, asMarkdown, rowsFor, toAscii } from './ascii';

describe('ascii art', () => {
  it('maps dark pixels to dense characters and trims trailing spaces', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0]);
    expect(toAscii(data, 3, 1, CHARSETS.binary)).toBe('#');
    expect(toAscii(data, 3, 1, CHARSETS.binary, true)).toBe(' ##');
  });

  it('keeps the shape with half as many rows', () => {
    expect(rowsFor(200, 100, 100)).toBe(25);
  });

  it('wraps for Markdown and escapes HTML', () => {
    expect(asMarkdown('#')).toBe('```text\n#\n```\n');
    expect(asHtml('<&>')).toContain('&lt;&amp;&gt;');
  });
});
