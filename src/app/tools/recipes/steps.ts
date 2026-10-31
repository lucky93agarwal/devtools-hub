/**
 * Recipes: small steps that each take text and give text, chained so the output of one is the input of the next,
 * such as "Base64 decode → JSON format". Every step reuses the logic of an existing tool.
 */
import { bytesToText, decodeBase64, textToBase64 } from '../base64/base64';
import { DEFAULT_LINE_OPTIONS, applyLineTools } from '../case-converter/text-case';
import { DataFormat, parseData, writeData } from '../data-converter/formats';
import { hashText } from '../hash-generator/hashes';
import { formatJson, minifyJson } from '../json-formatter/json-tools';
import { decodeJwt } from '../jwt/jwt-tools';
import { escapeText, unescapeText } from '../string-escape/escape';
import { decodeText, encodeText } from '../url-encoder/url-tools';

export type StepResult = { ok: true; text: string } | { ok: false; error: string };

export interface Step {
  id: string;
  label: string;
  group: string;
  run: (text: string) => StepResult | Promise<StepResult>;
}

const ok = (text: string): StepResult => ({ ok: true, text });
const fail = (error: string): StepResult => ({ ok: false, error });

function convert(text: string, from: DataFormat, to: DataFormat): StepResult {
  const parsed = parseData(text, from);
  if (!parsed.ok) return fail(`Line ${parsed.error.line}: ${parsed.error.message}`);
  const written = writeData(parsed.value, to);
  return written.ok ? ok(written.text) : fail(written.message);
}

const lines = (o: Partial<typeof DEFAULT_LINE_OPTIONS>) => (t: string) => ok(applyLineTools(t, { ...DEFAULT_LINE_OPTIONS, ...o }));

export const STEPS: readonly Step[] = [
  { id: 'b64-decode', group: 'Encoding', label: 'Base64 decode', run: (t) => {
    const r = decodeBase64(t);
    if (!r.ok) return fail(r.error);
    const text = bytesToText(r.bytes);
    return text === null ? fail(`The Base64 holds binary data (${r.mime ?? 'unknown type'}), not text.`) : ok(text);
  } },
  { id: 'b64-encode', group: 'Encoding', label: 'Base64 encode', run: (t) => ok(textToBase64(t)) },
  { id: 'b64url-encode', group: 'Encoding', label: 'Base64URL encode', run: (t) => ok(textToBase64(t, true)) },
  { id: 'url-decode', group: 'Encoding', label: 'URL decode', run: (t) => { const r = decodeText(t, true); return r.ok ? ok(r.text) : fail(r.error); } },
  { id: 'url-encode', group: 'Encoding', label: 'URL encode', run: (t) => ok(encodeText(t, 'component')) },
  { id: 'json-unescape', group: 'Encoding', label: 'Unescape JSON string', run: (t) => {
    const s = t.trim();
    const r = unescapeText(/^".*"$/s.test(s) ? s.slice(1, -1) : t, 'json');
    return r.ok ? ok(r.text) : fail(r.error);
  } },
  { id: 'json-escape', group: 'Encoding', label: 'Escape as JSON string', run: (t) => ok(escapeText(t, 'json')) },
  { id: 'html-unescape', group: 'Encoding', label: 'Decode HTML entities', run: (t) => { const r = unescapeText(t, 'html'); return r.ok ? ok(r.text) : fail(r.error); } },

  { id: 'jwt-payload', group: 'JSON and data', label: 'JWT payload', run: (t) => { const r = decodeJwt(t); return r.ok ? ok(r.jwt.payloadText) : fail(r.message); } },
  { id: 'jwt-header', group: 'JSON and data', label: 'JWT header', run: (t) => { const r = decodeJwt(t); return r.ok ? ok(r.jwt.headerText) : fail(r.message); } },
  { id: 'json-format', group: 'JSON and data', label: 'Format JSON', run: (t) => {
    const r = formatJson(t, 2);
    return r.ok ? ok(r.output) : fail(`Line ${r.error.line}, column ${r.error.column}: ${r.error.message}`);
  } },
  { id: 'json-minify', group: 'JSON and data', label: 'Minify JSON', run: (t) => {
    const r = minifyJson(t);
    return r.ok ? ok(r.output) : fail(`Line ${r.error.line}, column ${r.error.column}: ${r.error.message}`);
  } },
  { id: 'yaml-json', group: 'JSON and data', label: 'YAML to JSON', run: (t) => convert(t, 'yaml', 'json') },
  { id: 'json-yaml', group: 'JSON and data', label: 'JSON to YAML', run: (t) => convert(t, 'json', 'yaml') },
  { id: 'csv-json', group: 'JSON and data', label: 'CSV to JSON', run: (t) => convert(t, 'csv', 'json') },
  { id: 'json-csv', group: 'JSON and data', label: 'JSON to CSV', run: (t) => convert(t, 'json', 'csv') },
  { id: 'xml-json', group: 'JSON and data', label: 'XML to JSON', run: (t) => convert(t, 'xml', 'json') },

  { id: 'sha256', group: 'Hash', label: 'SHA-256', run: async (t) => ok((await hashText(t))['sha256']) },
  { id: 'md5', group: 'Hash', label: 'MD5', run: async (t) => ok((await hashText(t))['md5']) },

  { id: 'trim', group: 'Text', label: 'Trim lines and drop empty ones', run: lines({ trim: true, removeEmpty: true }) },
  { id: 'sort', group: 'Text', label: 'Sort lines', run: lines({ sort: 'natural' }) },
  { id: 'unique', group: 'Text', label: 'Remove duplicate lines', run: lines({ unique: true }) },
  { id: 'lower', group: 'Text', label: 'Lowercase', run: (t) => ok(t.toLowerCase()) },
  { id: 'upper', group: 'Text', label: 'Uppercase', run: (t) => ok(t.toUpperCase()) },
];

export const stepById = (id: string) => STEPS.find((s) => s.id === id);

export interface StepOutput {
  step: Step;
  result: StepResult;
}

/** Runs the steps in order. After a failed step the rest are not run. */
export async function runRecipe(input: string, ids: string[]): Promise<StepOutput[]> {
  const out: StepOutput[] = [];
  let text = input;
  for (const id of ids) {
    const step = stepById(id);
    if (!step) continue;
    let result: StepResult;
    try {
      result = await step.run(text);
    } catch (error) {
      result = fail((error as Error).message || 'This step failed.');
    }
    out.push({ step, result });
    if (!result.ok) break;
    text = result.text;
  }
  return out;
}

/** Ready-made recipes for everyday chores. */
export const RECIPES: { name: string; steps: string[]; sample: string }[] = [
  { name: 'Read a Base64 JSON value', steps: ['b64-decode', 'json-format'], sample: 'eyJ1c2VyIjoiYXNoYSIsInJvbGVzIjpbImFkbWluIl0sImV4cCI6MTc5MzUwMDAwMH0=' },
  { name: 'Read a URL-encoded JSON parameter', steps: ['url-decode', 'json-format'], sample: '%7B%22page%22%3A2%2C%22filter%22%3A%7B%22status%22%3A%22paid%22%7D%7D' },
  { name: 'JWT payload as YAML', steps: ['jwt-payload', 'json-yaml'], sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFzaGEiLCJpYXQiOjE1MTYyMzkwMjJ9.ZyBbTWNIC3y7IbPqHn5ULUlz9ZLvYiEBuJ0O_dLyE2I' },
  { name: 'Unwrap JSON stored as a string in a log', steps: ['json-unescape', 'json-format'], sample: '"{\\"event\\":\\"order.paid\\",\\"amount\\":499,\\"items\\":[\\"BK-1\\"]}"' },
  { name: 'YAML config to one-line JSON', steps: ['yaml-json', 'json-minify'], sample: 'server:\n  port: 8080\n  hosts: [a.example.com, b.example.com]\n' },
  { name: 'Clean a list: trim, de-duplicate, sort', steps: ['trim', 'unique', 'sort'], sample: '  banana\napple\n\nbanana\ncherry  \n' },
  { name: 'JSON to Base64 for a header or env var', steps: ['json-minify', 'b64-encode'], sample: '{\n  "user": "asha",\n  "roles": ["admin"]\n}' },
  { name: 'CSV to formatted JSON', steps: ['csv-json', 'json-format'], sample: 'id,name,city\n1,Asha,Pune\n2,Ravi,Delhi\n' },
];
