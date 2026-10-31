/** A small syntax highlighter for code screenshots: comments, strings, numbers, keywords and function calls. */

export type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'function' | 'type' | 'plain';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS: Record<string, string> = {
  javascript: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield',
  typescript: 'abstract any as async await boolean break case catch class const continue declare default do else enum export extends false finally for from function if implements import in interface keyof let new null number of private protected public readonly return static string super switch this throw true try type typeof undefined var void while',
  kotlin: 'abstract as break by catch class companion const continue data do else enum false final finally for fun if import in interface internal is lateinit null object open override package private protected public return sealed super suspend this throw true try typealias val var when while',
  java: 'abstract boolean break byte case catch char class const continue default do double else enum extends false final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch synchronized this throw throws true try void volatile while var record',
  swift: 'as async await break case catch class continue default defer do else enum extension false for func guard if import in init inout internal is let nil private protocol public return self static struct super switch throw throws true try var where while',
  dart: 'abstract async await break case catch class const continue default do else enum extends false final finally for if import in is late new null required return static super switch this throw true try var void while with',
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield',
  go: 'break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var',
  rust: 'as async await break const continue crate else enum false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
  sql: 'select from where join left right inner outer on group by order having limit offset insert into values update set delete create table index alter drop and or not null is in as distinct count sum avg min max case when then else end primary key foreign references',
  bash: 'if then else elif fi for while do done case esac function in return export local echo cd exit',
  json: 'true false null',
};

export const LANGUAGES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'java', label: 'Java' },
  { value: 'swift', label: 'Swift' },
  { value: 'dart', label: 'Dart / Flutter' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'plain', label: 'Plain text' },
];

/** Splits one line into coloured tokens. `inComment` carries an open block comment over from the previous line. */
export function tokenizeLine(line: string, language: string, inComment: boolean): { tokens: Token[]; inComment: boolean } {
  if (language === 'plain') return { tokens: [{ kind: 'plain', text: line }], inComment: false };
  const words = new Set((KEYWORDS[language] ?? '').split(' ').map((w) => (language === 'sql' ? w.toLowerCase() : w)));
  const hashComments = ['python', 'bash'].includes(language);
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = tokens.at(-1);
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ kind, text });
  };
  let i = 0;
  if (inComment) {
    const end = line.indexOf('*/');
    if (end < 0) return { tokens: [{ kind: 'comment', text: line }], inComment: true };
    push('comment', line.slice(0, end + 2));
    i = end + 2;
  }
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpExecArray | null;
    if (rest.startsWith('/*') && !hashComments) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) {
        push('comment', rest);
        return { tokens, inComment: true };
      }
      push('comment', rest.slice(0, end + 2));
      i += end + 2;
    } else if ((rest.startsWith('//') && !hashComments && language !== 'json') || (hashComments && rest.startsWith('#')) || (language === 'sql' && rest.startsWith('--'))) {
      push('comment', rest);
      break;
    } else if ((m = /^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/.exec(rest))) {
      push('string', m[0]);
      i += m[0].length;
    } else if ((m = /^(0x[\da-f]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?[fFLdD]?)\b/i.exec(rest))) {
      push('number', m[0]);
      i += m[0].length;
    } else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = m[0];
      const next = line.slice(i + word.length).trimStart();
      const kind: TokenKind = words.has(language === 'sql' ? word.toLowerCase() : word) ? 'keyword' : next.startsWith('(') ? 'function' : /^[A-Z]/.test(word) && language !== 'sql' ? 'type' : 'plain';
      push(kind, word);
      i += word.length;
    } else {
      push('plain', rest[0]);
      i++;
    }
  }
  return { tokens, inComment: false };
}

export function tokenize(code: string, language: string): Token[][] {
  let inComment = false;
  return code.replace(/\t/g, '  ').split('\n').map((line) => {
    const r = tokenizeLine(line, language, inComment);
    inComment = r.inComment;
    return r.tokens;
  });
}

export interface Theme {
  id: string;
  label: string;
  background: string;
  text: string;
  lineNumber: string;
  colors: Record<TokenKind, string>;
}

export const THEMES: Theme[] = [
  { id: 'midnight', label: 'Midnight', background: '#0f172a', text: '#e2e8f0', lineNumber: '#475569', colors: { comment: '#64748b', string: '#86efac', number: '#fbbf24', keyword: '#c4b5fd', function: '#7dd3fc', type: '#f9a8d4', plain: '#e2e8f0' } },
  { id: 'dracula', label: 'Dracula', background: '#282a36', text: '#f8f8f2', lineNumber: '#6272a4', colors: { comment: '#6272a4', string: '#f1fa8c', number: '#bd93f9', keyword: '#ff79c6', function: '#50fa7b', type: '#8be9fd', plain: '#f8f8f2' } },
  { id: 'github', label: 'Light', background: '#ffffff', text: '#24292f', lineNumber: '#8c959f', colors: { comment: '#6e7781', string: '#0a3069', number: '#0550ae', keyword: '#cf222e', function: '#8250df', type: '#953800', plain: '#24292f' } },
  { id: 'solar', label: 'Solarized', background: '#fdf6e3', text: '#586e75', lineNumber: '#93a1a1', colors: { comment: '#93a1a1', string: '#2aa198', number: '#d33682', keyword: '#859900', function: '#268bd2', type: '#b58900', plain: '#586e75' } },
];

export const BACKDROPS = [
  { id: 'indigo', label: 'Indigo', css: ['#6366f1', '#a855f7'] },
  { id: 'sunset', label: 'Sunset', css: ['#f97316', '#ec4899'] },
  { id: 'ocean', label: 'Ocean', css: ['#0ea5e9', '#14b8a6'] },
  { id: 'forest', label: 'Forest', css: ['#16a34a', '#65a30d'] },
  { id: 'mono', label: 'Grey', css: ['#94a3b8', '#475569'] },
  { id: 'none', label: 'None', css: [] as string[] },
];
