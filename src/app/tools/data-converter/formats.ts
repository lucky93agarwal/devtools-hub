import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import Papa from 'papaparse';
import { parseDocument, stringify as stringifyYaml } from 'yaml';
import { findJsonError, position } from '../json-formatter/json-tools';

/** Reading and writing JSON, YAML, XML and CSV, all in the browser. */

export type DataFormat = 'json' | 'yaml' | 'xml' | 'csv';

export const FORMATS: { value: DataFormat; label: string; extension: string; mime: string }[] = [
  { value: 'json', label: 'JSON', extension: 'json', mime: 'application/json' },
  { value: 'yaml', label: 'YAML', extension: 'yaml', mime: 'application/yaml' },
  { value: 'xml', label: 'XML', extension: 'xml', mime: 'application/xml' },
  { value: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv' },
];

export interface DataOptions {
  indent: 2 | 4;
  /** Name of the outer element when writing XML. */
  xmlRoot: string;
  csvDelimiter: ',' | ';' | '\t';
  /** Turn "42" and "true" from XML and CSV into numbers and booleans. */
  typedValues: boolean;
}

export const DEFAULT_DATA_OPTIONS: DataOptions = { indent: 2, xmlRoot: 'root', csvDelimiter: ',', typedValues: true };

export interface DataError {
  line: number;
  column: number;
  message: string;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: DataError };
export type WriteResult = { ok: true; text: string } | { ok: false; message: string };

/** Attributes are kept as "@name" keys and mixed text as "#text", in both directions. */
const XML_SETTINGS = { ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' };

export function parseData(text: string, format: DataFormat, options: DataOptions = DEFAULT_DATA_OPTIONS): ParseResult {
  switch (format) {
    case 'json':
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false, error: findJsonError(text) ?? { line: 1, column: 1, message: 'This is not valid JSON.' } };
      }
    case 'yaml':
      return parseYaml(text);
    case 'xml':
      return parseXml(text, options);
    case 'csv':
      return parseCsv(text, options);
  }
}

export function writeData(value: unknown, format: DataFormat, options: DataOptions = DEFAULT_DATA_OPTIONS): WriteResult {
  switch (format) {
    case 'json':
      return { ok: true, text: JSON.stringify(value, null, options.indent) + '\n' };
    case 'yaml':
      // lineWidth 0: never fold long strings over several lines.
      return { ok: true, text: stringifyYaml(value, { indent: options.indent, lineWidth: 0 }) };
    case 'xml':
      return writeXml(value, options);
    case 'csv':
      return writeCsv(value, options);
  }
}

function parseYaml(text: string): ParseResult {
  const document = parseDocument(text);
  const error = document.errors[0];
  if (error) {
    const position = error.linePos?.[0] ?? { line: 1, col: 1 };
    // The library's message repeats the position and quotes the line; the first sentence is enough.
    const message = error.message.split(/ at line \d+/)[0].replace(/\.?$/, '.');
    return { ok: false, error: { line: position.line, column: position.col, message } };
  }
  return { ok: true, value: document.toJS() };
}

function parseXml(text: string, options: DataOptions): ParseResult {
  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    const { line, col, msg } = valid.err;
    return { ok: false, error: { line, column: col, message: msg.replace(/\.?$/, '.') } };
  }
  const parser = new XMLParser({
    ...XML_SETTINGS,
    ignoreDeclaration: true,
    ignorePiTags: true,
    parseTagValue: options.typedValues,
    parseAttributeValue: options.typedValues,
    trimValues: true,
  });
  return { ok: true, value: parser.parse(text) };
}

/** Names XML allows for elements; anything else becomes an underscore. */
function xmlName(key: string): string {
  let name = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!/^[A-Za-z_]/.test(name)) name = '_' + name;
  return name;
}

function cleanForXml(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanForXml);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key.startsWith('@') || key === '#text' ? key : xmlName(key),
        cleanForXml(inner),
      ]),
    );
  }
  // An empty element stands for null.
  return value === null ? '' : value;
}

function writeXml(value: unknown, options: DataOptions): WriteResult {
  let document = cleanForXml(value);
  const root = xmlName(options.xmlRoot.trim() || 'root');
  // XML has exactly one outer element: keep a single top-level key, otherwise wrap.
  const isObject = document && typeof document === 'object' && !Array.isArray(document);
  const keys = isObject ? Object.keys(document as object) : [];
  if (Array.isArray(document)) document = { [root]: { item: document } };
  else if (!isObject) document = { [root]: document };
  else if (keys.length !== 1 || keys[0].startsWith('@') || Array.isArray((document as Record<string, unknown>)[keys[0]])) {
    document = { [root]: document };
  }
  const builder = new XMLBuilder({ ...XML_SETTINGS, format: true, indentBy: ' '.repeat(options.indent) });
  return { ok: true, text: '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(document).trimEnd() + '\n' };
}

function parseCsv(text: string, options: DataOptions): ParseResult {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // detect , ; or tab
    dynamicTyping: options.typedValues,
  });
  const quoteError = result.errors.find((e) => e.type === 'Quotes');
  if (quoteError) {
    // The parser reports where it gave up (the end); the opening quote is more useful.
    const at = position(text, unclosedQuote(text) ?? quoteError.index ?? 0);
    return {
      ok: false,
      error: { line: at.line, column: at.column, message: 'A quoted value is not closed. Check the quotes (").' },
    };
  }
  if (!result.meta.fields?.length) {
    return { ok: false, error: { line: 1, column: 1, message: 'The first line must name the columns.' } };
  }
  return { ok: true, value: result.data.map((row) => unflatten(row)) };
}

/** Offset of a quote that opens a value and is never closed, if any. */
function unclosedQuote(text: string): number | null {
  let start: number | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (start === null) start = i;
    else if (text[i + 1] === '"') i++; // "" is an escaped quote inside a value
    else start = null;
  }
  return start;
}

function writeCsv(value: unknown, options: DataOptions): WriteResult {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length) return { ok: true, text: '' };
  const flat = rows.map(
    (row): Record<string, unknown> =>
      row && typeof row === 'object' && !Array.isArray(row) ? flatten(row as Record<string, unknown>) : { value: row },
  );
  // Columns in the order they first appear in any row.
  const fields = [...new Set(flat.flatMap((row) => Object.keys(row)))];
  const text = Papa.unparse({ fields, data: flat.map((row) => fields.map((f) => row[f] ?? '')) }, {
    delimiter: options.csvDelimiter,
    newline: '\n',
  });
  return { ok: true, text: text + '\n' };
}

/** {"a": {"b": 1}, "tags": ["x"]} to {"a.b": 1, "tags.0": "x"}, so nested data fits in columns. */
export function flatten(value: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}) {
  for (const [key, inner] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner && typeof inner === 'object' && Object.keys(inner).length) {
      flatten(inner as Record<string, unknown>, path, out);
    } else {
      out[path] = inner && typeof inner === 'object' ? JSON.stringify(inner) : inner;
    }
  }
  return out;
}

/** The reverse of flatten: "a.b" builds nested objects, and number parts build lists. */
export function unflatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(row)) {
    const parts = path.split('.');
    let target: Record<string, unknown> = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        target[part] = value;
        return;
      }
      target[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
      target = target[part] as Record<string, unknown>;
    });
  }
  return out;
}
