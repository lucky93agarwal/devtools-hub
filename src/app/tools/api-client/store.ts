import { Injectable, computed, effect, signal } from '@angular/core';
import { paramsFromUrl } from './build';
import type { KvColumns } from './kv-table';
import { Auth, authLabel } from './auth';
import { ApiRequest, Collection, Environment, Folder, KeyValue, cloneRequest, newId, newRequest } from './model';

/** One sent request, kept so it can be opened again. */
export interface HistoryEntry {
  id: string;
  at: number;
  status: number | null;
  ms: number | null;
  request: ApiRequest;
}

interface Saved {
  version: 1;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  draft: ApiRequest;
  /** The saved request the draft came from, so Save updates it. */
  draftSource: { collectionId: string; requestId: string } | null;
  columns?: KvColumns;
}

/**
 * Fills in params for requests made before params were stored separately, or
 * made from a URL alone (cURL, Postman without a query list).
 */
export function withParams(request: ApiRequest): ApiRequest {
  if (request.params?.length || !request.url.includes('?')) return { ...request, params: request.params ?? [] };
  return { ...request, params: paramsFromUrl(request.url) };
}

const STORAGE_KEY = 'dth-api-client';
const MAX_HISTORY = 50;

/** Where a request lives: its collection and the folder that holds it. */
export interface Located {
  collection: Collection;
  folder: Folder;
  request: ApiRequest;
}

export function findRequest(collections: Collection[], requestId: string): Located | null {
  for (const collection of collections) {
    const walk = (folder: Folder): Located | null => {
      const request = folder.requests.find((r) => r.id === requestId);
      if (request) return { collection, folder, request };
      for (const child of folder.folders) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    const found = walk(collection);
    if (found) return found;
  }
  return null;
}

/** The folders from the collection down to the one holding the request. */
export function folderPath(collection: Collection, requestId: string): Folder[] | null {
  const walk = (folder: Folder, path: Folder[]): Folder[] | null => {
    const here = [...path, folder];
    if (folder.requests.some((r) => r.id === requestId)) return here;
    for (const child of folder.folders) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  };
  return walk(collection, []);
}

/** The auth a request set to "Inherit" gets: the nearest folder's, then the collection's. */
export function inheritedAuth(collection: Collection | undefined, requestId: string | undefined): { auth: Auth; from: string } | null {
  if (!collection || !requestId) return null;
  const path = folderPath(collection, requestId) ?? [collection];
  for (const folder of [...path].reverse()) {
    if (folder.auth && folder.auth.type !== 'inherit') return { auth: folder.auth, from: folder.name };
  }
  return null;
}

function findFolder(root: Folder, folderId: string): Folder | null {
  if (root.id === folderId) return root;
  for (const child of root.folders) {
    const found = findFolder(child, folderId);
    if (found) return found;
  }
  return null;
}

/**
 * Collections, environments, history and the open request. Everything is kept in
 * this browser's local storage only; nothing is sent anywhere.
 */
@Injectable({ providedIn: 'root' })
export class ApiStore {
  readonly collections = signal<Collection[]>([]);
  readonly environments = signal<Environment[]>([]);
  readonly activeEnvironmentId = signal<string | null>(null);
  readonly history = signal<HistoryEntry[]>([]);
  readonly draft = signal<ApiRequest>(newRequest());
  readonly draftSource = signal<{ collectionId: string; requestId: string } | null>(null);
  /** Optional table columns, shown or hidden for every table. */
  readonly columns = signal<KvColumns>({ value: true, description: true });
  /** False when the browser refuses storage (some private windows); work is then lost on reload. */
  readonly persistent = signal(true);

  readonly activeEnvironment = computed(
    () => this.environments().find((e) => e.id === this.activeEnvironmentId()) ?? null,
  );
  /** Where an inheriting request gets its auth, for the Authorization tab. */
  readonly inherited = computed(() => {
    const source = this.draftSource();
    const collection = source ? this.collections().find((c) => c.id === source.collectionId) : undefined;
    return inheritedAuth(collection, source?.requestId);
  });
  /** The auth actually sent with the open request. */
  readonly effectiveAuth = computed<Auth>(() => {
    const auth = this.draft().auth;
    if (auth.type !== 'inherit') return auth;
    return this.inherited()?.auth ?? { type: 'none' };
  });
  readonly inheritedSummary = computed(() => {
    const inherited = this.inherited();
    return inherited ? `${authLabel(inherited.auth.type)} from ${inherited.from}` : null;
  });
  /** Variables for the open request: its collection's, then the environment's (which win). */
  readonly variables = computed<KeyValue[][]>(() => {
    const source = this.draftSource();
    const collection = source ? this.collections().find((c) => c.id === source.collectionId) : undefined;
    return [collection?.variables ?? [], this.activeEnvironment()?.variables ?? []];
  });

  constructor() {
    this.load();
    effect(() => this.save());
  }

  // Open request

  open(request: ApiRequest, source: { collectionId: string; requestId: string } | null): void {
    this.draft.set(withParams(cloneRequest(request, { id: request.id })));
    this.draftSource.set(source);
  }

  openNew(request = newRequest()): void {
    this.draft.set(withParams(request));
    this.draftSource.set(null);
  }

  update(changes: Partial<ApiRequest>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  // Saving

  /** Saves the open request over the one it came from. False when it has no saved copy. */
  saveOver(): boolean {
    const source = this.draftSource();
    if (!source) return false;
    const draft = this.draft();
    let saved = false;
    this.mutate((collections) => {
      const found = findRequest(collections, source.requestId);
      if (!found) return;
      found.folder.requests = found.folder.requests.map((r) => (r.id === source.requestId ? { ...structuredClone(draft), id: r.id } : r));
      saved = true;
    });
    return saved;
  }

  /** Saves the open request as a new item in a collection (or one of its folders). */
  saveAs(name: string, collectionId: string, folderId = collectionId): void {
    const request = cloneRequest(this.draft(), { name: name.trim() || this.draft().name });
    this.mutate((collections) => {
      const collection = collections.find((c) => c.id === collectionId);
      const folder = collection && findFolder(collection, folderId);
      folder?.requests.push(request);
    });
    this.draft.update((draft) => ({ ...draft, name: request.name }));
    this.draftSource.set({ collectionId, requestId: request.id });
  }

  // Collections

  addCollection(name: string): Collection {
    const collection: Collection = { id: newId(), name: name.trim() || 'New collection', requests: [], folders: [], variables: [] };
    this.collections.update((list) => [...list, collection]);
    return collection;
  }

  importCollection(collection: Collection): void {
    this.collections.update((list) => [...list, collection]);
  }

  renameCollection(id: string, name: string): void {
    this.collections.update((list) => list.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)));
  }

  setCollectionAuth(id: string, auth: Auth): void {
    this.collections.update((list) => list.map((c) => (c.id === id ? { ...c, auth } : c)));
  }

  setCollectionVariables(id: string, variables: KeyValue[]): void {
    this.collections.update((list) => list.map((c) => (c.id === id ? { ...c, variables } : c)));
  }

  deleteCollection(id: string): void {
    this.collections.update((list) => list.filter((c) => c.id !== id));
    if (this.draftSource()?.collectionId === id) this.draftSource.set(null);
  }

  renameRequest(requestId: string, name: string): void {
    this.mutate((collections) => {
      const found = findRequest(collections, requestId);
      if (found) found.request.name = name.trim() || found.request.name;
    });
    if (this.draftSource()?.requestId === requestId) this.update({ name: name.trim() || this.draft().name });
  }

  deleteRequest(requestId: string): void {
    this.mutate((collections) => {
      const found = findRequest(collections, requestId);
      if (found) found.folder.requests = found.folder.requests.filter((r) => r.id !== requestId);
    });
    if (this.draftSource()?.requestId === requestId) this.draftSource.set(null);
  }

  // Environments

  addEnvironment(name: string): Environment {
    const environment: Environment = { id: newId(), name: name.trim() || 'New environment', variables: [] };
    this.environments.update((list) => [...list, environment]);
    this.activeEnvironmentId.set(environment.id);
    return environment;
  }

  updateEnvironment(id: string, changes: Partial<Environment>): void {
    this.environments.update((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  deleteEnvironment(id: string): void {
    this.environments.update((list) => list.filter((e) => e.id !== id));
    if (this.activeEnvironmentId() === id) this.activeEnvironmentId.set(null);
  }

  // History

  addHistory(request: ApiRequest, status: number | null, ms: number | null): void {
    const entry: HistoryEntry = { id: newId(), at: Date.now(), status, ms, request: structuredClone(request) };
    this.history.update((list) => [entry, ...list].slice(0, MAX_HISTORY));
  }

  clearHistory(): void {
    this.history.set([]);
  }

  /** Removes everything this tool saved in the browser. */
  clearAll(): void {
    this.collections.set([]);
    this.environments.set([]);
    this.activeEnvironmentId.set(null);
    this.history.set([]);
    this.openNew();
  }

  /** Changes collections through a deep copy, so signals see a new value. */
  private mutate(change: (collections: Collection[]) => void): void {
    const copy = structuredClone(this.collections());
    change(copy);
    this.collections.set(copy);
  }

  private load(): void {
    try {
      const text = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
      if (!text) return;
      const saved = JSON.parse(text) as Saved;
      if (saved.version !== 1) return;
      this.collections.set(saved.collections ?? []);
      this.environments.set(saved.environments ?? []);
      this.activeEnvironmentId.set(saved.activeEnvironmentId ?? null);
      this.history.set(saved.history ?? []);
      if (saved.draft) this.draft.set(withParams(saved.draft));
      if (saved.columns) this.columns.set(saved.columns);
      this.draftSource.set(saved.draftSource ?? null);
    } catch {
      // Unreadable or blocked storage: start empty.
    }
  }

  private save(): void {
    const saved: Saved = {
      version: 1,
      collections: this.collections(),
      environments: this.environments(),
      activeEnvironmentId: this.activeEnvironmentId(),
      history: this.history(),
      draft: this.draft(),
      draftSource: this.draftSource(),
      columns: this.columns(),
    };
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      this.persistent.set(true);
    } catch {
      this.persistent.set(false);
    }
  }
}
