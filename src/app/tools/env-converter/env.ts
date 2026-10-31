/** .env files (dotenv rules) to and from JSON, YAML, shell, Docker Compose and Kubernetes. */
import { words } from '../case-converter/text-case';

export interface EnvEntry {
  key: string;
  value: string;
  line: number;
}

export interface EnvIssue {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParsedEnv {
  entries: EnvEntry[];
  issues: EnvIssue[];
}

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', $: '$' };

/** Reads a .env file the way dotenv does: comments, export, quotes, multi-line values and inline comments. */
export function parseEnv(text: string): ParsedEnv {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const entries: EnvEntry[] = [];
  const issues: EnvIssue[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    const body = raw.replace(/^export\s+/, '');
    const eq = body.indexOf('=');
    if (eq < 0) {
      issues.push({ line: lineNo, severity: 'error', message: `No = sign. Write it as ${body.split(/\s/)[0] || 'KEY'}=value.` });
      continue;
    }
    const key = body.slice(0, eq).trim();
    if (!KEY.test(key)) {
      issues.push({ line: lineNo, severity: 'error', message: `“${key}” is not a valid name. Use letters, digits and _, not starting with a digit.` });
      continue;
    }
    let rest = body.slice(eq + 1).trimStart();
    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      // A quoted value may continue over the next lines until its closing quote.
      let text = rest.slice(1);
      let end = closingQuote(text, quote);
      while (end < 0 && i + 1 < lines.length) {
        text += '\n' + lines[++i];
        end = closingQuote(text, quote);
      }
      if (end < 0) {
        issues.push({ line: lineNo, severity: 'error', message: `The ${quote === '"' ? 'double' : quote === "'" ? 'single' : 'back'} quote is never closed.` });
        continue;
      }
      value = text.slice(0, end);
      if (quote === '"') value = value.replace(/\\(.)/g, (m, c) => ESCAPES[c] ?? m);
      const after = text.slice(end + 1).trim();
      if (after && !after.startsWith('#')) {
        issues.push({ line: lineNo, severity: 'warning', message: `Text after the closing quote is ignored: ${after}` });
      }
    } else {
      value = rest.replace(/\s+#.*$/, '').trim();
      if (/\s/.test(value)) issues.push({ line: lineNo, severity: 'warning', message: `${key} has spaces but no quotes. Some tools will cut it at the first space.` });
    }
    if (seen.has(key)) {
      issues.push({ line: lineNo, severity: 'warning', message: `${key} was already set on line ${seen.get(key)}. The last value wins.` });
      const index = entries.findIndex((e) => e.key === key);
      entries.splice(index, 1);
    }
    seen.set(key, lineNo);
    entries.push({ key, value, line: lineNo });
  }
  return { entries, issues };
}

function closingQuote(text: string, quote: string): number {
  for (let i = 0; i < text.length; i++) {
    if (quote === '"' && text[i] === '\\') i++;
    else if (text[i] === quote) return i;
  }
  return -1;
}

export type EnvTarget = 'json' | 'yaml' | 'shell' | 'compose' | 'configmap' | 'secret';

export const ENV_TARGETS: { value: EnvTarget; label: string; extension: string }[] = [
  { value: 'json', label: 'JSON', extension: 'json' },
  { value: 'yaml', label: 'YAML', extension: 'yaml' },
  { value: 'shell', label: 'Shell export', extension: 'sh' },
  { value: 'compose', label: 'Docker Compose', extension: 'yaml' },
  { value: 'configmap', label: 'Kubernetes ConfigMap', extension: 'yaml' },
  { value: 'secret', label: 'Kubernetes Secret', extension: 'yaml' },
];

/** A YAML scalar: plain when that is safe, otherwise a JSON string, which YAML also reads. */
function yamlValue(value: string): string {
  const plain = /^[A-Za-z_./@][\w./@:-]*$/.test(value) && !/^(true|false|yes|no|on|off|null|~)$/i.test(value) && !value.includes(': ');
  return plain ? value : JSON.stringify(value);
}

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

export function convertEnv(entries: EnvEntry[], target: EnvTarget, name = 'app-config'): string {
  const pairs = entries.map((e) => [e.key, e.value] as const);
  const yamlMap = (indent: string, encode = (v: string) => yamlValue(v)) =>
    pairs.map(([k, v]) => `${indent}${yamlValue(k)}: ${encode(v)}`).join('\n');
  switch (target) {
    case 'json':
      return JSON.stringify(Object.fromEntries(pairs), null, 2) + '\n';
    case 'yaml':
      return (pairs.length ? yamlMap('') : '{}') + '\n';
    case 'shell':
      return pairs.map(([k, v]) => `export ${k}=${shellQuote(v)}`).join('\n') + '\n';
    case 'compose':
      return `services:\n  app:\n    environment:\n${yamlMap('      ')}\n`;
    case 'configmap':
      return `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\ndata:\n${yamlMap('  ', (v) => JSON.stringify(v))}\n`;
    case 'secret':
      return `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}\ntype: Opaque\ndata:\n${yamlMap('  ', base64)}\n`;
  }
}

/** A value as it should appear in a .env file, quoted only when needed. */
export function envValue(value: string): string {
  if (/^[\w./:@%+,-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

/** UPPER_SNAKE_CASE, the usual style for environment variables. */
export const envKey = (key: string) => words(key).join('_').toUpperCase() || key;

/**
 * Flattens an object into .env lines: nested keys are joined with _ (db.host becomes DB_HOST when upper is on),
 * arrays become JSON, null becomes an empty value.
 */
export function objectToEnv(data: unknown, upper: boolean): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The top level must be an object of names and values.');
  const lines: string[] = [];
  const walk = (value: unknown, path: string[]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
      return;
    }
    const key = upper ? path.map(envKey).join('_') : path.join('_');
    const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    lines.push(`${key}=${envValue(text)}`);
  };
  walk(data, []);
  return lines.join('\n') + '\n';
}
