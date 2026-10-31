import { escapeText, unescapeText } from './escape';

describe('escape', () => {
  it('escapes and unescapes JSON strings, with or without quotes', () => {
    expect(escapeText('He said "hi"\nbye', 'json')).toBe('He said \\"hi\\"\\nbye');
    expect(unescapeText('He said \\"hi\\"\\nbye', 'json')).toEqual({ ok: true, text: 'He said "hi"\nbye' });
    expect(unescapeText('"Caf\\u00e9"', 'json')).toEqual({ ok: true, text: 'Café' });
    expect(unescapeText('bad \\x', 'json')).toMatchObject({ ok: false });
  });

  it('handles JavaScript and Java escapes, including \\x, \\u{} and ASCII-only output', () => {
    expect(escapeText("It's `${a}`", 'js')).toBe("It\\'s \\`\\${a}\\`");
    expect(unescapeText('\\x41\\u{1F600}\\t\\\'', 'js')).toEqual({ ok: true, text: "A😀\t'" });
    expect(escapeText('café 😀', 'java', true)).toBe('caf\\u00e9 \\ud83d\\ude00');
    expect(unescapeText('caf\\u00e9 \\ud83d\\ude00', 'java')).toEqual({ ok: true, text: 'café 😀' });
    expect(unescapeText('oops \\q', 'js')).toEqual({ ok: false, error: '“\\q” at position 6 is not a known escape.' });
  });

  it('escapes HTML and XML and reads named and numeric entities', () => {
    expect(escapeText(`<a href="x">Tom & Jerry's</a>`, 'html')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(escapeText("'", 'xml')).toBe('&apos;');
    expect(unescapeText('&lt;b&gt; &amp;copy; &copy; &#8377; &#x1F600; &unknown;', 'html')).toEqual({ ok: true, text: '<b> &copy; © ₹ 😀 &unknown;' });
  });

  it('escapes SQL, regex and Unicode', () => {
    expect(escapeText("O'Brien", 'sql')).toBe("O''Brien");
    expect(escapeText('1+1=2? (yes) [a]', 'regex')).toBe('1\\+1=2\\? \\(yes\\) \\[a\\]');
    expect(unescapeText('1\\+1', 'regex')).toEqual({ ok: true, text: '1+1' });
    expect(escapeText('नमस्ते', 'unicode')).toBe('\\u0928\\u092e\\u0938\\u094d\\u0924\\u0947');
    expect(unescapeText('\\u0928\\u092e\\u0938\\u094d\\u0924\\u0947', 'unicode')).toEqual({ ok: true, text: 'नमस्ते' });
  });
});
