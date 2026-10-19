import { ApiRequest, KeyValue, isForbiddenHeader } from './model';

/** Splitting the URL into editable params and back, {{variables}}, and the final fetch() call. */

/** The query params of a URL as rows. Works on URLs with {{variables}} and without a scheme. */
export function paramsFromUrl(url: string): KeyValue[] {
  const query = url.split('#')[0].split('?').slice(1).join('?');
  if (!query) return [];
  return query.split('&').map((part) => {
    const [key, ...rest] = part.split('=');
    return { key: safeDecode(key), value: safeDecode(rest.join('=')), enabled: true };
  });
}

/** The URL with its query string rebuilt from the enabled rows (as in Postman, unticked rows drop out). */
export function urlWithParams(url: string, params: KeyValue[]): string {
  const [beforeHash, ...hash] = url.split('#');
  const base = beforeHash.split('?')[0];
  const query = params
    .filter((p) => p.enabled && p.key)
    .map((p) => (p.value === '' ? encodeLoosely(p.key) : `${encodeLoosely(p.key)}=${encodeLoosely(p.value)}`))
    .join('&');
  return base + (query ? `?${query}` : '') + (hash.length ? `#${hash.join('#')}` : '');
}

/** Encodes for a query string but leaves {{variables}} readable. */
function encodeLoosely(text: string): string {
  return text
    .split(/(\{\{[^{}]+\}\})/)
    .map((part) => (/^\{\{[^{}]+\}\}$/.test(part) ? part : encodeURIComponent(part)))
    .join('');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** Replaces {{name}} with the variable's value; unknown names are left as they are. */
export function resolveVariables(text: string, variables: Map<string, string>): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => variables.get(name) ?? match);
}

/** Variables still unresolved in a text, for a warning before sending. */
export function unresolvedVariables(text: string, variables: Map<string, string>): string[] {
  return [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]).filter((name) => !variables.has(name));
}

/** Enabled variables, later lists winning (collection, then environment). */
export function variableMap(...lists: KeyValue[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of lists) for (const row of list) if (row.enabled && row.key) map.set(row.key.trim(), row.value);
  return map;
}

export interface PreparedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: BodyInit | null;
  /** Body as text, for cURL and code; null for none, '<form-data>' fields listed separately. */
  bodyText: string | null;
  formFields: [string, string][];
  /** Header names the browser will not let a page set. */
  dropped: string[];
  /** {{names}} with no value. */
  unresolved: string[];
}

/** Everything fetch() needs, with variables filled in and auth applied. */
export function prepareRequest(request: ApiRequest, variables: Map<string, string>): PreparedRequest {
  const fill = (text: string) => resolveVariables(text, variables);
  const unresolved = new Set<string>();
  const track = (text: string) => unresolvedVariables(text, variables).forEach((name) => unresolved.add(name));

  track(request.url);
  let url = fill(request.url.trim());
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;

  const headers: [string, string][] = [];
  const dropped: string[] = [];
  const addHeader = (name: string, value: string) => {
    if (isForbiddenHeader(name)) dropped.push(name);
    else headers.push([name, value]);
  };
  for (const row of request.headers) {
    if (!row.enabled || !row.key.trim()) continue;
    track(row.key + row.value);
    addHeader(fill(row.key.trim()), fill(row.value));
  }

  const auth = request.auth;
  if (auth.type === 'bearer' && auth.token) {
    track(auth.token);
    addHeader('Authorization', `Bearer ${fill(auth.token)}`);
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    track(auth.username + auth.password);
    addHeader('Authorization', `Basic ${base64(`${fill(auth.username)}:${fill(auth.password)}`)}`);
  } else if (auth.type === 'api-key' && auth.key) {
    track(auth.key + auth.value);
    if (auth.addTo === 'header') addHeader(fill(auth.key), fill(auth.value));
    else url = appendQuery(url, fill(auth.key), fill(auth.value));
  }

  const has = (name: string) => headers.some(([key]) => key.toLowerCase() === name);
  let body: BodyInit | null = null;
  let bodyText: string | null = null;
  const formFields: [string, string][] = [];
  const sendsBody = request.method !== 'GET' && request.method !== 'HEAD';
  const { mode, raw, fields } = request.body;
  if (sendsBody && (mode === 'json' || mode === 'text')) {
    track(raw);
    bodyText = fill(raw);
    body = bodyText;
    if (!has('content-type')) headers.push(['Content-Type', mode === 'json' ? 'application/json' : 'text/plain']);
  } else if (sendsBody && (mode === 'urlencoded' || mode === 'form-data')) {
    for (const field of fields) {
      if (!field.enabled || !field.key) continue;
      track(field.key + field.value);
      formFields.push([fill(field.key), fill(field.value)]);
    }
    if (mode === 'urlencoded') {
      bodyText = new URLSearchParams(formFields).toString();
      body = bodyText;
      if (!has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    } else {
      const form = new FormData();
      for (const [key, value] of formFields) form.append(key, value);
      body = form;
    }
  }

  return { method: request.method, url, headers, body, bodyText, formFields, dropped, unresolved: [...unresolved] };
}

function appendQuery(url: string, key: string, value: string): string {
  const [base, hash] = url.split('#');
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

/** UTF-8 safe base64, for Basic auth with non-ASCII passwords. */
export function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
