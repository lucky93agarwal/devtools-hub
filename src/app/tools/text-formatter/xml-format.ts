import { XMLValidator } from 'fast-xml-parser';

/**
 * XML pretty-printing that keeps everything: comments, CDATA, processing
 * instructions, the DOCTYPE, attribute order and quoting. Only the whitespace
 * between tags changes. (Parsing into objects and printing again would lose these.)
 */

export interface XmlError {
  line: number;
  column: number;
  message: string;
}

export type XmlResult = { ok: true; output: string } | { ok: false; error: XmlError };

type Token =
  | { kind: 'open'; text: string; name: string }
  | { kind: 'close'; text: string }
  | { kind: 'self'; text: string }
  /** Comments, CDATA, <?…?> and <!DOCTYPE …>: kept exactly as written. */
  | { kind: 'other'; text: string }
  | { kind: 'text'; text: string };

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^<>[\]]|\[[\s\S]*?\])*>|<\/[^>]+>|<(?:[^>"']|"[^"]*"|'[^']*')+>|[^<]+/gi;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const [raw] of text.matchAll(TOKEN)) {
    if (raw.startsWith('<!--') || raw.startsWith('<![CDATA[') || raw.startsWith('<?') || /^<!DOCTYPE/i.test(raw)) {
      tokens.push({ kind: 'other', text: raw });
    } else if (raw.startsWith('</')) {
      tokens.push({ kind: 'close', text: raw.replace(/\s+>$/, '>') });
    } else if (raw.startsWith('<')) {
      if (raw.endsWith('/>')) tokens.push({ kind: 'self', text: raw });
      else tokens.push({ kind: 'open', text: raw, name: /^<([^\s/>]+)/.exec(raw)![1] });
    } else {
      tokens.push({ kind: 'text', text: raw });
    }
  }
  return tokens;
}

function validate(text: string): XmlError | null {
  const result = XMLValidator.validate(text, { allowBooleanAttributes: true });
  if (result === true) return null;
  return { line: result.err.line, column: result.err.col, message: result.err.msg.replace(/\.?$/, '.') };
}

/** Indents every element on its own line; an element holding only short text stays on one line. */
export function formatXml(text: string, indent: string): XmlResult {
  const error = validate(text);
  if (error) return { ok: false, error };
  const tokens = tokenize(text.trim());
  const lines: string[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const pad = indent.repeat(depth);
    if (token.kind === 'text') {
      const value = token.text.trim();
      if (value) lines.push(pad + value);
      continue;
    }
    if (token.kind === 'open') {
      // <name>text</name> on one line, as most people write it.
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      if (next?.kind === 'text' && after?.kind === 'close' && !next.text.includes('\n')) {
        lines.push(pad + token.text + next.text.trim() + after.text);
        i += 2;
        continue;
      }
      if (next?.kind === 'close') {
        lines.push(pad + token.text + next.text);
        i += 1;
        continue;
      }
      lines.push(pad + token.text);
      depth++;
      continue;
    }
    if (token.kind === 'close') {
      depth = Math.max(0, depth - 1);
      lines.push(indent.repeat(depth) + token.text);
      continue;
    }
    lines.push(pad + token.text);
  }
  return { ok: true, output: lines.join('\n') + '\n' };
}

/** Removes the whitespace between tags; text inside elements is kept. */
export function minifyXml(text: string): XmlResult {
  const error = validate(text);
  if (error) return { ok: false, error };
  const output = tokenize(text.trim())
    .map((token) => (token.kind === 'text' && !token.text.trim() ? '' : token.text))
    .join('');
  return { ok: true, output };
}
