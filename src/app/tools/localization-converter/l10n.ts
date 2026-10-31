/** App translation files: Android strings.xml, iOS Localizable.strings, JSON (flat or nested) and CSV. */

export type L10nFormat = 'android' | 'ios' | 'json' | 'csv';

export const L10N_FORMATS: { value: L10nFormat; label: string; extension: string }[] = [
  { value: 'android', label: 'Android strings.xml', extension: 'xml' },
  { value: 'ios', label: 'iOS Localizable.strings', extension: 'strings' },
  { value: 'json', label: 'JSON', extension: 'json' },
  { value: 'csv', label: 'CSV (key, value)', extension: 'csv' },
];

export interface Entry {
  key: string;
  value: string;
  comment?: string;
}

export type ParseResult = { ok: true; entries: Entry[]; notes: string[] } | { ok: false; error: string };

/** Android placeholders (%1$s, %d) and iOS ones (%1$@, %@) differ only for strings. */
const androidToIos = (v: string) => v.replace(/%(\d+\$)?s/g, (_, n = '') => `%${n}@`);
const iosToAndroid = (v: string) => v.replace(/%(\d+\$)?@/g, (_, n = '') => `%${n}s`);

function parseAndroid(text: string): ParseResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return { ok: false, error: 'This is not valid XML. Check that every tag is closed.' };
  const entries: Entry[] = [];
  const notes: string[] = [];
  const unescape = (v: string) => v.replace(/^"(.*)"$/s, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(['"@?\\])/g, '$1');
  for (const el of Array.from(doc.documentElement.children)) {
    const name = el.getAttribute('name');
    if (!name) continue;
    if (el.getAttribute('translatable') === 'false') notes.push(`${name} is marked translatable="false".`);
    if (el.tagName === 'string') entries.push({ key: name, value: unescape(el.textContent ?? '') });
    else if (el.tagName === 'plurals') {
      for (const item of Array.from(el.children)) entries.push({ key: `${name}_${item.getAttribute('quantity')}`, value: unescape(item.textContent ?? '') });
      notes.push(`Plurals "${name}" became one key per quantity (${name}_one, ${name}_other…).`);
    } else if (el.tagName === 'string-array') {
      Array.from(el.children).forEach((item, i) => entries.push({ key: `${name}_${i}`, value: unescape(item.textContent ?? '') }));
      notes.push(`Array "${name}" became numbered keys (${name}_0, ${name}_1…).`);
    }
  }
  return { ok: true, entries, notes };
}

function parseIos(text: string): ParseResult {
  const entries: Entry[] = [];
  const pattern = /(?:\/\*([\s\S]*?)\*\/\s*)?"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
  const unescape = (v: string) => v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(["\\])/g, '$1');
  for (const m of text.matchAll(pattern)) entries.push({ key: unescape(m[2]), value: iosToAndroid(unescape(m[3])), comment: m[1]?.trim() || undefined });
  if (!entries.length && text.trim()) return { ok: false, error: 'No "key" = "value"; lines were found.' };
  return { ok: true, entries, notes: [] };
}

function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `This is not valid JSON: ${(error as Error).message}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'The JSON must be an object of keys and texts.' };
  const entries: Entry[] = [];
  const walk = (value: unknown, path: string[]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
    else entries.push({ key: path.join('.'), value: String(value ?? '') });
  };
  walk(data, []);
  return { ok: true, entries, notes: [] };
}

function parseCsv(text: string): ParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const body = rows.filter((r) => r.some((c) => c.trim()));
  if (body[0] && /^key$/i.test(body[0][0])) body.shift();
  return { ok: true, entries: body.map((r) => ({ key: r[0], value: r[1] ?? '' })).filter((e) => e.key), notes: [] };
}

export function parseL10n(text: string, format: L10nFormat): ParseResult {
  if (!text.trim()) return { ok: true, entries: [], notes: [] };
  return { android: parseAndroid, ios: parseIos, json: parseJson, csv: parseCsv }[format](text);
}

/** Guesses the format of pasted translations. */
export function detectL10n(text: string): L10nFormat | null {
  const t = text.trim();
  if (t.startsWith('<')) return 'android';
  if (t.startsWith('{')) return 'json';
  if (/^(\/\*[\s\S]*?\*\/\s*)?"[^"]*"\s*=/.test(t)) return 'ios';
  if (t.includes(',')) return 'csv';
  return null;
}

/** Android resource names may only contain letters, digits and _. */
const androidName = (key: string) => key.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
const xmlEscape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/^@/, '\\@').replace(/^\?/, '\\?');

export function writeL10n(entries: Entry[], format: L10nFormat, nested = false): string {
  switch (format) {
    case 'android':
      return (
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' +
        entries.map((e) => `${e.comment ? `    <!-- ${e.comment.replace(/--/g, '- -')} -->\n` : ''}    <string name="${androidName(e.key)}">${xmlEscape(e.value)}</string>`).join('\n') +
        '\n</resources>\n'
      );
    case 'ios': {
      const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      return entries.map((e) => `${e.comment ? `/* ${e.comment} */\n` : ''}"${esc(e.key)}" = "${esc(androidToIos(e.value))}";`).join('\n') + '\n';
    }
    case 'json': {
      if (!nested) return JSON.stringify(Object.fromEntries(entries.map((e) => [e.key, e.value])), null, 2) + '\n';
      const root: Record<string, unknown> = {};
      for (const e of entries) {
        const parts = e.key.split('.');
        let node = root;
        parts.slice(0, -1).forEach((p) => (node = (node[p] ??= {}) as Record<string, unknown>));
        node[parts.at(-1)!] = e.value;
      }
      return JSON.stringify(root, null, 2) + '\n';
    }
    case 'csv': {
      const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      return ['key,value', ...entries.map((e) => `${cell(e.key)},${cell(e.value)}`)].join('\n') + '\n';
    }
  }
}
