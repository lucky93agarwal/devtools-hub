import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { copyText, downloadBlob, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { paramsFromUrl, prepareRequest, urlWithParams, variableMap } from './build';
import { API_CLIENT_CONTENT, SAMPLE_REQUEST } from './content';
import { nameFromUrl, parseCurl, toCurl, toFetchCode } from './curl';
import { KvTable } from './kv-table';
import { ApiRequest, Auth, BodyMode, Collection, Folder, KeyValue, METHODS, Method, cloneRequest, newRequest } from './model';
import { exportPostman, importPostman } from './postman';
import { ApiResponse, ApiSender, RequestFailure } from './sender';
import { ApiStore, HistoryEntry } from './store';

type RequestTab = 'params' | 'auth' | 'headers' | 'body';
type SideTab = 'collections' | 'history' | 'environments';
type Result =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; response: ApiResponse }
  | { kind: 'failed'; failure: RequestFailure };

/** A request in the sidebar tree, with how deep it sits. */
interface TreeRow {
  kind: 'folder' | 'request';
  id: string;
  name: string;
  depth: number;
  method?: Method;
  collectionId: string;
}

const METHOD_COLOURS: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-warning',
  PUT: 'text-brand',
  PATCH: 'text-brand',
  DELETE: 'text-danger',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
};

@Component({
  selector: 'app-api-client',
  imports: [Icon, CodeEditor, ToolInfoSection, KvTable],
  templateUrl: './api-client.html',
})
export class ApiClient {
  protected readonly tool = TOOLS.find((t) => t.path === 'api-client')!;
  protected readonly content = API_CLIENT_CONTENT;
  protected readonly icons = ICONS;
  protected readonly methods = METHODS;
  protected readonly methodColours = METHOD_COLOURS;
  protected readonly formatBytes = formatBytes;
  protected readonly bodyModes: { value: BodyMode; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'json', label: 'JSON' },
    { value: 'text', label: 'Text' },
    { value: 'urlencoded', label: 'x-www-form-urlencoded' },
    { value: 'form-data', label: 'form-data' },
  ];

  protected readonly store = inject(ApiStore);
  protected readonly draft = this.store.draft;
  protected readonly requestTab = signal<RequestTab>('params');
  protected readonly sideTab = signal<SideTab>('collections');
  protected readonly responseTab = signal<'body' | 'headers'>('body');
  protected readonly pretty = signal(true);
  protected readonly result = signal<Result>({ kind: 'idle' });
  protected readonly note = signal('');
  protected readonly copied = signal('');
  /** Open dialogs, drawn inline on the page. */
  protected readonly panel = signal<'curl' | 'save' | 'code' | null>(null);
  protected readonly curlText = signal('');
  protected readonly saveName = signal('');
  protected readonly saveTarget = signal('');
  protected readonly confirmDelete = signal<string | null>(null);

  protected readonly variables = computed(() => variableMap(...this.store.variables()));
  protected readonly prepared = computed(() => prepareRequest(this.draft(), this.variables()));
  protected readonly params = computed(() => paramsFromUrl(this.draft().url));
  protected readonly headerCount = computed(() => this.draft().headers.filter((h) => h.enabled && h.key).length);
  protected readonly response = computed(() => {
    const result = this.result();
    return result.kind === 'done' ? result.response : null;
  });
  protected readonly failure = computed(() => {
    const result = this.result();
    return result.kind === 'failed' ? result.failure : null;
  });
  protected readonly sending = computed(() => this.result().kind === 'sending');
  /** JSON responses are shown formatted when Pretty is on. */
  protected readonly responseText = computed(() => {
    const response = this.response();
    if (!response?.text) return '';
    if (this.pretty() && /json/i.test(response.contentType)) {
      try {
        return JSON.stringify(JSON.parse(response.text), null, 2);
      } catch {
        return response.text;
      }
    }
    return response.text;
  });
  protected readonly responseLanguage = computed(() => {
    const type = this.response()?.contentType ?? '';
    if (/json/i.test(type)) return 'json';
    if (/xml/i.test(type)) return 'xml';
    if (/html/i.test(type)) return 'html';
    return 'plaintext';
  });
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly tree = computed(() => this.store.collections().map((c) => ({ collection: c, rows: flatten(c) })));
  protected readonly saveTargets = computed(() =>
    this.store.collections().flatMap((c) => folderOptions(c, c.id)),
  );

  private readonly sender = inject(ApiSender);
  private readonly analytics = inject(Analytics);
  private controller: AbortController | null = null;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      this.releaseImage();
      clearTimeout(this.copyTimer);
    });
  }

  // Editing the request

  protected setMethod(method: Method): void {
    this.store.update({ method });
  }

  protected setUrl(url: string): void {
    this.store.update({ url });
  }

  protected setParams(params: KeyValue[]): void {
    this.store.update({ url: urlWithParams(this.draft().url, params) });
  }

  protected setHeaders(headers: KeyValue[]): void {
    this.store.update({ headers });
  }

  protected setAuthType(type: Auth['type']): void {
    const auth: Auth =
      type === 'bearer'
        ? { type, token: '' }
        : type === 'basic'
          ? { type, username: '', password: '' }
          : type === 'api-key'
            ? { type, key: 'X-API-Key', value: '', addTo: 'header' }
            : { type: 'none' };
    this.store.update({ auth });
  }

  protected setAuth(changes: Record<string, string>): void {
    this.store.update({ auth: { ...this.draft().auth, ...changes } as Auth });
  }

  protected setBodyMode(mode: BodyMode): void {
    const body = this.draft().body;
    const raw = mode === 'json' && !body.raw ? '{\n  \n}' : body.raw;
    this.store.update({ body: { ...body, mode, raw } });
  }

  protected setBodyRaw(raw: string): void {
    if (raw === this.draft().body.raw) return;
    this.store.update({ body: { ...this.draft().body, raw } });
  }

  protected setBodyFields(fields: KeyValue[]): void {
    this.store.update({ body: { ...this.draft().body, fields } });
  }

  protected formatJsonBody(): void {
    try {
      this.setBodyRaw(JSON.stringify(JSON.parse(this.draft().body.raw), null, 2));
      this.note.set('');
    } catch {
      this.note.set('The body is not valid JSON, so it could not be formatted.');
    }
  }

  // Sending

  protected async send(): Promise<void> {
    if (this.sending()) return;
    const request = this.draft();
    if (!request.url.trim()) {
      this.note.set('Enter a URL first.');
      return;
    }
    this.note.set('');
    const prepared = this.prepared();
    this.controller = new AbortController();
    this.releaseImage();
    this.result.set({ kind: 'sending' });
    try {
      const response = await this.sender.send(prepared, this.controller.signal);
      if (/^image\//i.test(response.contentType)) this.imageUrl.set(URL.createObjectURL(response.blob));
      this.result.set({ kind: 'done', response });
      this.store.addHistory(request, response.status, response.ms);
      this.analytics.track('api-send', { method: request.method, status: `${Math.floor(response.status / 100)}xx` });
    } catch (e) {
      const failure = e instanceof RequestFailure ? e : new RequestFailure('blocked', 'The request failed.');
      this.result.set(failure.kind === 'cancelled' ? { kind: 'idle' } : { kind: 'failed', failure });
      if (failure.kind !== 'cancelled') this.store.addHistory(request, null, null);
      this.analytics.track('api-send', { method: request.method, status: failure.kind });
    } finally {
      this.controller = null;
    }
  }

  protected cancel(): void {
    this.controller?.abort();
  }

  // Saving

  protected startSave(): void {
    if (this.store.draftSource() && this.store.saveOver()) {
      this.flash('Saved');
      return;
    }
    if (!this.store.collections().length) this.store.addCollection('My collection');
    this.saveName.set(this.draft().name === 'New request' ? nameFromUrl(this.draft().url, this.draft().method) : this.draft().name);
    this.saveTarget.set(this.saveTargets()[0]?.value ?? '');
    this.panel.set('save');
  }

  protected saveAs(): void {
    const [collectionId, folderId] = this.saveTarget().split('/');
    if (!collectionId) return;
    this.store.saveAs(this.saveName(), collectionId, folderId || collectionId);
    this.panel.set(null);
    this.flash('Saved');
  }

  // Opening

  protected open(row: TreeRow): void {
    const collection = this.store.collections().find((c) => c.id === row.collectionId);
    const found = collection && findIn(collection, row.id);
    if (!found) return;
    this.store.open(found, { collectionId: row.collectionId, requestId: row.id });
    this.result.set({ kind: 'idle' });
  }

  protected openHistory(entry: HistoryEntry): void {
    this.store.openNew(cloneRequest(entry.request));
    this.result.set({ kind: 'idle' });
  }

  protected newRequest(): void {
    this.store.openNew();
    this.result.set({ kind: 'idle' });
    this.requestTab.set('params');
  }

  protected loadSample(): void {
    this.store.openNew(newRequest(SAMPLE_REQUEST));
    this.result.set({ kind: 'idle' });
  }

  // cURL and code

  protected importCurl(): void {
    try {
      this.store.openNew(parseCurl(this.curlText()));
      this.panel.set(null);
      this.curlText.set('');
      this.note.set('');
      this.result.set({ kind: 'idle' });
      this.analytics.track('api-import', { from: 'curl' });
    } catch (e) {
      this.note.set(e instanceof Error ? e.message : 'This command could not be read.');
    }
  }

  protected readonly curl = computed(() => toCurl(this.prepared()));
  protected readonly fetchCode = computed(() => toFetchCode(this.prepared()));

  protected async copy(text: string, label: string): Promise<void> {
    this.flash((await copyText(text)) ? `${label} copied` : 'Copy failed');
  }

  // Collections

  protected newCollection(): void {
    const collection = this.store.addCollection(`Collection ${this.store.collections().length + 1}`);
    this.flash(`Added ${collection.name}`);
  }

  protected async importFile(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    try {
      const result = importPostman(await file.text());
      this.store.importCollection(result.collection);
      this.note.set(
        `Imported ${result.requests} ${result.requests === 1 ? 'request' : 'requests'} from ${result.collection.name}.` +
          (result.skipped.length ? ` Not supported, so left out: ${result.skipped.join(', ')}.` : ''),
      );
      this.analytics.track('api-import', { from: 'postman', requests: result.requests });
    } catch (e) {
      this.note.set(e instanceof Error ? e.message : 'This file could not be imported.');
    }
  }

  protected exportCollection(collection: Collection): void {
    downloadText(exportPostman(collection), `${collection.name.replace(/[^\w.-]+/g, '-')}.postman_collection.json`);
  }

  protected rename(kind: 'collection' | 'request', id: string, current: string, value: string): void {
    if (!value.trim() || value === current) return;
    if (kind === 'collection') this.store.renameCollection(id, value);
    else this.store.renameRequest(id, value);
  }

  protected remove(kind: 'collection' | 'request', id: string): void {
    if (this.confirmDelete() !== id) {
      this.confirmDelete.set(id);
      return;
    }
    if (kind === 'collection') this.store.deleteCollection(id);
    else this.store.deleteRequest(id);
    this.confirmDelete.set(null);
  }

  // Response

  protected downloadResponse(): void {
    const response = this.response();
    if (!response) return;
    const extension = /json/i.test(response.contentType)
      ? 'json'
      : /xml/i.test(response.contentType)
        ? 'xml'
        : /html/i.test(response.contentType)
          ? 'html'
          : (response.contentType.split('/')[1]?.split(';')[0] ?? 'txt');
    downloadBlob(response.blob, `response.${extension}`);
  }

  protected statusClass(status: number): string {
    if (status >= 500) return 'bg-danger/15 text-danger';
    if (status >= 400) return 'bg-warning/15 text-warning';
    if (status >= 300) return 'bg-brand/15 text-brand';
    return 'bg-success/15 text-success';
  }

  protected timeAgo(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString();
  }

  protected asAuth<T extends Auth['type']>(type: T): Extract<Auth, { type: T }> | null {
    const auth = this.draft().auth;
    return auth.type === type ? (auth as Extract<Auth, { type: T }>) : null;
  }

  private flash(message: string): void {
    this.copied.set(message);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(''), 2000);
  }

  private releaseImage(): void {
    const url = this.imageUrl();
    if (url) URL.revokeObjectURL(url);
    this.imageUrl.set(null);
  }
}

/** The collection as indented rows for the sidebar. */
function flatten(collection: Collection): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (folder: Folder, depth: number) => {
    for (const child of folder.folders) {
      rows.push({ kind: 'folder', id: child.id, name: child.name, depth, collectionId: collection.id });
      walk(child, depth + 1);
    }
    for (const request of folder.requests) {
      rows.push({ kind: 'request', id: request.id, name: request.name, depth, method: request.method, collectionId: collection.id });
    }
  };
  walk(collection, 0);
  return rows;
}

function findIn(folder: Folder, requestId: string): ApiRequest | null {
  const direct = folder.requests.find((r) => r.id === requestId);
  if (direct) return direct;
  for (const child of folder.folders) {
    const found = findIn(child, requestId);
    if (found) return found;
  }
  return null;
}

/** "Collection" and "Collection / Folder" choices for Save as. */
function folderOptions(folder: Folder, collectionId: string, prefix = ''): { value: string; label: string }[] {
  const label = prefix ? `${prefix} / ${folder.name}` : folder.name;
  const value = folder.id === collectionId ? collectionId : `${collectionId}/${folder.id}`;
  return [{ value, label }, ...folder.folders.flatMap((child) => folderOptions(child, collectionId, label))];
}
