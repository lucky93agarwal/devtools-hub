import { describe, expect, it } from 'vitest';
import { dayLabel, noteParts } from './note-parts';

describe('noteParts', () => {
  it('finds links without trailing punctuation', () => {
    expect(noteParts('See https://example.com/a?b=1, and http://x.y.')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', href: 'https://example.com/a?b=1' },
      { kind: 'text', text: ', and ' },
      { kind: 'link', href: 'http://x.y' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('separates code blocks with their language', () => {
    expect(noteParts('Run this:\n```bash\nnpm test\n```\ndone')).toEqual([
      { kind: 'text', text: 'Run this:\n' },
      { kind: 'code', lang: 'bash', code: 'npm test' },
      { kind: 'text', text: '\ndone' },
    ]);
  });

  it('keeps an unclosed code block as code', () => {
    expect(noteParts('```\nconst a = 1;')).toEqual([{ kind: 'code', lang: '', code: 'const a = 1;' }]);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 26, 12).getTime();
  it('says Today, Yesterday or the date', () => {
    expect(dayLabel(now - 3_600_000, now)).toBe('Today');
    expect(dayLabel(now - 86_400_000, now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 20).getTime(), now)).toContain('20 November 2026');
  });
});
