/**
 * The collection runner: every HTTP and GraphQL request of a collection, in the order
 * the sidebar shows them, sent one after another like Postman's Collection Runner.
 */
import { prepareRequest, variableMap } from './build';
import { ApiRequest, Collection, Folder, KeyValue, isHttpKind } from './model';
import { ApiResponse, RequestFailure } from './sender';
import { AuthError, signRequest } from './sign';
import { inheritedAuth } from './store';

export interface RunItem {
  id: string;
  name: string;
  /** Folders above the request, joined with " / ". */
  folder: string;
  method: string;
  url: string;
  state: 'waiting' | 'running' | 'passed' | 'failed' | 'skipped';
  status?: number;
  ms?: number;
  size?: number;
  note?: string;
}

/** Requests in sidebar order (each folder's subfolders, then its requests), with their folder path. */
export function runOrder(collection: Collection): { request: ApiRequest; folder: string }[] {
  const list: { request: ApiRequest; folder: string }[] = [];
  const walk = (folder: Folder, path: string[]) => {
    for (const child of folder.folders) walk(child, [...path, child.name]);
    for (const request of folder.requests) list.push({ request, folder: path.join(' / ') });
  };
  walk(collection, []);
  return list;
}

export function runItems(collection: Collection): RunItem[] {
  return runOrder(collection).map(({ request, folder }) => ({
    id: request.id,
    name: request.name,
    folder,
    method: isHttpKind(request.kind) ? (request.kind === 'graphql' ? 'GQL' : request.method) : (request.kind ?? '').toUpperCase(),
    url: request.url,
    state: 'waiting',
  }));
}

export interface RunOptions {
  environment: KeyValue[];
  send: (prepared: Awaited<ReturnType<typeof signRequest>>, signal: AbortSignal) => Promise<ApiResponse>;
  signal: AbortSignal;
  /** Pause between requests, in milliseconds. */
  delay: number;
  /** Called after each change, with the request's new state. */
  update: (index: number, item: Partial<RunItem>) => void;
}

/** Sends the collection's requests in order. A request passes when the server answers below 400. */
export async function runCollection(collection: Collection, options: RunOptions): Promise<void> {
  const variables = variableMap(collection.variables, options.environment);
  const order = runOrder(collection);
  for (const [index, { request }] of order.entries()) {
    if (options.signal.aborted) return;
    if (!isHttpKind(request.kind)) {
      options.update(index, { state: 'skipped', note: 'Live connections and AI or MCP requests do not run in a collection.' });
      continue;
    }
    if (!request.url.trim()) {
      options.update(index, { state: 'skipped', note: 'No URL.' });
      continue;
    }
    options.update(index, { state: 'running' });
    const auth = request.auth.type === 'inherit' ? (inheritedAuth(collection, request.id)?.auth ?? { type: 'none' as const }) : request.auth;
    const prepared = prepareRequest(request, variables, auth);
    if (prepared.bodyError || prepared.missingFiles?.length) {
      options.update(index, { state: 'failed', note: prepared.bodyError ?? `Choose ${prepared.missingFiles!.join(', ')} again.` });
      continue;
    }
    try {
      const signed = await signRequest(prepared);
      const response = await options.send(signed, options.signal);
      options.update(index, {
        state: response.status < 400 ? 'passed' : 'failed',
        status: response.status,
        ms: response.ms,
        size: response.size,
        url: prepared.url,
      });
    } catch (e) {
      if (e instanceof RequestFailure && e.kind === 'cancelled') return;
      const note = e instanceof AuthError || e instanceof RequestFailure || e instanceof Error ? e.message : 'The request failed.';
      options.update(index, { state: 'failed', note, url: prepared.url });
    }
    if (options.delay > 0 && index < order.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }
  }
}
