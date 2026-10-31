import { LIBRARY, asCode, compile, explain, groupNames, run, segments } from './regex';

describe('regex', () => {
  it('finds every match with its groups, or only the first without g', () => {
    const result = run('(?<year>\\d{4})-(\\d{2})', 'g', 'on 2026-10 and 2027-01', null);
    expect(result.matches).toEqual([
      { index: 3, end: 10, text: '2026-10', groups: [{ name: 'year', value: '2026' }, { name: null, value: '10' }] },
      { index: 15, end: 22, text: '2027-01', groups: [{ name: 'year', value: '2027' }, { name: null, value: '01' }] },
    ]);
    expect(run('\\d+', '', 'a1 b22', null).matches.map((m) => m.text)).toEqual(['1']);
  });

  it('replaces with group references', () => {
    expect(run('(\\w+)@(\\w+)', 'g', 'ada@home bob@work', '$2:$1').replaced).toBe('home:ada work:bob');
  });

  it('stops collecting after the limit and handles empty matches', () => {
    expect(run('a', 'g', 'a'.repeat(1500), null)).toMatchObject({ truncated: true });
    expect(run('a', 'g', 'a'.repeat(1500), null).matches).toHaveLength(1000);
    expect(run('x*', 'g', 'ab', null).matches).toHaveLength(3);
  });

  it('reports invalid patterns in plain words', () => {
    expect(compile('(a', '')).toMatchObject({ ok: false, error: expect.stringMatching(/^Unterminated group/) });
    expect(compile('a', 'gg')).toMatchObject({ ok: false });
    expect(compile('a+', 'gi').ok).toBe(true);
  });

  it('knows the names and order of groups', () => {
    expect(groupNames('(a)(?:b)(?<c>d)[(]\\((e)')).toEqual([null, 'c', null]);
  });

  it('splits text for highlighting', () => {
    const { matches } = run('\\d+', 'g', 'a1b22', null);
    expect(segments('a1b22', matches)).toEqual([
      { text: 'a', match: null },
      { text: '1', match: 0 },
      { text: 'b', match: null },
      { text: '22', match: 1 },
    ]);
  });

  it('explains each part of a pattern', () => {
    expect(explain('^\\d{3}-[a-z]+(?<tld>com|in)$')).toEqual([
      { token: '^', meaning: 'start of the text (or line with m)' },
      { token: '\\d', meaning: 'a digit (0–9)' },
      { token: '{3}', meaning: 'the part before, exactly 3 times' },
      { token: '-', meaning: 'the text “-”' },
      { token: '[a-z]', meaning: 'one of a-z' },
      { token: '+', meaning: 'the part before, one or more times' },
      { token: '(?<tld>', meaning: 'start of group “tld”' },
      { token: 'com', meaning: 'the text “com”' },
      { token: '|', meaning: 'or' },
      { token: 'in', meaning: 'the text “in”' },
      { token: ')', meaning: 'end of group' },
      { token: '$', meaning: 'end of the text (or line with m)' },
    ]);
  });

  it('writes the pattern for other languages', () => {
    expect(asCode('(?<y>\\d+)/x', 'gi', 'javascript')).toBe('const regex = /(?<y>\\d+)\\/x/gi;\nconst matches = [...text.matchAll(regex)];');
    expect(asCode('(?<y>\\d+)', 'i', 'python')).toBe("import re\n\npattern = re.compile(r\"(?P<y>\\d+)\", re.IGNORECASE)\nmatches = pattern.findall(text)");
    expect(asCode('\\d+', 'im', 'go')).toBe('re := regexp.MustCompile(`(?im)\\d+`)\nmatches := re.FindAllString(text, -1)');
    expect(asCode('a"b', '', 'csharp')).toBe('var regex = new Regex(@"a""b");\nvar matches = regex.Matches(text);');
  });

  it('ships library patterns that match their samples', () => {
    for (const item of LIBRARY) {
      expect(run(item.pattern, item.flags, item.sample, null).matches.length, item.label).toBeGreaterThan(0);
    }
  });
});
