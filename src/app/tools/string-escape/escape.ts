/** Escaping and unescaping text for JSON, JavaScript, Java, HTML, XML, SQL, regex and Unicode escapes. */

export type EscapeMode = 'json' | 'js' | 'java' | 'html' | 'xml' | 'sql' | 'regex' | 'unicode';

export const ESCAPE_MODES: { value: EscapeMode; label: string; example: string }[] = [
  { value: 'json', label: 'JSON string', example: 'He said "hi"\\n → He said \\"hi\\"\\n' },
  { value: 'js', label: 'JavaScript string', example: "It's → It\\'s" },
  { value: 'java', label: 'Java / Kotlin string', example: 'café → caf\\u00e9 (optional)' },
  { value: 'html', label: 'HTML entities', example: '<b> & → &lt;b&gt; &amp;' },
  { value: 'xml', label: 'XML', example: '"a" < b → &quot;a&quot; &lt; b' },
  { value: 'sql', label: 'SQL string', example: "O'Brien → O''Brien" },
  { value: 'regex', label: 'Regular expression', example: '1+1=2? → 1\\+1=2\\?' },
  { value: 'unicode', label: 'Unicode escapes', example: 'नमस्ते → \\u0928\\u092e…' },
];

export type EscapeResult = { ok: true; text: string } | { ok: false; error: string };

const toUnicode = (text: string) =>
  [...text]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 0x7f && code >= 0x20) return ch;
      // Characters beyond the first 65,536 become two \u escapes (a surrogate pair), as JSON and Java need.
      return [...ch.split('')].map((u) => `\\u${u.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
    })
    .join('');

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€', pound: '£', yen: '¥',
  cent: '¢', deg: '°', times: '×', divide: '÷', middot: '·', bull: '•', laquo: '«', raquo: '»', sect: '§', para: '¶',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}

/** Reads C-style escapes as used by JavaScript, Java and JSON. */
function decodeBackslashes(text: string): EscapeResult {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = text[++i];
    if (n === undefined) return { ok: false, error: 'The text ends with a lone backslash.' };
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0', '\\': '\\', '"': '"', "'": "'", '/': '/', '`': '`', $: '$' };
    if (n in simple && !(n === '0' && /\d/.test(text[i + 1] ?? ''))) out += simple[n];
    else if (n === 'u' && text[i + 1] === '{') {
      const end = text.indexOf('}', i);
      const code = parseInt(text.slice(i + 2, end), 16);
      if (end < 0 || Number.isNaN(code)) return { ok: false, error: `“\\u{” at position ${i} is not a valid escape.` };
      out += String.fromCodePoint(code);
      i = end;
    } else if (n === 'u' || n === 'x') {
      const size = n === 'u' ? 4 : 2;
      const hex = text.slice(i + 1, i + 1 + size);
      if (!new RegExp(`^[0-9a-fA-F]{${size}}$`).test(hex)) return { ok: false, error: `“\\${n}${hex}” at position ${i} is not a valid escape.` };
      out += String.fromCharCode(parseInt(hex, 16));
      i += size;
    } else return { ok: false, error: `“\\${n}” at position ${i} is not a known escape.` };
  }
  return { ok: true, text: out };
}

export function escapeText(text: string, mode: EscapeMode, asciiOnly = false): string {
  switch (mode) {
    case 'json':
    case 'java': {
      const json = JSON.stringify(text).slice(1, -1);
      return asciiOnly || mode === 'java' ? (asciiOnly ? toUnicode(json) : json) : json;
    }
    case 'js': {
      const escaped = JSON.stringify(text).slice(1, -1).replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      return asciiOnly ? toUnicode(escaped) : escaped;
    }
    case 'html':
      return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
    case 'xml':
      return text.replace(/[&<>"']/g, (c) => (c === "'" ? '&apos;' : HTML_ESCAPES[c]));
    case 'sql':
      return text.replace(/'/g, "''");
    case 'regex':
      return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    case 'unicode':
      return toUnicode(text.replace(/\\/g, '\\\\'));
  }
}

export function unescapeText(text: string, mode: EscapeMode): EscapeResult {
  switch (mode) {
    case 'json': {
      // Accept the value with or without its surrounding quotes.
      const body = /^".*"$/s.test(text.trim()) ? text.trim() : `"${text}"`;
      try {
        const value = JSON.parse(body.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
        return typeof value === 'string' ? { ok: true, text: value } : { ok: false, error: 'This is not a JSON string.' };
      } catch {
        return { ok: false, error: 'This is not a valid JSON string. Look for a lone backslash or an unescaped quote.' };
      }
    }
    case 'js':
    case 'java':
    case 'unicode':
      return decodeBackslashes(text);
    case 'html':
    case 'xml':
      return { ok: true, text: decodeEntities(text) };
    case 'sql':
      return { ok: true, text: text.replace(/''/g, "'") };
    case 'regex':
      return { ok: true, text: text.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1') };
  }
}
