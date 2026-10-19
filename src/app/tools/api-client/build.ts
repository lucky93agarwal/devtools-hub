import { Auth, SIGNED_TYPES, authText, mapAuthText } from './auth';
import { fileFor } from './body-files';
import { ApiRequest, KeyValue, RAW_LANGUAGES, isForbiddenHeader, normalizeBody } from './model';

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

/**
 * Params after the URL was edited: the URL's params (keeping each one's
 * description where the key matches), followed by the unticked rows, which the
 * URL does not hold.
 */
export function mergeUrlParams(url: string, previous: KeyValue[]): KeyValue[] {
  const fromUrl = paramsFromUrl(url);
  const pool = previous.filter((p) => p.enabled);
  const merged = fromUrl.map((param) => {
    const index = pool.findIndex((p) => p.key === param.key);
    const description = index >= 0 ? pool.splice(index, 1)[0].description : undefined;
    return description ? { ...param, description } : param;
  });
  return [...merged, ...previous.filter((p) => !p.enabled)];
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
  /** form-data file fields as [name, file name], for cURL and code. */
  formFiles?: [string, string][];
  /** The file name of a binary body, for cURL and code. */
  bodyFile?: string;
  /** Files that were chosen before a reload and must be chosen again. */
  missingFiles?: string[];
  /** Why the body cannot be sent, such as GraphQL variables that are not valid JSON. */
  bodyError?: string;
  /** Header names the browser will not let a page set. */
  dropped: string[];
  /** {{names}} with no value. */
  unresolved: string[];
  /** Auth to add when sending (see sign.ts), with variables filled in. */
  signWith?: Auth;
}

/**
 * Everything fetch() needs, with variables filled in and simple auth applied.
 * `auth` is the auth that applies (a folder's or collection's when the request
 * inherits); auth that must be signed is left in `signWith` for sending.
 */
export function prepareRequest(
  request: ApiRequest,
  variables: Map<string, string>,
  auth: Auth = request.auth,
): PreparedRequest {
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

  track(authText(auth));
  const filled = mapAuthText(auth, fill);
  let signWith: Auth | undefined;
  if (filled.type === 'bearer' && filled.token) {
    addHeader('Authorization', `Bearer ${filled.token}`);
  } else if (filled.type === 'basic' && (filled.username || filled.password)) {
    addHeader('Authorization', `Basic ${base64(`${filled.username}:${filled.password}`)}`);
  } else if (filled.type === 'api-key' && filled.key) {
    if (filled.addTo === 'header') addHeader(filled.key, filled.value);
    else url = appendQuery(url, filled.key, filled.value);
  } else if (filled.type === 'oauth2' && filled.accessToken) {
    if (filled.addTo === 'header') addHeader('Authorization', `${filled.headerPrefix} ${filled.accessToken}`.trim());
    else url = appendQuery(url, 'access_token', filled.accessToken);
  } else if (SIGNED_TYPES.includes(filled.type) || filled.type === 'ntlm') {
    signWith = filled;
  }

  const has = (name: string) => headers.some(([key]) => key.toLowerCase() === name);
  const contentType = (value: string) => {
    if (!has('content-type')) headers.push(['Content-Type', value]);
  };
  let body: BodyInit | null = null;
  let bodyText: string | null = null;
  const formFields: [string, string][] = [];
  const formFiles: [string, string][] = [];
  const missingFiles: string[] = [];
  let bodyFile: string | undefined;
  let bodyError: string | undefined;
  const sendsBody = request.method !== 'GET' && request.method !== 'HEAD';
  const normalized = normalizeBody(request.body);
  // A GraphQL request always sends its query, whatever body mode it was saved with.
  const { mode, raw, language, fields, file, graphql } = request.kind === 'graphql' ? { ...normalized, mode: 'graphql' as const } : normalized;
  if (sendsBody && mode === 'raw') {
    track(raw);
    bodyText = fill(raw);
    body = bodyText;
    contentType(RAW_LANGUAGES.find((item) => item.value === language)?.contentType ?? 'text/plain');
  } else if (sendsBody && mode === 'graphql') {
    track(graphql.query + graphql.variables);
    const variablesText = fill(graphql.variables).trim();
    let variables: unknown;
    try {
      variables = variablesText ? JSON.parse(variablesText) : undefined;
    } catch {
      bodyError = 'The GraphQL variables are not valid JSON.';
    }
    bodyText = JSON.stringify(variables === undefined ? { query: fill(graphql.query) } : { query: fill(graphql.query), variables });
    body = bodyText;
    contentType('application/json');
  } else if (sendsBody && mode === 'binary') {
    const chosen = fileFor(file);
    if (file && !chosen) missingFiles.push(file.name);
    if (chosen) {
      body = chosen;
      bodyFile = chosen.name;
      contentType(chosen.type || 'application/octet-stream');
    }
  } else if (sendsBody && (mode === 'urlencoded' || mode === 'form-data')) {
    const form = new FormData();
    for (const field of fields) {
      if (!field.enabled || !field.key) continue;
      if (mode === 'form-data' && field.type === 'file') {
        const chosen = fileFor(field.file);
        if (!chosen) {
          missingFiles.push(field.file?.name ?? field.key);
          continue;
        }
        track(field.key);
        form.append(fill(field.key), chosen, chosen.name);
        formFiles.push([fill(field.key), chosen.name]);
        continue;
      }
      track(field.key + field.value);
      formFields.push([fill(field.key), fill(field.value)]);
      form.append(fill(field.key), fill(field.value));
    }
    if (mode === 'urlencoded') {
      bodyText = new URLSearchParams(formFields).toString();
      body = bodyText;
      contentType('application/x-www-form-urlencoded');
    } else {
      body = form;
    }
  }

  return {
    method: request.method,
    url,
    headers,
    body,
    bodyText,
    formFields,
    formFiles,
    bodyFile,
    missingFiles,
    bodyError,
    dropped,
    unresolved: [...unresolved],
    signWith,
  };
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
