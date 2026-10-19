import { PreparedRequest } from './build';
import { ApiRequest, KeyValue, METHODS, Method, newRequest } from './model';

/** cURL commands in and out, and the same request as JavaScript fetch() code. */

/** Single-quotes a value for a POSIX shell. */
const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

export function toCurl(prepared: PreparedRequest): string {
  const lines = [`curl --request ${prepared.method} ${shellQuote(prepared.url)}`];
  for (const [name, value] of prepared.headers) lines.push(`--header ${shellQuote(`${name}: ${value}`)}`);
  if (prepared.bodyText !== null) lines.push(`--data-raw ${shellQuote(prepared.bodyText)}`);
  else if (prepared.bodyFile) lines.push(`--data-binary ${shellQuote(`@${prepared.bodyFile}`)}`);
  else {
    for (const [name, value] of prepared.formFields) lines.push(`--form ${shellQuote(`${name}=${value}`)}`);
    for (const [name, file] of prepared.formFiles ?? []) lines.push(`--form ${shellQuote(`${name}=@"${file}"`)}`);
  }
  return lines.join(' \\\n  ');
}

export function toFetchCode(prepared: PreparedRequest): string {
  const options: string[] = [`  method: ${JSON.stringify(prepared.method)},`];
  const formFiles = prepared.formFiles ?? [];
  const isForm = prepared.bodyText === null && (prepared.formFields.length > 0 || formFiles.length > 0);
  const headers = prepared.headers.filter(([name]) => !(isForm && /^content-type$/i.test(name)));
  if (headers.length) {
    options.push('  headers: {');
    for (const [name, value] of headers) options.push(`    ${JSON.stringify(name)}: ${JSON.stringify(value)},`);
    options.push('  },');
  }
  let before = '';
  if (prepared.bodyText !== null) {
    options.push(`  body: ${JSON.stringify(prepared.bodyText)},`);
  } else if (prepared.bodyFile) {
    before = `// ${prepared.bodyFile}: pick it with <input type="file" id="file">\nconst file = document.getElementById('file').files[0];\n\n`;
    options.push('  body: file,');
  } else if (isForm) {
    before =
      'const form = new FormData();\n' +
      [
        ...prepared.formFields.map(([n, v]) => `form.append(${JSON.stringify(n)}, ${JSON.stringify(v)});`),
        ...formFiles.map(([n, f]) => `form.append(${JSON.stringify(n)}, fileInput.files[0]); // ${f}`),
      ].join('\n') +
      '\n\n';
    options.push('  body: form,');
  }
  return (
    `${before}const response = await fetch(${JSON.stringify(prepared.url)}, {\n${options.join('\n')}\n});\n` +
    'console.log(response.status, await response.text());\n'
  );
}

/** Splits a command line like a shell: quotes, backslash escapes and line continuations. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;
  const text = command.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' '); // also Windows cmd "^" continuations
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) current += text[++i];
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      // $'…' (ANSI-C quoting) is read like '…'.
      if (ch === "'" && current.endsWith('$') && !started) current = current.slice(0, -1);
      quote = ch;
      started = true;
    } else if (ch === '\\' && i + 1 < text.length) {
      current += text[++i];
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current) words.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (quote) throw new Error('A quote in the command is never closed.');
  if (started || current) words.push(current);
  return words;
}

const FLAGS_WITH_VALUE = new Set(
  ('-X --request -H --header -d --data --data-raw --data-binary --data-ascii --data-urlencode -F --form ' +
    '--form-string -u --user --url -A --user-agent -b --cookie -e --referer -o --output --connect-timeout ' +
    '-m --max-time --retry -w --write-out --proxy -x --cert --key --cacert -T --upload-file')
    .split(' '),
);

/** Reads a cURL command, such as one copied from the browser's network panel or from Postman. */
export function parseCurl(command: string): ApiRequest {
  const words = shellWords(command.trim());
  if (words[0]?.toLowerCase() !== 'curl') throw new Error('Paste a command that starts with curl.');
  let method: string | null = null;
  let url = '';
  let forceGet = false;
  const headers: KeyValue[] = [];
  const data: string[] = [];
  const form: KeyValue[] = [];
  let user: string | null = null;

  for (let i = 1; i < words.length; i++) {
    let flag = words[i];
    let value: string | undefined;
    // --flag=value form
    const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
    if (eq > 0) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    } else if (/^-[A-Za-z]./.test(flag) && FLAGS_WITH_VALUE.has(flag.slice(0, 2))) {
      // -XPOST, -H'…' written together
      value = flag.slice(2);
      flag = flag.slice(0, 2);
    }
    if (!flag.startsWith('-')) {
      url ||= flag;
      continue;
    }
    if (FLAGS_WITH_VALUE.has(flag) && value === undefined) value = words[++i] ?? '';
    switch (flag) {
      case '-X':
      case '--request':
        method = value!.toUpperCase();
        break;
      case '--url':
        url = value!;
        break;
      case '-H':
      case '--header': {
        const colon = value!.indexOf(':');
        if (colon > 0) headers.push({ key: value!.slice(0, colon).trim(), value: value!.slice(colon + 1).trim(), enabled: true });
        break;
      }
      case '-A':
      case '--user-agent':
        headers.push({ key: 'User-Agent', value: value!, enabled: true });
        break;
      case '-b':
      case '--cookie':
        headers.push({ key: 'Cookie', value: value!, enabled: true });
        break;
      case '-e':
      case '--referer':
        headers.push({ key: 'Referer', value: value!, enabled: true });
        break;
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        data.push(value!);
        break;
      case '--data-urlencode': {
        const at = value!.indexOf('=');
        data.push(at >= 0 ? `${value!.slice(0, at)}=${encodeURIComponent(value!.slice(at + 1))}` : encodeURIComponent(value!));
        break;
      }
      case '-F':
      case '--form':
      case '--form-string': {
        const at = value!.indexOf('=');
        const fieldValue = value!.slice(at + 1);
        // -F 'photo=@cat.png' sends a file; the page cannot read it from disk, so it is chosen again.
        if (flag !== '--form-string' && fieldValue.startsWith('@')) {
          const name = fieldValue.slice(1).split(';')[0].replace(/^"|"$/g, '').split(/[\\/]/).pop() ?? '';
          form.push({ key: value!.slice(0, at), value: '', enabled: true, type: 'file', file: { id: '', name, size: 0, type: '' } });
        } else {
          form.push({ key: value!.slice(0, at), value: fieldValue, enabled: true });
        }
        break;
      }
      case '-u':
      case '--user':
        user = value!;
        break;
      case '-G':
      case '--get':
        forceGet = true;
        break;
      // Other flags (--compressed, -k, -L, -s, -i, -v…) change how curl runs, not the request.
    }
  }
  if (!url) throw new Error('The command has no URL.');

  const request = newRequest({ url, headers });
  if (forceGet && data.length) {
    request.url += (request.url.includes('?') ? '&' : '?') + data.join('&');
    data.length = 0;
  }
  const fallback = data.length || form.length ? 'POST' : 'GET';
  request.method = (METHODS as readonly string[]).includes(method ?? '') ? (method as Method) : fallback;

  if (form.length) {
    request.body = { ...request.body, mode: 'form-data', fields: form };
  } else if (data.length) {
    const raw = data.join('&');
    const type = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    const isJson = /json/i.test(type) || looksLikeJson(raw);
    if (isJson) {
      request.body = { ...request.body, mode: 'raw', language: 'json', raw: prettyJson(raw) };
    } else if (!type || /x-www-form-urlencoded/i.test(type)) {
      request.body = {
        ...request.body,
        mode: 'urlencoded',
        fields: [...new URLSearchParams(raw)].map(([key, value]) => ({ key, value, enabled: true })),
      };
    } else {
      const language = /xml/i.test(type) ? 'xml' : /html/i.test(type) ? 'html' : /javascript/i.test(type) ? 'javascript' : 'text';
      request.body = { ...request.body, mode: 'raw', language, raw };
    }
  }
  if (user !== null) {
    const colon = user.indexOf(':');
    request.auth = { type: 'basic', username: colon >= 0 ? user.slice(0, colon) : user, password: colon >= 0 ? user.slice(colon + 1) : '' };
  }
  request.name = nameFromUrl(request.url, request.method);
  return request;
}

function looksLikeJson(text: string): boolean {
  if (!/^\s*[[{]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** "GET /v1/users" style name from the URL's path. */
export function nameFromUrl(url: string, method: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] || '/';
  return `${method} ${path}`.slice(0, 80);
}
