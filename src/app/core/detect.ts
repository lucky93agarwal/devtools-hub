/**
 * Smart Paste: works out what pasted text is (a JWT, JSON, a cURL command, a timestamp…) and which tools can
 * open it. Each suggestion carries the data for the tool's shared-input handler (see shared-input.ts).
 */
import { SharedData } from './shared-input';

export interface Suggestion {
  /** Tool path. */
  path: string;
  /** Why it is suggested, e.g. "Decode this JWT". */
  action: string;
  data: SharedData;
}

export interface Detection {
  /** What the text looks like, e.g. "JSON Web Token". */
  kind: string;
  suggestions: Suggestion[];
}

const isJson = (text: string) => {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
};

function decodesToText(base64: string): boolean {
  try {
    const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !/[\u0000-\u0008\u000E-\u001F]/.test(text);
  } catch {
    return false;
  }
}

const CRON_FIELD = /^(\*|\?|[\d\w]+([-,/][\d\w*]+)*)(\/\d+)?$/i;

/** The most likely meaning first; an empty list for plain text that no tool recognises. */
export function detect(input: string): Detection[] {
  const text = input.trim();
  if (!text) return [];
  const found: Detection[] = [];
  const add = (kind: string, ...suggestions: Suggestion[]) => found.push({ kind, suggestions });
  const oneLine = !text.includes('\n');

  if (/^eyJ[\w-]+\.eyJ[\w-]*\.[\w-]*$/.test(text)) {
    add('JSON Web Token (JWT)', { path: 'jwt', action: 'Decode and verify this JWT', data: { token: text } });
  }
  if (/-----BEGIN (CERTIFICATE|CERTIFICATE REQUEST|NEW CERTIFICATE REQUEST)-----/.test(text)) {
    add('Certificate', { path: 'certificate-decoder', action: 'Read this certificate', data: { input: text } });
  }
  if (/^curl\s/i.test(text)) {
    add('cURL command', { path: 'curl-to-code', action: 'Turn it into code', data: { input: text } });
  }
  if (isJson(text)) {
    add(
      'JSON',
      { path: 'json-formatter', action: 'Format and validate', data: { input: text } },
      { path: 'json-query', action: 'Query it with JSONPath or jq', data: { json: text } },
      { path: 'json-to-code', action: 'Make model classes', data: { input: text } },
      { path: 'mock-data-generator', action: 'Make fake records like it', data: { input: text } },
    );
  } else if (/^[{[]/.test(text)) {
    add('Broken JSON', { path: 'json-formatter', action: 'Find the error', data: { input: text } });
  }
  if (oneLine && /^https?:\/\/\S+$/i.test(text)) {
    add('URL', { path: 'url-encoder', action: 'Split it into parts and parameters', data: { url: text } }, { path: 'qr-code-generator', action: 'Make a QR code', data: { input: text } });
  }
  if (oneLine && /^-?\d{9,19}(\.\d+)?$/.test(text)) {
    add('Unix timestamp', { path: 'timestamp-converter', action: 'Convert to a date', data: { input: text } });
  }
  if (oneLine && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) && !Number.isNaN(Date.parse(text))) {
    add('Date and time', { path: 'timestamp-converter', action: 'Convert to a Unix timestamp', data: { input: text } });
  }
  if (oneLine && (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/i.test(text) || ((f) => (f.length === 5 || f.length === 6) && f.every((x) => CRON_FIELD.test(x)) && f.some((x) => /[*/]/.test(x)))(text.split(/\s+/)))) {
    add('Cron expression', { path: 'cron-expression', action: 'Explain it and show the next runs', data: { input: text } });
  }
  if (oneLine && /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$|^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(text)) {
    add('UUID or ULID', { path: 'uuid-generator', action: 'See its version and time', data: { inspect: text } });
  }
  if (oneLine && /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|0x[0-9a-f]{8}|(rgba?|hsla?|oklch)\(.+\))$/i.test(text)) {
    add('Colour', { path: 'color-converter', action: 'Convert it and check contrast', data: { input: text } });
  }
  if (oneLine && /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f:]*::?[0-9a-f:]*(\/\d{1,3})?$/i.test(text) && text.includes(text.includes('.') ? '.' : ':')) {
    add('IP address or CIDR block', { path: 'cidr-calculator', action: 'Work out the range', data: { input: text } });
  }
  if (/^\s*(select|insert\s+into|update|delete\s+from|create\s+(table|view|index)|with\s+\w+\s+as|alter\s+table)\b/i.test(text)) {
    add('SQL', { path: 'sql-formatter', action: 'Format the query', data: { input: text } });
  }
  if (/^<\?xml|^<[a-z][\w:.-]*[\s>]/i.test(text) && !/^<(!doctype|html|head|body|div|span|p|a)\b/i.test(text)) {
    add('XML', { path: 'xml-formatter', action: 'Format and validate', data: { input: text } });
  }
  if (/^<(!doctype|html|head|body|div|span|p|a)\b/i.test(text)) {
    add('HTML', { path: 'code-beautifier', action: 'Beautify or minify', data: { input: text, language: 'html' } });
  }
  // .env names are almost always UPPER_CASE, which also keeps Base64 ending in = out.
  if (!isJson(text) && /^\s*(export\s+)?[A-Z_][A-Z0-9_]*=.*$/m.test(text) && text.split('\n').every((l) => !l.trim() || /^\s*(#|export\s+)?[A-Za-z_][\w.-]*=|^\s*#/.test(l) || /^\s/.test(l) || /"\s*$/.test(l))) {
    add('.env file', { path: 'env-converter', action: 'Convert to JSON, YAML or Kubernetes', data: { input: text } });
  }
  if (!isJson(text) && !found.some((f) => f.kind === '.env file') && /^(---\s*\n)?[\w"'-]+:\s.*$/m.test(text) && text.split('\n').length > 1) {
    add('YAML', { path: 'yaml-validator', action: 'Validate and format', data: { input: text } });
  }
  if (oneLine && /%[0-9a-f]{2}/i.test(text)) {
    add('URL-encoded text', { path: 'url-encoder', action: 'Decode it', data: { text, direction: 'decode' } });
  }
  if (oneLine && !found.length && text.length >= 12 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text) && text.replace(/=+$/, '').length % 4 !== 1 && decodesToText(text)) {
    add('Base64', { path: 'base64', action: 'Decode it', data: { input: text, mode: 'decode' } });
  }
  if (!found.length) {
    add(
      'Text',
      { path: 'case-converter', action: 'Change case, sort or count lines', data: { input: text } },
      { path: 'hash-generator', action: 'Make a hash', data: { input: text } },
      { path: 'base64', action: 'Encode as Base64', data: { input: text, mode: 'encode' } },
    );
  }
  return found;
}
