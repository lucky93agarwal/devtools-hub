/** JavaScript regular expressions: matching, replacing, a plain-English explanation and code for other languages. */

export const FLAGS = [
  { flag: 'g', label: 'global', hint: 'Find every match, not only the first' },
  { flag: 'i', label: 'ignore case', hint: 'A matches a' },
  { flag: 'm', label: 'multiline', hint: '^ and $ match at each line' },
  { flag: 's', label: 'dot all', hint: '. also matches line breaks' },
  { flag: 'u', label: 'unicode', hint: 'Full Unicode, \\p{…} classes' },
  { flag: 'y', label: 'sticky', hint: 'Match only at lastIndex' },
] as const;

export type CompileResult = { ok: true; regex: RegExp } | { ok: false; error: string };

export function compile(pattern: string, flags: string): CompileResult {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    const message = (error as Error).message.replace(/^Invalid regular expression: \/.*\/[a-z]*: /, '');
    return { ok: false, error: `${message.charAt(0).toUpperCase()}${message.slice(1)}.`.replace(/\.\.$/, '.') };
  }
}

export interface Group {
  name: string | null;
  value: string | undefined;
}

export interface Match {
  index: number;
  end: number;
  text: string;
  groups: Group[];
}

export interface RunResult {
  matches: Match[];
  /** More matches exist than were collected. */
  truncated: boolean;
  replaced: string | null;
}

export const MATCH_LIMIT = 1000;

/** All matches (or the first, without g) and the replaced text. Runs in a worker; see regex.worker.ts. */
export function run(pattern: string, flags: string, text: string, replacement: string | null): RunResult {
  const regex = new RegExp(pattern, flags);
  // matchAll needs g; without g the user asked for the first match only.
  const all = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  const names = groupNames(pattern);
  const matches: Match[] = [];
  let truncated = false;
  for (const m of text.matchAll(all)) {
    if (matches.length === MATCH_LIMIT) {
      truncated = true;
      break;
    }
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1).map((value, i) => ({ name: names[i] ?? null, value })),
    });
    if (!flags.includes('g')) break;
  }
  return { matches, truncated, replaced: replacement === null ? null : text.replace(regex, replacement) };
}

/** Names of capture groups in order, null for unnamed ones. */
export function groupNames(pattern: string): (string | null)[] {
  const names: (string | null)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(') {
      const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i));
      if (named) names.push(named[1]);
      else if (pattern[i + 1] !== '?') names.push(null);
    }
  }
  return names;
}

/** The text split into plain and matched parts, for highlighting. */
export function segments(text: string, matches: Match[]): { text: string; match: number | null }[] {
  const parts: { text: string; match: number | null }[] = [];
  let at = 0;
  matches.forEach((m, i) => {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), match: null });
    if (m.end > m.index) parts.push({ text: text.slice(m.index, m.end), match: i });
    at = Math.max(at, m.end);
  });
  if (at < text.length) parts.push({ text: text.slice(at), match: null });
  return parts;
}

const ESCAPES: Record<string, string> = {
  d: 'a digit (0–9)',
  D: 'anything but a digit',
  w: 'a word character (letter, digit or _)',
  W: 'anything but a word character',
  s: 'whitespace (space, tab, line break)',
  S: 'anything but whitespace',
  b: 'a word boundary',
  B: 'not a word boundary',
  n: 'a line break',
  r: 'a carriage return',
  t: 'a tab',
};

export interface Token {
  token: string;
  meaning: string;
}

function quantifier(q: string): string {
  const lazy = q.endsWith('?') && q.length > 1 ? ', as few as possible' : '';
  const base = lazy ? q.slice(0, -1) : q;
  if (base === '*') return `zero or more times${lazy}`;
  if (base === '+') return `one or more times${lazy}`;
  if (base === '?') return 'optional (zero or one time)';
  const [, min, comma, max] = /^\{(\d+)(,?)(\d*)\}$/.exec(base) ?? [];
  if (!comma) return `exactly ${min} times`;
  return max ? `${min} to ${max} times${lazy}` : `at least ${min} times${lazy}`;
}

/** Breaks a pattern into its parts with a short explanation of each. */
export function explain(pattern: string): Token[] {
  const tokens: Token[] = [];
  const push = (token: string, meaning: string) => {
    // Runs of plain characters are shown together.
    const last = tokens.at(-1);
    if (meaning === 'literal' && last?.meaning.startsWith('the text')) {
      last.token += token;
      last.meaning = `the text “${last.token.replace(/\\(.)/g, '$1')}”`;
    } else tokens.push({ token, meaning: meaning === 'literal' ? `the text “${token.replace(/\\(.)/g, '$1')}”` : meaning });
  };
  for (let i = 0; i < pattern.length; ) {
    const rest = pattern.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\\([dDwWsSbBnrt])/.exec(rest))) push(m[0], ESCAPES[m[1]]);
    else if ((m = /^\\[pP]\{([^}]+)\}/.exec(rest))) push(m[0], `${m[0][1] === 'P' ? 'not ' : ''}a character in Unicode class ${m[1]}`);
    else if ((m = /^\\u\{?[0-9a-fA-F]+\}?|^\\x[0-9a-fA-F]{2}/.exec(rest))) push(m[0], `the character ${m[0]}`);
    else if ((m = /^\\(\d+)/.exec(rest))) push(m[0], `the same text as group ${m[1]}`);
    else if ((m = /^\\k<(\w+)>/.exec(rest))) push(m[0], `the same text as group “${m[1]}”`);
    else if ((m = /^\\./.exec(rest))) push(m[0], 'literal');
    else if ((m = /^\[\^?(?:\\.|[^\]\\])*\]/.exec(rest))) {
      const negated = m[0][1] === '^';
      push(m[0], `${negated ? 'any character except' : 'one of'} ${m[0].slice(negated ? 2 : 1, -1)}`);
    } else if ((m = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(rest))) push(m[0], `start of group “${m[1]}”`);
    else if ((m = /^\(\?(:|=|!|<=|<!)/.exec(rest))) {
      push(m[0], { ':': 'start of a group that is not captured', '=': 'followed by (lookahead):', '!': 'not followed by:', '<=': 'preceded by (lookbehind):', '<!': 'not preceded by:' }[m[1]]!);
    } else if (rest[0] === '(') push('(', `start of group ${countGroups(pattern.slice(0, i)) + 1}`);
    else if (rest[0] === ')') push(')', 'end of group');
    else if ((m = /^(?:[*+?]|\{\d+,?\d*\})\??/.exec(rest))) push(m[0], `the part before, ${quantifier(m[0])}`);
    else if (rest[0] === '^') push('^', 'start of the text (or line with m)');
    else if (rest[0] === '$') push('$', 'end of the text (or line with m)');
    else if (rest[0] === '|') push('|', 'or');
    else if (rest[0] === '.') push('.', 'any character except a line break');
    else push(rest[0], 'literal');
    i += m ? m[0].length : 1;
  }
  return tokens;
}

const countGroups = (before: string) => groupNames(before + ')').length;

/** The pattern written for another language's source code. */
export function asCode(pattern: string, flags: string, language: string): string {
  const flagSet = (map: Record<string, string>, join: string) =>
    [...flags].map((f) => map[f]).filter(Boolean).join(join);
  const javaString = JSON.stringify(pattern);
  switch (language) {
    case 'python': {
      const f = flagSet({ i: 're.IGNORECASE', m: 're.MULTILINE', s: 're.DOTALL' }, ' | ');
      const py = pattern.replace(/\(\?<(?=[A-Za-z_])/g, '(?P<');
      return `import re\n\npattern = re.compile(r${JSON.stringify(py).replace(/\\\\/g, '\\')}${f ? `, ${f}` : ''})\nmatches = pattern.findall(text)`;
    }
    case 'java': {
      const f = flagSet({ i: 'Pattern.CASE_INSENSITIVE', m: 'Pattern.MULTILINE', s: 'Pattern.DOTALL', u: 'Pattern.UNICODE_CASE' }, ' | ');
      return `Pattern pattern = Pattern.compile(${javaString}${f ? `, ${f}` : ''});\nMatcher matcher = pattern.matcher(text);\nwhile (matcher.find()) {\n    System.out.println(matcher.group());\n}`;
    }
    case 'kotlin': {
      const f = flagSet({ i: 'RegexOption.IGNORE_CASE', m: 'RegexOption.MULTILINE', s: 'RegexOption.DOT_MATCHES_ALL' }, ', ');
      return `val regex = Regex(${javaString}${f ? `, setOf(${f})` : ''})\nval matches = regex.findAll(text).map { it.value }.toList()`;
    }
    case 'go': {
      const f = [...flags].filter((x) => 'ims'.includes(x)).join('');
      const p = (f ? `(?${f})` : '') + pattern.replace(/\(\?<(?=[A-Za-z_])/g, '(?P<');
      return `re := regexp.MustCompile(\`${p}\`)\nmatches := re.FindAllString(text, -1)`;
    }
    case 'php': {
      const f = [...flags].filter((x) => 'imsu'.includes(x)).join('');
      return `preg_match_all('/${pattern.replace(/\//g, '\\/').replace(/'/g, "\\'")}/${f}', $text, $matches);`;
    }
    case 'csharp': {
      const f = flagSet({ i: 'RegexOptions.IgnoreCase', m: 'RegexOptions.Multiline', s: 'RegexOptions.Singleline' }, ' | ');
      return `var regex = new Regex(@"${pattern.replace(/"/g, '""')}"${f ? `, ${f}` : ''});\nvar matches = regex.Matches(text);`;
    }
    default:
      return `const regex = /${pattern.replace(/\//g, '\\/') || '(?:)'}/${flags};\nconst matches = [...text.matchAll(${flags.includes('g') ? 'regex' : `new RegExp(regex, '${flags}g')`})];`;
  }
}

export const CODE_LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'go', label: 'Go' },
  { id: 'php', label: 'PHP' },
  { id: 'csharp', label: 'C#' },
];

/** Ready-made patterns for common checks, including Indian formats. */
export const LIBRARY = [
  { label: 'Email', pattern: '^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$', flags: 'i', sample: 'ada@example.com' },
  { label: 'URL', pattern: 'https?:\\/\\/[\\w.-]+(?::\\d+)?(?:\\/[^\\s]*)?', flags: 'gi', sample: 'Docs: https://devtools24.in/regex-tester?x=1' },
  { label: 'IPv4', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', sample: 'Server 192.168.1.20, gateway 10.0.0.1' },
  { label: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', flags: 'gi', sample: 'id=0190c3a2-7b1e-7cc1-9a2f-3d4e5f607182' },
  { label: 'Date (YYYY-MM-DD)', pattern: '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])', flags: 'g', sample: 'Released 2026-10-31, patched 2026-11-02' },
  { label: 'Hex colour', pattern: '#(?:[0-9a-f]{3}){1,2}\\b', flags: 'gi', sample: 'color: #4f46e5; border: #fff;' },
  { label: 'Indian mobile', pattern: '(?:\\+91[\\s-]?)?[6-9]\\d{9}\\b', flags: 'g', sample: 'Call +91 9876543210 or 8123456789' },
  { label: 'PAN card', pattern: '\\b[A-Z]{5}\\d{4}[A-Z]\\b', flags: 'g', sample: 'PAN: ABCDE1234F' },
  { label: 'GSTIN', pattern: '\\b\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\\b', flags: 'g', sample: 'GSTIN 27ABCDE1234F1Z5' },
  { label: 'IFSC', pattern: '\\b[A-Z]{4}0[A-Z0-9]{6}\\b', flags: 'g', sample: 'IFSC: SBIN0001234' },
  { label: 'PIN code', pattern: '\\b[1-9]\\d{5}\\b', flags: 'g', sample: 'Mumbai 400001, Delhi 110001' },
  { label: 'Strong password', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}$', flags: '', sample: 'Secur3!Pass' },
];
