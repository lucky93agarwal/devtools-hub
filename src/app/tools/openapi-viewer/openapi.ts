/**
 * OpenAPI 3.x and Swagger 2.0 specs: endpoints, parameters and responses, a sample request per endpoint as cURL,
 * and checks for broken $refs, duplicate operationIds, undeclared path parameters and missing responses.
 */
import { parse } from 'yaml';
import { shellQuote } from '../api-client/curl';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export interface Param {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description: string;
}

export interface Operation {
  method: string;
  path: string;
  summary: string;
  operationId: string;
  tag: string;
  deprecated: boolean;
  params: Param[];
  bodyTypes: string[];
  responses: { code: string; description: string }[];
  curl: string;
}

export interface Issue {
  level: 'error' | 'warning' | 'tip';
  message: string;
}

export interface Spec {
  version: string;
  title: string;
  apiVersion: string;
  description: string;
  servers: string[];
  operations: Operation[];
  schemas: string[];
  issues: Issue[];
}

export type SpecResult = { ok: true; spec: Spec } | { ok: false; error: string };

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function resolve(root: Obj, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Obj)[key] : undefined), root);
}

const deref = (root: Obj, v: unknown): Obj => {
  let node = obj(v);
  for (let i = 0; i < 10 && typeof node['$ref'] === 'string'; i++) node = obj(resolve(root, node['$ref'] as string));
  return node;
};

/** A small example value for a schema, for sample request bodies. */
export function sample(root: Obj, schemaIn: unknown, depth = 0): unknown {
  const schema = deref(root, schemaIn);
  if (depth > 5) return null;
  if (schema['example'] !== undefined) return schema['example'];
  if (arr(schema['enum']).length) return arr(schema['enum'])[0];
  const all = arr(schema['allOf']);
  if (all.length) return Object.assign({}, ...all.map((s) => sample(root, s, depth + 1)));
  const one = arr(schema['oneOf'] ?? schema['anyOf']);
  if (one.length) return sample(root, one[0], depth + 1);
  const type = Array.isArray(schema['type']) ? (schema['type'] as string[]).find((t) => t !== 'null') : schema['type'];
  if (type === 'object' || schema['properties']) {
    return Object.fromEntries(Object.entries(obj(schema['properties'])).map(([k, v]) => [k, sample(root, v, depth + 1)]));
  }
  if (type === 'array') return [sample(root, schema['items'], depth + 1)];
  if (type === 'integer' || type === 'number') return schema['minimum'] ?? 0;
  if (type === 'boolean') return true;
  const format = str(schema['format']);
  return { 'date-time': '2026-01-01T00:00:00Z', date: '2026-01-01', email: 'user@example.com', uuid: '00000000-0000-4000-8000-000000000000', uri: 'https://example.com' }[format] ?? 'string';
}

export function parseSpec(text: string): SpecResult {
  let root: Obj;
  try {
    root = obj(parse(text));
  } catch (error) {
    return { ok: false, error: `This is not valid YAML or JSON: ${(error as Error).message.split('\n')[0]}` };
  }
  const issues: Issue[] = [];
  const oas3 = /^3\./.test(str(root['openapi']));
  const swagger2 = str(root['swagger']) === '2.0';
  if (!oas3 && !swagger2) return { ok: false, error: 'This is not an OpenAPI 3 or Swagger 2.0 document (no openapi: or swagger: field).' };
  const info = obj(root['info']);
  if (!info['title']) issues.push({ level: 'error', message: 'info.title is missing.' });
  if (!info['version']) issues.push({ level: 'error', message: 'info.version is missing.' });

  const servers = oas3
    ? arr(root['servers']).map((s) => str(obj(s)['url'])).filter(Boolean)
    : root['host']
      ? [`${str(arr(root['schemes'])[0] ?? 'https')}://${str(root['host'])}${str(root['basePath'])}`]
      : [];
  if (!servers.length) issues.push({ level: 'tip', message: 'No servers are listed, so tools do not know the base URL. Sample requests use https://api.example.com.' });
  const base = (servers[0] ?? 'https://api.example.com').replace(/\/$/, '');

  // Every local $ref must point at something.
  const walk = (node: unknown, at: string) => {
    if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${at}/${i}`));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === '$ref' && typeof v === 'string') {
          if (v.startsWith('#/') && resolve(root, v) === undefined) issues.push({ level: 'error', message: `${v} (used at ${at}) does not exist.` });
          else if (!v.startsWith('#/')) issues.push({ level: 'tip', message: `${v} points to another file, which is not checked here.` });
        } else walk(v, `${at}/${k}`);
      }
    }
  };
  walk(root, '#');

  const operations: Operation[] = [];
  const ids = new Map<string, number>();
  for (const [path, itemIn] of Object.entries(obj(root['paths']))) {
    const item = deref(root, itemIn);
    const pathParams = arr(item['parameters']).map((p) => deref(root, p));
    for (const method of METHODS.filter((m) => item[m])) {
      const op = obj(item[method]);
      const params = [...pathParams, ...arr(op['parameters']).map((p) => deref(root, p))];
      const unique = new Map(params.map((p) => [`${p['in']}:${p['name']}`, p]));
      const list: Param[] = [...unique.values()].map((p) => ({
        name: str(p['name']),
        in: str(p['in']),
        required: p['required'] === true,
        type: str(deref(root, p['schema'])['type'] ?? p['type']),
        description: str(p['description']),
      }));
      const id = str(op['operationId']);
      if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])) {
        if (!list.some((p) => p.in === 'path' && p.name === name)) issues.push({ level: 'error', message: `${method.toUpperCase()} ${path}: the path parameter {${name}} is not declared.` });
      }
      for (const p of list.filter((p) => p.in === 'path' && !path.includes(`{${p.name}}`))) {
        issues.push({ level: 'error', message: `${method.toUpperCase()} ${path}: path parameter ${p.name} is not in the path.` });
      }
      const responses = Object.entries(obj(op['responses'])).map(([code, r]) => ({ code, description: str(deref(root, r)['description']) }));
      if (!responses.length) issues.push({ level: 'error', message: `${method.toUpperCase()} ${path} has no responses.` });

      // A sample request: path parameters as placeholders, required query parameters and a JSON body.
      const body = oas3 ? obj(deref(root, op['requestBody'])['content']) : {};
      const bodyTypes = oas3 ? Object.keys(body) : params.some((p) => p['in'] === 'body') ? ['application/json'] : [];
      const bodySchema = oas3 ? obj(body['application/json'])['schema'] : params.find((p) => p['in'] === 'body')?.['schema'];
      const query = list.filter((p) => p.in === 'query' && p.required).map((p) => `${encodeURIComponent(p.name)}=${p.type === 'integer' || p.type === 'number' ? 1 : 'value'}`);
      const url = `${base}${path}${query.length ? `?${query.join('&')}` : ''}`;
      const curl = [`curl -X ${method.toUpperCase()} ${shellQuote(url)}`];
      for (const p of list.filter((p) => p.in === 'header')) curl.push(`  -H ${shellQuote(`${p.name}: value`)}`);
      if (bodySchema) curl.push(`  -H 'Content-Type: application/json'`, `  -d ${shellQuote(JSON.stringify(sample(root, bodySchema), null, 2))}`);
      operations.push({
        method: method.toUpperCase(),
        path,
        summary: str(op['summary'] ?? op['description']).split('\n')[0],
        operationId: id,
        tag: str(arr(op['tags'])[0]) || 'Other',
        deprecated: op['deprecated'] === true,
        params: list.filter((p) => p.in !== 'body'),
        bodyTypes,
        responses,
        curl: curl.join(' \\\n'),
      });
    }
  }
  for (const [id, count] of ids) if (count > 1) issues.push({ level: 'error', message: `operationId “${id}” is used ${count} times; it must be unique.` });
  if (!operations.length) issues.push({ level: 'warning', message: 'The document has no operations under paths.' });
  const schemas = Object.keys(oas3 ? obj(obj(root['components'])['schemas']) : obj(root['definitions']));
  return {
    ok: true,
    spec: {
      version: oas3 ? `OpenAPI ${str(root['openapi'])}` : 'Swagger 2.0',
      title: str(info['title']),
      apiVersion: str(info['version']),
      description: str(info['description']),
      servers,
      operations,
      schemas,
      issues,
    },
  };
}
