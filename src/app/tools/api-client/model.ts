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
}

import type { Auth } from './auth';
export type { Auth } from './auth';

export type BodyMode = 'none' | 'json' | 'text' | 'urlencoded' | 'form-data';

export interface RequestBody {
  mode: BodyMode;
  /** Text for json and text. */
  raw: string;
  /** Fields for urlencoded and form-data. */
  fields: KeyValue[];
}

export interface ApiRequest {
  id: string;
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
    body: { mode: 'none', raw: '', fields: [] },
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
