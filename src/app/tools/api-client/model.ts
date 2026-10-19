/** The data the API Client works with: requests, collections and environments. */

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type Method = (typeof METHODS)[number];

/** One row of params, headers, form fields or variables. Unticked rows are kept but not sent. */
export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  /** A note for people reading the request; never sent. */
  description?: string;
  /** form-data rows can send a file instead of text. */
  type?: 'text' | 'file';
  file?: BodyFile | null;
}

/**
 * A file chosen for a body. Only these details are saved; the file itself stays in
 * memory (see body-files.ts), so after a reload it has to be chosen again, as in Postman.
 */
export interface BodyFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

import type { Auth } from './auth';
export type { Auth } from './auth';

/** Postman's body types. */
export type BodyMode = 'none' | 'form-data' | 'urlencoded' | 'raw' | 'binary' | 'graphql';

export const RAW_LANGUAGES = [
  { value: 'text', label: 'Text', contentType: 'text/plain', editor: 'plaintext' },
  { value: 'javascript', label: 'JavaScript', contentType: 'application/javascript', editor: 'javascript' },
  { value: 'json', label: 'JSON', contentType: 'application/json', editor: 'json' },
  { value: 'html', label: 'HTML', contentType: 'text/html', editor: 'html' },
  { value: 'xml', label: 'XML', contentType: 'application/xml', editor: 'xml' },
] as const;
export type RawLanguage = (typeof RAW_LANGUAGES)[number]['value'];

export interface RequestBody {
  mode: BodyMode;
  /** Text for raw. */
  raw: string;
  /** What the raw text is; sets the Content-Type unless a header does. */
  language: RawLanguage;
  /** Fields for urlencoded and form-data. */
  fields: KeyValue[];
  /** The file for binary. */
  file: BodyFile | null;
  graphql: { query: string; variables: string };
}

export const emptyBody = (): RequestBody => ({
  mode: 'none',
  raw: '',
  language: 'json',
  fields: [],
  file: null,
  graphql: { query: '', variables: '' },
});

/** Fills in fields added later and turns the old "json" and "text" modes into raw. */
export function normalizeBody(body: Partial<RequestBody> & { mode?: string } = {}): RequestBody {
  const base = { ...emptyBody(), ...body } as RequestBody;
  const mode = body.mode as string | undefined;
  if (mode === 'json' || mode === 'text') return { ...base, mode: 'raw', language: mode };
  return { ...base, graphql: { ...emptyBody().graphql, ...body.graphql } };
}

/** What a request talks to: HTTP, GraphQL (sent over HTTP), or a live WebSocket or Socket.IO connection. */
export type RequestKind = 'http' | 'graphql' | 'websocket' | 'socketio';

export const REQUEST_KINDS: { value: RequestKind; label: string; badge: string }[] = [
  { value: 'http', label: 'HTTP', badge: 'HTTP' },
  { value: 'graphql', label: 'GraphQL', badge: 'GQL' },
  { value: 'websocket', label: 'WebSocket', badge: 'WS' },
  { value: 'socketio', label: 'Socket.IO', badge: 'SIO' },
];

/** Settings for WebSocket and Socket.IO requests. */
export interface RealtimeSettings {
  /** The message being written, as text or JSON. */
  message: string;
  format: 'text' | 'json';
  /** Socket.IO: the event to emit, and whether to wait for the server's acknowledgement. */
  event: string;
  ack: boolean;
  /** WebSocket: subprotocols, comma-separated. */
  protocols: string;
  /** Socket.IO: the server's path, and the handshake auth as JSON. */
  path: string;
  auth: string;
  /** Messages kept for sending again, as Postman's saved messages. */
  saved: { name: string; message: string; format: 'text' | 'json'; event: string }[];
}

export const defaultRealtime = (): RealtimeSettings => ({
  message: '',
  format: 'text',
  event: 'message',
  ack: false,
  protocols: '',
  path: '/socket.io',
  auth: '',
  saved: [],
});

/** WebSocket and Socket.IO keep a connection open; HTTP and GraphQL send one request at a time. */
export const isLiveKind = (kind: RequestKind | undefined) => kind === 'websocket' || kind === 'socketio';

export interface ApiRequest {
  id: string;
  /** Missing on requests saved before other kinds existed, which are HTTP. */
  kind?: RequestKind;
  realtime?: RealtimeSettings;
  name: string;
  method: Method;
  /** As typed, query string included; may contain {{variables}}. Holds only the ticked params. */
  url: string;
  /** All query params, ticked or not, with descriptions; the URL holds the ticked ones. */
  params: KeyValue[];
  headers: KeyValue[];
  auth: Auth;
  body: RequestBody;
}

export interface Folder {
  id: string;
  name: string;
  /** Auth for requests inside set to "Inherit auth from parent"; missing means inherit further up. */
  auth?: Auth;
  requests: ApiRequest[];
  folders: Folder[];
}

/** A collection is a top-level folder, as in Postman. Its variables apply to its requests. */
export interface Collection extends Folder {
  variables: KeyValue[];
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const emptyRow = (): KeyValue => ({ key: '', value: '', enabled: true });

export function newRequest(changes: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: newId(),
    name: 'New request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: emptyBody(),
    ...changes,
  };
}

/** A copy with fresh ids, so a saved request and its open copy can change separately. */
export function cloneRequest(request: ApiRequest, changes: Partial<ApiRequest> = {}): ApiRequest {
  return { ...structuredClone(request), id: newId(), ...changes };
}

/**
 * Headers a web page is not allowed to set; the browser drops or replaces them.
 * https://fetch.spec.whatwg.org/#forbidden-request-header
 */
const FORBIDDEN_HEADERS = new Set(
  ('accept-charset accept-encoding access-control-request-headers access-control-request-method connection ' +
    'content-length cookie cookie2 date dnt expect host keep-alive origin referer set-cookie te trailer ' +
    'transfer-encoding upgrade via user-agent')
    .split(' '),
);

export const isForbiddenHeader = (name: string) => {
  const lower = name.trim().toLowerCase();
  return FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-');
};
