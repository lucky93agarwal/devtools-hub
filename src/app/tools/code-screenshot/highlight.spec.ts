import { tokenize, tokenizeLine } from './highlight';

const kinds = (line: string, lang: string) => tokenizeLine(line, lang, false).tokens.map((t) => `${t.kind}:${t.text}`);

describe('highlight', () => {
  it('colours keywords, strings, numbers, calls and types', () => {
    expect(kinds('val total = items.sumOf("x", 2)', 'kotlin')).toEqual([
      'keyword:val',
      'plain: total = items.',
      'function:sumOf',
      'plain:(',
      'string:"x"',
      'plain:, ',
      'number:2',
      'plain:)',
    ]);
    expect(kinds('const user: User = null; // done', 'typescript')).toEqual(['keyword:const', 'plain: user: ', 'type:User', 'plain: = ', 'keyword:null', 'plain:; ', 'comment:// done']);
  });

  it('handles comments per language and across lines', () => {
    expect(kinds('x = 1  # note', 'python').at(-1)).toBe('comment:# note');
    expect(kinds('SELECT id -- note', 'sql')).toEqual(['keyword:SELECT', 'plain: id ', 'comment:-- note']);
    const lines = tokenize('/* start\nmiddle\nend */ let a', 'javascript');
    expect(lines.map((l) => l[0].kind)).toEqual(['comment', 'comment', 'comment']);
    expect(lines[2].at(-2)).toEqual({ kind: 'keyword', text: 'let' });
  });

  it('leaves plain text alone', () => {
    expect(tokenize('if (a) // b', 'plain')).toEqual([[{ kind: 'plain', text: 'if (a) // b' }]]);
  });
});
