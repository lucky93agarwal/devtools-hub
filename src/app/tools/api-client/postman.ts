import { ApiRequest, Auth, Collection, Folder, KeyValue, METHODS, Method, newId, newRequest } from './model';

/**
 * Postman collections (format v2.1, and v2.0) in and out, so people can bring
 * their saved requests over and take them back.
 */

interface PostmanKeyValue {
  key?: string;
  value?: unknown;
  disabled?: boolean;
  type?: string;
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  auth?: PostmanAuth;
  variable?: PostmanKeyValue[];
}

interface PostmanRequest {
  method?: string;
  url?: string | { raw?: string };
  header?: PostmanKeyValue[] | string;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: PostmanKeyValue[];
    formdata?: PostmanKeyValue[];
    options?: { raw?: { language?: string } };
  };
  auth?: PostmanAuth;
}

/** v2.1 keeps auth settings as lists of {key, value}; v2.0 as plain objects. */
interface PostmanAuth {
  type?: string;
  [type: string]: unknown;
}

export const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const rows = (list: PostmanKeyValue[] | undefined): KeyValue[] =>
  (list ?? [])
    .filter((row) => row.type !== 'file')
    .map((row) => ({ key: String(row.key ?? ''), value: String(row.value ?? ''), enabled: !row.disabled }));

function authSetting(auth: PostmanAuth, name: string): string {
  const settings = auth[auth.type ?? ''];
  if (Array.isArray(settings)) {
    const found = (settings as PostmanKeyValue[]).find((row) => row.key === name);
    return found ? String(found.value ?? '') : '';
  }
  if (settings && typeof settings === 'object') return String((settings as Record<string, unknown>)[name] ?? '');
  return '';
}

/** Auth for a request; `undefined` means "inherit from the folder or collection". */
function readAuth(auth: PostmanAuth | undefined): Auth | undefined {
  if (!auth?.type) return undefined;
  switch (auth.type) {
    case 'noauth':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: authSetting(auth, 'token') };
    case 'basic':
      return { type: 'basic', username: authSetting(auth, 'username'), password: authSetting(auth, 'password') };
    case 'apikey':
      return {
        type: 'api-key',
        key: authSetting(auth, 'key') || 'X-API-Key',
        value: authSetting(auth, 'value'),
        addTo: authSetting(auth, 'in') === 'query' ? 'query' : 'header',
      };
    default:
      // OAuth, AWS and others are not supported; the request is imported without auth.
      return { type: 'none' };
  }
}

function readRequest(item: PostmanItem, inherited: Auth): ApiRequest {
  const source: PostmanRequest = typeof item.request === 'string' ? { url: item.request } : (item.request ?? {});
  const method = String(source.method ?? 'GET').toUpperCase();
  const url = typeof source.url === 'string' ? source.url : (source.url?.raw ?? '');
  const headers = Array.isArray(source.header) ? rows(source.header) : [];
  const request = newRequest({
    name: item.name ?? 'Request',
    method: (METHODS as readonly string[]).includes(method) ? (method as Method) : 'GET',
    url,
    headers,
    auth: readAuth(source.auth) ?? inherited,
  });
  const body = source.body;
  if (body?.mode === 'raw' && body.raw) {
    const isJson =
      body.options?.raw?.language === 'json' ||
      headers.some((h) => h.key.toLowerCase() === 'content-type' && /json/i.test(h.value));
    request.body = { mode: isJson ? 'json' : 'text', raw: body.raw, fields: [] };
  } else if (body?.mode === 'urlencoded') {
    request.body = { mode: 'urlencoded', raw: '', fields: rows(body.urlencoded) };
  } else if (body?.mode === 'formdata') {
    request.body = { mode: 'form-data', raw: '', fields: rows(body.formdata) };
  }
  return request;
}

function readFolder(item: PostmanItem, inherited: Auth): Folder {
  const auth = readAuth(item.auth) ?? inherited;
  const folder: Folder = { id: newId(), name: item.name ?? 'Folder', requests: [], folders: [] };
  for (const child of item.item ?? []) {
    if (Array.isArray(child.item)) folder.folders.push(readFolder(child, auth));
    else folder.requests.push(readRequest(child, auth));
  }
  return folder;
}

export interface ImportResult {
  collection: Collection;
  requests: number;
  /** Things that could not be brought over, for a note to the user. */
  skipped: string[];
}

export function importPostman(json: string): ImportResult {
  let data: { info?: { name?: string; schema?: string }; item?: PostmanItem[]; variable?: PostmanKeyValue[]; auth?: PostmanAuth };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!data || !Array.isArray(data.item) || !data.info) {
    throw new Error('This is not a Postman collection. Export it from Postman as "Collection v2.1".');
  }
  const skipped = new Set<string>();
  const scan = (items: PostmanItem[]) => {
    for (const item of items) {
      if (Array.isArray(item.item)) scan(item.item);
      const request = typeof item.request === 'object' ? item.request : undefined;
      const type = request?.auth?.type ?? item.auth?.type;
      if (type && !['noauth', 'bearer', 'basic', 'apikey'].includes(type)) skipped.add(`${type} auth`);
      if (request?.body?.formdata?.some((f) => f.type === 'file')) skipped.add('file uploads in form-data');
      if (request?.body?.mode === 'file' || request?.body?.mode === 'graphql') skipped.add(`${request.body.mode} bodies`);
    }
  };
  scan(data.item);
  const folder = readFolder({ name: data.info.name ?? 'Imported collection', item: data.item, auth: data.auth }, { type: 'none' });
  const count = (f: Folder): number => f.requests.length + f.folders.reduce((sum, child) => sum + count(child), 0);
  return { collection: { ...folder, variables: rows(data.variable) }, requests: count(folder), skipped: [...skipped] };
}

function writeAuth(auth: Auth): PostmanAuth {
  switch (auth.type) {
    case 'none':
      return { type: 'noauth' };
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.token, type: 'string' }] };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username, type: 'string' },
          { key: 'password', value: auth.password, type: 'string' },
        ],
      };
    case 'api-key':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.key, type: 'string' },
          { key: 'value', value: auth.value, type: 'string' },
          { key: 'in', value: auth.addTo, type: 'string' },
        ],
      };
  }
}

const writeRows = (list: KeyValue[]) => list.map((row) => ({ key: row.key, value: row.value, ...(row.enabled ? {} : { disabled: true }) }));

function writeRequest(request: ApiRequest): PostmanItem {
  const body = request.body;
  const out: PostmanRequest = {
    method: request.method,
    header: writeRows(request.headers),
    url: { raw: request.url },
    auth: writeAuth(request.auth),
  };
  if (body.mode === 'json' || body.mode === 'text') {
    out.body = { mode: 'raw', raw: body.raw, ...(body.mode === 'json' ? { options: { raw: { language: 'json' } } } : {}) };
  } else if (body.mode === 'urlencoded') {
    out.body = { mode: 'urlencoded', urlencoded: writeRows(body.fields) };
  } else if (body.mode === 'form-data') {
    out.body = { mode: 'formdata', formdata: body.fields.map((f) => ({ ...writeRows([f])[0], type: 'text' })) };
  }
  return { name: request.name, request: out };
}

function writeFolder(folder: Folder): PostmanItem[] {
  return [
    ...folder.folders.map((child) => ({ name: child.name, item: writeFolder(child) })),
    ...folder.requests.map(writeRequest),
  ];
}

/** A Postman v2.1 collection file. */
export function exportPostman(collection: Collection): string {
  const data = {
    info: { name: collection.name, schema: POSTMAN_SCHEMA },
    item: writeFolder(collection),
    variable: writeRows(collection.variables),
  };
  return JSON.stringify(data, null, 2) + '\n';
}
