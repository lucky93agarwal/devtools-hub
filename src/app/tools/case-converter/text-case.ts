/** Naming styles for identifiers (camelCase and friends), letter case for prose, and line tools. */

/** Splits an identifier or phrase into words: "parseHTTPResponse_v2" gives parse, HTTP, Response, v2. */
export function words(text: string): string[] {
  return text
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

export interface CaseStyle {
  id: string;
  label: string;
  convert: (text: string) => string;
}

/** Identifier styles work line by line, so a list of names converts in one go. */
const perLine = (fn: (w: string[]) => string) => (text: string) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? fn(words(line)) : line))
    .join('\n');

export const CASE_STYLES: readonly CaseStyle[] = [
  { id: 'camel', label: 'camelCase', convert: perLine((w) => w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join('')) },
  { id: 'pascal', label: 'PascalCase', convert: perLine((w) => w.map(cap).join('')) },
  { id: 'snake', label: 'snake_case', convert: perLine((w) => w.join('_').toLowerCase()) },
  { id: 'constant', label: 'CONSTANT_CASE', convert: perLine((w) => w.join('_').toUpperCase()) },
  { id: 'kebab', label: 'kebab-case', convert: perLine((w) => w.join('-').toLowerCase()) },
  { id: 'train', label: 'Train-Case', convert: perLine((w) => w.map(cap).join('-')) },
  { id: 'dot', label: 'dot.case', convert: perLine((w) => w.join('.').toLowerCase()) },
  { id: 'path', label: 'path/case', convert: perLine((w) => w.join('/').toLowerCase()) },
  { id: 'title', label: 'Title Case', convert: (t) => t.toLowerCase().replace(/(^|[\s\-_/([{"'“‘])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  {
    id: 'sentence',
    label: 'Sentence case',
    convert: (t) => t.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()),
  },
  { id: 'lower', label: 'lower case', convert: (t) => t.toLowerCase() },
  { id: 'upper', label: 'UPPER CASE', convert: (t) => t.toUpperCase() },
];

export type SortMode = 'none' | 'az' | 'za' | 'natural' | 'length';

export interface LineOptions {
  trim: boolean;
  removeEmpty: boolean;
  unique: boolean;
  ignoreCase: boolean;
  sort: SortMode;
  reverse: boolean;
}

export const DEFAULT_LINE_OPTIONS: LineOptions = {
  trim: false,
  removeEmpty: false,
  unique: false,
  ignoreCase: false,
  sort: 'none',
  reverse: false,
};

export function applyLineTools(text: string, o: LineOptions): string {
  let lines = text.split(/\r?\n/);
  if (o.trim) lines = lines.map((l) => l.trim());
  if (o.removeEmpty) lines = lines.filter((l) => l.trim());
  if (o.unique) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const key = o.ignoreCase ? l.toLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const collator = new Intl.Collator('en', { numeric: o.sort === 'natural', sensitivity: o.ignoreCase ? 'base' : 'variant' });
  if (o.sort === 'az' || o.sort === 'natural') lines.sort(collator.compare);
  if (o.sort === 'za') lines.sort((a, b) => collator.compare(b, a));
  if (o.sort === 'length') lines.sort((a, b) => a.length - b.length || collator.compare(a, b));
  if (o.reverse) lines.reverse();
  return lines.join('\n');
}

export interface TextStats {
  characters: number;
  withoutSpaces: number;
  words: number;
  lines: number;
  bytes: number;
}

export function stats(text: string): TextStats {
  return {
    // Counted as the user sees them, so an emoji or an accented letter is one character.
    characters: [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length,
    withoutSpaces: [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text.replace(/\s+/g, ''))].length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    lines: text ? text.split(/\r?\n/).length : 0,
    bytes: new TextEncoder().encode(text).length,
  };
}
