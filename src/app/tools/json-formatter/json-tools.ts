/**
 * Pure JSON helpers used by the JSON formatter. No Angular here, so the same
 * code can later run in a Web Worker or a shared tools library.
 */

import { expandJsonStrings, jsonInString, parseTree, printTree, sortTree } from './json-tree';

export type Indent = 2 | 4 | '\t';

export interface JsonError {
  message: string;
  /** 1-based line of the problem. */
  line: number;
  /** 1-based column of the problem. */
  column: number;
  /** 0-based character offset of the problem. */
  offset: number;
}

export type JsonResult =
  | {
      ok: true;
      output: string;
      /** How many strings holding JSON were turned into JSON, when that option is on. */
      expanded?: number;
    }
  | { ok: false; error: JsonError };

export interface FormatOptions {
  /** Sort object keys alphabetically at every level, so key order does not matter. */
  sortKeys?: boolean;
  /**
   * Turn string values that hold JSON, such as "{\"id\":1}", into the JSON itself.
   * Also unwraps input that is one whole JSON string, quoted or copied without its quotes.
   */
  expandStrings?: boolean;
}

/** Pretty-prints JSON with the given indent. Keys, numbers and strings stay exactly as written. */
export function formatJson(text: string, indent: Indent = 2, options: FormatOptions = {}): JsonResult {
  return transform(text, indent === '\t' ? '\t' : ' '.repeat(indent), options);
}

/** Removes all optional whitespace from JSON. */
export function minifyJson(text: string, options: FormatOptions = {}): JsonResult {
  return transform(text, null, options);
}

/** One unit of work, as sent to the JSON Web Worker. */
export interface JsonJob {
  op: 'format' | 'minify';
  text: string;
  indent: Indent;
  sortKeys?: boolean;
  expandStrings?: boolean;
}

export function runJsonJob(job: JsonJob): JsonResult {
  const options = { sortKeys: job.sortKeys, expandStrings: job.expandStrings };
  return job.op === 'format' ? formatJson(job.text, job.indent, options) : minifyJson(job.text, options);
}

/** Counts lines without splitting, so a 10 MB output does not create a huge array. */
export function countLines(text: string): number {
  if (!text) return 0;
  let lines = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lines++;
  return lines;
}

function transform(text: string, indent: string | null, options: FormatOptions): JsonResult {
  if (text.trim() === '') {
    return { ok: false, error: { message: 'Paste some JSON first.', line: 1, column: 1, offset: 0 } };
  }
  let value: unknown;
  let expanded = 0;
  try {
    // The browser's parser is the fastest way to check the whole text is valid.
    value = JSON.parse(text);
  } catch (e) {
    const unquoted = options.expandStrings ? unquotedJsonString(text) : null;
    if (unquoted === null) return { ok: false, error: findJsonError(text) ?? fallbackError(text, e) };
    // Text like {\"id\":1}, copied from a log or a string without its quotes.
    text = unquoted;
    value = JSON.parse(text);
    expanded = 1;
  }
  try {
    let tree = parseTree(text.trim());
    if (options.expandStrings) {
      const result = expandJsonStrings(tree);
      tree = result.node;
      expanded += result.count;
    }
    const output = printTree(options.sortKeys ? sortTree(tree) : tree, indent);
    return options.expandStrings ? { ok: true, output, expanded } : { ok: true, output };
  } catch {
    // Extremely deep nesting can overflow the stack; fall back to the browser's printer.
    return { ok: true, output: JSON.stringify(value, null, indent ?? undefined) };
  }
}

/** Reads text like {\"id\":1} (escaped JSON without the outer quotes) as JSON, or returns null. */
function unquotedJsonString(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.includes('\\"')) return null;
  return jsonInString(`"${trimmed}"`);
}

/** Used only if the browser rejects JSON that our checker accepts. */
function fallbackError(text: string, e: unknown): JsonError {
  const message = e instanceof Error ? e.message : 'Invalid JSON.';
  return { message, ...position(text, 0) };
}

/** Converts a character offset to a 1-based line and column. */
export function position(text: string, offset: number): { line: number; column: number; offset: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1, offset };
}

class ParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/**
 * Walks the text with a small JSON grammar checker and returns the first problem,
 * or null if the text is valid. Browsers report JSON errors differently (Safari
 * gives no position at all), so this keeps messages and positions the same everywhere.
 */
export function findJsonError(text: string): JsonError | null {
  let i = 0;

  const fail = (message: string, at = i): never => {
    throw new ParseError(message, at);
  };

  const describe = (at: number): string => {
    if (at >= text.length) return 'end of input';
    const ch = text[at];
    if (ch === '\n') return 'a line break';
    return `'${ch}'`;
  };

  /** True when a new value starts here, which after a value means a comma is missing. */
  const startsValue = (at: number): boolean => /^[{["\-0-9tfn]/.test(text[at] ?? '');

  const skipWhitespace = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };

  const parseValue = (): void => {
    skipWhitespace();
    if (i >= text.length) fail('Unexpected end of input. A value is missing.');
    const ch = text[i];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    if (ch === "'") fail('Strings must use double quotes ("), not single quotes.');
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    fail(`Unexpected ${describe(i)}. Expected a value.`);
  };

  const parseObject = (): void => {
    i++; // {
    skipWhitespace();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[i] === '}') fail('Trailing comma is not allowed before }.', i);
      if (text[i] === "'") fail('Property names must use double quotes ("), not single quotes.');
      if (text[i] !== '"') fail(`Expected a property name in double quotes, found ${describe(i)}.`);
      parseString();
      skipWhitespace();
      if (text[i] !== ':') fail(`Expected ':' after the property name, found ${describe(i)}.`);
      i++;
      parseValue();
      skipWhitespace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return;
      }
      if (i >= text.length) fail('Unexpected end of input. Missing } to close the object.');
      if (startsValue(i)) fail(`Missing comma. Add ',' before ${describe(i)}.`);
      fail(`Expected ',' or '}' after the value, found ${describe(i)}.`);
    }
  };

  const parseArray = (): void => {
    i++; // [
    skipWhitespace();
    if (text[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[i] === ']') fail('Trailing comma is not allowed before ].', i);
      parseValue();
      skipWhitespace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return;
      }
      if (i >= text.length) fail('Unexpected end of input. Missing ] to close the array.');
      if (startsValue(i)) fail(`Missing comma. Add ',' before ${describe(i)}.`);
      fail(`Expected ',' or ']' after the value, found ${describe(i)}.`);
    }
  };

  const parseString = (): void => {
    const start = i;
    i++; // opening quote
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return;
      }
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            fail('Invalid \\u escape. It needs exactly four hex digits.');
          }
          i += 6;
          continue;
        }
        if (next === undefined || !'"\\/bfnrt'.includes(next)) {
          fail(`Invalid escape sequence '\\${next ?? ''}' in a string.`);
        }
        i += 2;
        continue;
      }
      if (ch < ' ') {
        fail(ch === '\n' ? 'Line break inside a string. Use \\n instead.' : 'Control character inside a string.');
      }
      i++;
    }
    fail('Unterminated string. Missing the closing double quote.', start);
  };

  const parseNumber = (): void => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match || match[0] === '-') fail('Invalid number.');
    const end = i + match![0].length;
    if (end < text.length && /[0-9.eE]/.test(text[end])) {
      fail(text[i] === '0' || text.startsWith('-0', i) ? 'Numbers cannot have leading zeros.' : 'Invalid number.', i);
    }
    i = end;
  };

  try {
    parseValue();
    skipWhitespace();
    if (i < text.length) fail(`Unexpected ${describe(i)} after the end of the JSON value.`);
    return null;
  } catch (e) {
    if (e instanceof ParseError) {
      return { message: e.message, ...position(text, e.offset) };
    }
    throw e;
  }
}
