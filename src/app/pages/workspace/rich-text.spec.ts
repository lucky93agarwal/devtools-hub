import { describe, expect, it } from 'vitest';
import { linkifyHtml, nextListMarker, noteHtmlToText, sanitizeNoteHtml } from './rich-text';

describe('formatted notes', () => {
  it('keeps only the allowed tags', () => {
    expect(sanitizeNoteHtml('<b>bold</b> <i>it</i> <u>u</u><br><span class="tc-red">red</span> <mark class="hl-yellow">hi</mark>')).toBe(
      '<b>bold</b> <i>it</i> <u>u</u><br><span class="tc-red">red</span> <mark class="hl-yellow">hi</mark>',
    );
    expect(sanitizeNoteHtml('<script>alert(1)</script><img src=x onerror=alert(1)>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
    const tricky = sanitizeNoteHtml('<span class="tc-red" onclick="x">a</span><span style="color:red">b</span>');
    expect(tricky).not.toContain('onclick="');
    expect(tricky).not.toContain('<span style');
    expect(new DOMParser().parseFromString(tricky, 'text/html').querySelectorAll('[onclick],[style]').length).toBe(0);
    expect(sanitizeNoteHtml('<mark class="hl-black">x</mark>')).toContain('&lt;mark');
    expect(sanitizeNoteHtml('<span class="tc-black">a</span><mark class="hl-white">b</mark>')).toBe('<span class="tc-black">a</span><mark class="hl-white">b</mark>');
    expect(sanitizeNoteHtml('a &lt;b&gt; c &amp; d')).toBe('a &lt;b&gt; c &amp; d');
  });

  it('turns formatted notes back into text and finds links', () => {
    expect(noteHtmlToText('<b>a</b><br>x &lt; y &amp; z')).toBe('a\nx < y & z');
    expect(linkifyHtml('see <b>https://a.b/c</b>, ok')).toBe('see <b><a href="https://a.b/c" target="_blank" rel="noopener noreferrer">https://a.b/c</a></b>, ok');
  });

  it('continues numbered, lettered and bullet lists', () => {
    expect(nextListMarker('1. Lucky')).toEqual({ next: '2. ', empty: false });
    expect(nextListMarker('a. one')).toEqual({ next: 'b. ', empty: false });
    expect(nextListMarker('C. one')).toEqual({ next: 'D. ', empty: false });
    expect(nextListMarker('* star')).toEqual({ next: '• ', empty: false });
    expect(nextListMarker('  - dash')).toEqual({ next: '  • ', empty: false });
    expect(nextListMarker('3. ')).toEqual({ next: '4. ', empty: true });
    expect(nextListMarker('hello')).toBeNull();
  });
});
