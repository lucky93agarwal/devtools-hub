import { Auth, defaultAuth } from './auth';
import { paramsFromUrl } from './build';
import { ApiRequest, Collection, Folder, KeyValue, METHODS, Method, newId, newRequest } from './model';

/**
 * Postman collections (format v2.1, and v2.0) in and out, so people can bring
 * their saved requests over and take them back.
 */

interface PostmanKeyValue {
  key?: string;
  value?: unknown;
  disabled?: boolean;
  type?: string;
  description?: string | { content?: string };
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
  url?: string | { raw?: string; query?: PostmanKeyValue[] };
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

const descriptionOf = (row: PostmanKeyValue) =>
  typeof row.description === 'string' ? row.description : (row.description?.content ?? '');

const rows = (list: PostmanKeyValue[] | undefined): KeyValue[] =>
  (list ?? [])
    .filter((row) => row.type !== 'file')
    .map((row) => {
      const description = descriptionOf(row);
      const out: KeyValue = { key: String(row.key ?? ''), value: String(row.value ?? ''), enabled: !row.disabled };
      return description ? { ...out, description } : out;
    });

/** Postman's name for each of our auth types. */
const POSTMAN_TYPES: Record<Auth['type'], string> = {
  inherit: 'inherit',
  none: 'noauth',
  basic: 'basic',
  bearer: 'bearer',
  jwt: 'jwt',
  digest: 'digest',
  oauth1: 'oauth1',
  oauth2: 'oauth2',
  hawk: 'hawk',
  aws: 'awsv4',
  ntlm: 'ntlm',
  'api-key': 'apikey',
  edgegrid: 'edgegrid',
  asap: 'asap',
};

function settingsOf(auth: PostmanAuth): Record<string, string> {
  const settings = auth[auth.type ?? ''];
  const out: Record<string, string> = {};
  if (Array.isArray(settings)) {
    for (const row of settings as PostmanKeyValue[]) if (row.key) out[row.key] = String(row.value ?? '');
  } else if (settings && typeof settings === 'object') {
    for (const [key, value] of Object.entries(settings)) out[key] = String(value ?? '');
  }
  return out;
}

/** "1h", "30m" or "3600" as seconds. */
function seconds(text: string, fallback: number): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(text.trim());
  if (!match) return fallback;
  return Number(match[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[match[2]];
}

/** Auth from Postman; `undefined` means "inherit" (no auth set at this level). Unsupported types become none. */
function readAuth(auth: PostmanAuth | undefined, skipped: Set<string>): Auth | undefined {
  if (!auth?.type) return undefined;
  const s = settingsOf(auth);
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  switch (auth.type) {
    case 'inherit':
      return undefined;
    case 'noauth':
      return { type: 'none' };
    case 'basic':
      return { type: 'basic', username: s['username'] ?? '', password: s['password'] ?? '' };
    case 'bearer':
      return { type: 'bearer', token: s['token'] ?? '' };
    case 'apikey':
      return { type: 'api-key', key: s['key'] || 'X-API-Key', value: s['value'] ?? '', addTo: s['in'] === 'query' ? 'query' : 'header' };
    case 'jwt': {
      const base = defaultAuth('jwt') as Extract<Auth, { type: 'jwt' }>;
      return {
        ...base,
        algorithm: pick(s['algorithm'], ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'], 'HS256'),
        secret: s['secret'] ?? '',
        secretBase64: s['isSecretBase64Encoded'] === 'true',
        privateKey: s['privateKey'] ?? '',
        payload: s['payload'] ?? base.payload,
        header: s['header'] || '{}',
        prefix: s['headerPrefix'] ?? 'Bearer',
        addTo: s['addTokenTo'] === 'queryParam' ? 'query' : 'header',
        queryKey: s['queryParamKey'] || 'token',
      };
    }
    case 'digest':
      return {
        type: 'digest',
        username: s['username'] ?? '',
        password: s['password'] ?? '',
        realm: s['realm'] ?? '',
        nonce: s['nonce'] ?? '',
        algorithm: pick(s['algorithm'], ['MD5', 'MD5-sess', 'SHA-256', 'SHA-256-sess'], 'MD5'),
        qop: pick(s['qop'], ['', 'auth', 'auth-int'], 'auth'),
        nonceCount: s['nonceCount'] || '00000001',
        clientNonce: s['clientNonce'] ?? '',
        opaque: s['opaque'] ?? '',
      };
    case 'oauth1':
      return {
        type: 'oauth1',
        signatureMethod: pick(s['signatureMethod'], ['HMAC-SHA1', 'HMAC-SHA256', 'HMAC-SHA512', 'PLAINTEXT'], 'HMAC-SHA1'),
        consumerKey: s['consumerKey'] ?? '',
        consumerSecret: s['consumerSecret'] ?? '',
        token: s['token'] ?? '',
        tokenSecret: s['tokenSecret'] ?? '',
        realm: s['realm'] ?? '',
        addTo: s['addParamsToHeader'] === 'false' ? 'query' : 'header',
      };
    case 'oauth2': {
      const base = defaultAuth('oauth2') as Extract<Auth, { type: 'oauth2' }>;
      const grant = s['grant_type'];
      if (grant && !['client_credentials', 'password_credentials'].includes(grant)) skipped.add(`OAuth 2.0 "${grant}" token flow`);
      return {
        ...base,
        accessToken: s['accessToken'] ?? '',
        headerPrefix: s['headerPrefix'] ?? 'Bearer',
        addTo: s['addTokenTo'] === 'queryParams' ? 'query' : 'header',
        grantType: grant === 'password_credentials' ? 'password' : 'client_credentials',
        tokenUrl: s['accessTokenUrl'] ?? '',
        clientId: s['clientId'] ?? '',
        clientSecret: s['clientSecret'] ?? '',
        scope: s['scope'] ?? '',
        username: s['username'] ?? '',
        password: s['password'] ?? '',
        clientAuth: s['client_authentication'] === 'body' ? 'body' : 'header',
      };
    }
    case 'hawk':
      return {
        type: 'hawk',
        authId: s['authId'] ?? '',
        authKey: s['authKey'] ?? '',
        algorithm: s['algorithm'] === 'sha1' ? 'sha1' : 'sha256',
        user: s['user'] ?? '',
        ext: s['extraData'] ?? '',
        app: s['app'] ?? '',
        dlg: s['delegation'] ?? '',
        includePayloadHash: s['includePayloadHash'] === 'true',
      };
    case 'awsv4':
      return {
        type: 'aws',
        accessKey: s['accessKey'] ?? '',
        secretKey: s['secretKey'] ?? '',
        sessionToken: s['sessionToken'] ?? '',
        region: s['region'] || 'us-east-1',
        service: s['service'] || 'execute-api',
      };
    case 'ntlm':
      return { type: 'ntlm', username: s['username'] ?? '', password: s['password'] ?? '', domain: s['domain'] ?? '', workstation: s['workstation'] ?? '' };
    case 'edgegrid':
      return {
        type: 'edgegrid',
        accessToken: s['accessToken'] ?? '',
        clientToken: s['clientToken'] ?? '',
        clientSecret: s['clientSecret'] ?? '',
        headersToSign: s['headersToSign'] ?? '',
      };
    case 'asap':
      return {
        type: 'asap',
        algorithm: pick(s['alg'], ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'], 'RS256'),
        issuer: s['iss'] ?? '',
        subject: s['sub'] ?? '',
        audience: s['aud'] ?? '',
        keyId: s['kid'] ?? '',
        privateKey: s['privateKey'] ?? '',
        claims: s['claims'] || '{}',
        expiresIn: seconds(s['exp'] ?? '', 3600),
      };
    default:
      skipped.add(`${auth.type} auth`);
      return { type: 'none' };
  }
}

function readRequest(item: PostmanItem, skipped: Set<string>): ApiRequest {
  const source: PostmanRequest = typeof item.request === 'string' ? { url: item.request } : (item.request ?? {});
  const method = String(source.method ?? 'GET').toUpperCase();
  const url = typeof source.url === 'string' ? source.url : (source.url?.raw ?? '');
  const query = typeof source.url === 'object' && Array.isArray(source.url.query) ? rows(source.url.query) : paramsFromUrl(url);
  const headers = Array.isArray(source.header) ? rows(source.header) : [];
  const request = newRequest({
    name: item.name ?? 'Request',
    method: (METHODS as readonly string[]).includes(method) ? (method as Method) : 'GET',
    url,
    params: query,
    headers,
    // No auth on a Postman request means it inherits from its folder or collection.
    auth: readAuth(source.auth, skipped) ?? { type: 'inherit' },
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

function readFolder(item: PostmanItem, skipped: Set<string>): Folder {
  const folder: Folder = { id: newId(), name: item.name ?? 'Folder', requests: [], folders: [] };
  const auth = readAuth(item.auth, skipped);
  if (auth) folder.auth = auth;
  for (const child of item.item ?? []) {
    if (Array.isArray(child.item)) folder.folders.push(readFolder(child, skipped));
    else folder.requests.push(readRequest(child, skipped));
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
      if (request?.body?.formdata?.some((f) => f.type === 'file')) skipped.add('file uploads in form-data');
      if (request?.body?.mode === 'file' || request?.body?.mode === 'graphql') skipped.add(`${request.body.mode} bodies`);
    }
  };
  scan(data.item);
  const folder = readFolder({ name: data.info.name ?? 'Imported collection', item: data.item, auth: data.auth }, skipped);
  const count = (f: Folder): number => f.requests.length + f.folders.reduce((sum, child) => sum + count(child), 0);
  return { collection: { ...folder, variables: rows(data.variable) }, requests: count(folder), skipped: [...skipped] };
}

/** Our settings under Postman's key names. */
function postmanSettings(auth: Auth): Record<string, string | boolean> {
  switch (auth.type) {
    case 'inherit':
    case 'none':
      return {};
    case 'basic':
      return { username: auth.username, password: auth.password };
    case 'bearer':
      return { token: auth.token };
    case 'api-key':
      return { key: auth.key, value: auth.value, in: auth.addTo };
    case 'jwt':
      return {
        algorithm: auth.algorithm,
        secret: auth.secret,
        isSecretBase64Encoded: auth.secretBase64,
        privateKey: auth.privateKey,
        payload: auth.payload,
        header: auth.header,
        headerPrefix: auth.prefix,
        addTokenTo: auth.addTo === 'query' ? 'queryParam' : 'header',
        queryParamKey: auth.queryKey,
      };
    case 'digest':
      return {
        username: auth.username,
        password: auth.password,
        realm: auth.realm,
        nonce: auth.nonce,
        algorithm: auth.algorithm,
        qop: auth.qop,
        nonceCount: auth.nonceCount,
        clientNonce: auth.clientNonce,
        opaque: auth.opaque,
      };
    case 'oauth1':
      return {
        signatureMethod: auth.signatureMethod,
        consumerKey: auth.consumerKey,
        consumerSecret: auth.consumerSecret,
        token: auth.token,
        tokenSecret: auth.tokenSecret,
        realm: auth.realm,
        addParamsToHeader: auth.addTo === 'header',
        version: '1.0',
      };
    case 'oauth2':
      return {
        accessToken: auth.accessToken,
        headerPrefix: auth.headerPrefix,
        addTokenTo: auth.addTo === 'query' ? 'queryParams' : 'header',
        grant_type: auth.grantType === 'password' ? 'password_credentials' : 'client_credentials',
        accessTokenUrl: auth.tokenUrl,
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        scope: auth.scope,
        username: auth.username,
        password: auth.password,
        client_authentication: auth.clientAuth,
      };
    case 'hawk':
      return {
        authId: auth.authId,
        authKey: auth.authKey,
        algorithm: auth.algorithm,
        user: auth.user,
        extraData: auth.ext,
        app: auth.app,
        delegation: auth.dlg,
        includePayloadHash: auth.includePayloadHash,
      };
    case 'aws':
      return { accessKey: auth.accessKey, secretKey: auth.secretKey, sessionToken: auth.sessionToken, region: auth.region, service: auth.service };
    case 'ntlm':
      return { username: auth.username, password: auth.password, domain: auth.domain, workstation: auth.workstation };
    case 'edgegrid':
      return { accessToken: auth.accessToken, clientToken: auth.clientToken, clientSecret: auth.clientSecret, headersToSign: auth.headersToSign };
    case 'asap':
      return {
        alg: auth.algorithm,
        iss: auth.issuer,
        sub: auth.subject,
        aud: auth.audience,
        kid: auth.keyId,
        privateKey: auth.privateKey,
        claims: auth.claims,
        exp: String(auth.expiresIn),
      };
  }
}

/** Postman's auth object, or undefined to leave it out (inherit). */
function writeAuth(auth: Auth | undefined): PostmanAuth | undefined {
  if (!auth || auth.type === 'inherit') return undefined;
  const type = POSTMAN_TYPES[auth.type];
  if (auth.type === 'none') return { type };
  const settings = Object.entries(postmanSettings(auth)).map(([key, value]) => ({
    key,
    value,
    type: typeof value === 'boolean' ? 'boolean' : 'string',
  }));
  return { type, [type]: settings };
}

const writeRows = (list: KeyValue[]) =>
  list.map((row) => ({
    key: row.key,
    value: row.value,
    ...(row.description ? { description: row.description } : {}),
    ...(row.enabled ? {} : { disabled: true }),
  }));

function writeRequest(request: ApiRequest): PostmanItem {
  const body = request.body;
  const auth = writeAuth(request.auth);
  const out: PostmanRequest = {
    method: request.method,
    header: writeRows(request.headers),
    url: { raw: request.url, ...(request.params?.length ? { query: writeRows(request.params) } : {}) },
    ...(auth ? { auth } : {}),
  };
  if (body.mode === 'json' || body.mode === 'text') {
    out.body = { mode: 'raw', raw: body.raw, ...(body.mode === 'json' ? { options: { raw: { language: 'json' } } } : {}) };
  } else if (body.mode === 'urlencoded') {
    out.body = { mode: 'urlencoded', urlencoded: writeRows(body.fields) };
  } else if (body.mode === 'form-data') {
    out.body = { mode: 'formdata', formdata: writeRows(body.fields).map((f) => ({ ...f, type: 'text' })) };
  }
  return { name: request.name, request: out };
}

function writeFolder(folder: Folder): PostmanItem[] {
  return [
    ...folder.folders.map((child) => {
      const auth = writeAuth(child.auth);
      return { name: child.name, item: writeFolder(child), ...(auth ? { auth } : {}) };
    }),
    ...folder.requests.map(writeRequest),
  ];
}

/** A Postman v2.1 collection file. */
export function exportPostman(collection: Collection): string {
  const auth = writeAuth(collection.auth);
  const data = {
    info: { name: collection.name, schema: POSTMAN_SCHEMA },
    ...(auth ? { auth } : {}),
    item: writeFolder(collection),
    variable: writeRows(collection.variables),
  };
  return JSON.stringify(data, null, 2) + '\n';
}
