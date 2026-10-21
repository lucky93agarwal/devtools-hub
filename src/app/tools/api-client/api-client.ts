import { Component, DOCUMENT, DestroyRef, PLATFORM_ID, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { copyText, downloadBlob, downloadText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { PreparedRequest, mergeUrlParams, prepareRequest, resolveVariables, urlWithParams, variableMap } from './build';
import { API_CLIENT_CONTENT, GRAPHQL_SAMPLE, MCP_SAMPLE_URL, MQTT_SAMPLE_URL, SAMPLE_PATH, SAMPLE_REQUEST, WEBSOCKET_SAMPLE_URL } from './content';
import { nameFromUrl, parseCurl, toCurl, toFetchCode } from './curl';
import { KvTable } from './kv-table';
import { SNIPPET_LANGUAGES, snippet } from './snippets';
import { SearchSelect } from './search-select';
import { CollectionPanel } from './collection-panel';
import { JsonView } from './json-view';
import { SearchBox, countMatches } from './search-box';
import {
  RESPONSE_FORMATS,
  ResponseFormat,
  defaultFormat,
  hexDump,
  previewDocument,
  previewKind,
  toBase64,
} from './response-format';
import { parseTree } from '../json-formatter/json-tree';
import { findJsonError } from '../json-formatter/json-tools';
import { AuthEditor } from './auth-editor';
import { Auth } from './auth';
import { AuthError, signRequest } from './sign';
import {
  ApiRequest,
  BodyMode,
  Collection,
  Folder,
  KeyValue,
  METHODS,
  Method,
  RAW_LANGUAGES,
  REQUEST_KINDS,
  RawLanguage,
  RequestBody,
  RequestKind,
  cloneRequest,
  defaultAi,
  defaultMqtt,
  defaultRealtime,
  emptyBody,
  isHttpKind,
  newRequest,
} from './model';
import { RealtimePanel } from './realtime-panel';
import { AiPanel } from './ai-panel';
import { McpPanel } from './mcp-panel';
import { GraphqlEditor } from './graphql-editor';
import type { SchemaState } from './graphql-editor';
import { fileFor, keepFile } from './body-files';
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
  /** The method, or WS / SIO for live connections. */
  method?: string;
  collectionId: string;
}

const SNIPPET_KEY = 'dth-snippet-language';

function readSnippetLanguage(): string {
  try {
    const id = localStorage.getItem(SNIPPET_KEY);
    return id && SNIPPET_LANGUAGES.some((l) => l.id === id) ? id : 'curl';
  } catch {
    return 'curl';
  }
}

/** What the sidebar shows before a request's name. */
const badgeOf = (request: ApiRequest) =>
  request.kind && request.kind !== 'http' ? (REQUEST_KINDS.find((k) => k.value === request.kind)?.badge ?? 'WS') : request.method;

const METHOD_COLOURS: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-warning',
  PUT: 'text-brand',
  PATCH: 'text-brand',
  DELETE: 'text-danger',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
  GQL: 'text-warning',
  WS: 'text-warning',
  MQTT: 'text-warning',
  AI: 'text-brand',
  MCP: 'text-brand',
  SIO: 'text-warning',
};

@Component({
  selector: 'app-api-client',
  host: { '(document:click)': 'closeMenus($event)' },
  imports: [Icon, CodeEditor, ToolInfoSection, KvTable, AuthEditor, JsonView, SearchBox, RealtimePanel, GraphqlEditor, AiPanel, McpPanel, SearchSelect, CollectionPanel],
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
    { value: 'none', label: 'none' },
    { value: 'form-data', label: 'form-data' },
    { value: 'urlencoded', label: 'x-www-form-urlencoded' },
    { value: 'raw', label: 'raw' },
    { value: 'binary', label: 'binary' },
    { value: 'graphql', label: 'GraphQL' },
  ];
  protected readonly rawLanguages = RAW_LANGUAGES;
  /** The editor colours for the raw body's language. */
  protected readonly rawEditorLanguage = computed(
    () => RAW_LANGUAGES.find((item) => item.value === this.draft().body.language)?.editor ?? 'plaintext',
  );

  protected readonly store = inject(ApiStore);
  protected readonly draft = this.store.draft;
  protected readonly requestTab = signal<RequestTab>('params');
  protected readonly sideTab = signal<SideTab>('collections');
  protected readonly responseTab = signal<'body' | 'headers'>('body');
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
  protected readonly prepared = computed(() => prepareRequest(this.draft(), this.variables(), this.store.effectiveAuth()));
  /** The request as it will be sent, signatures included, for the Code panel. */
  protected readonly signedPreview = signal<{ prepared: PreparedRequest | null; note: string }>({ prepared: null, note: '' });
  protected readonly snippetLanguages = SNIPPET_LANGUAGES;
  /** The language picked in the Code panel, remembered in this browser. */
  protected readonly snippetLanguage = signal(readSnippetLanguage());
  protected readonly snippetCode = computed(() => {
    const prepared = this.signedPreview().prepared;
    return prepared ? snippet(this.snippetLanguage(), prepared) : '';
  });
  protected readonly snippetLabel = computed(() => SNIPPET_LANGUAGES.find((l) => l.id === this.snippetLanguage())?.label ?? 'cURL');
  protected readonly tokenState = signal<'idle' | 'working'>('idle');
  protected readonly params = computed(() => this.draft().params);
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
  // How the body is shown, as in Postman: a format from the menu, or Preview.
  protected readonly formats = RESPONSE_FORMATS;
  protected readonly responseFormat = linkedSignal<ApiResponse | null, ResponseFormat>({
    source: this.response,
    computation: (response, previous) =>
      // Keep a format the user picked while they send the same kind of request again.
      previous && response && previous.source?.contentType === response.contentType
        ? previous.value
        : response
          ? defaultFormat(response.contentType, response.text !== null, response.text ?? '')
          : 'json',
  });
  protected readonly formatOption = computed(() => RESPONSE_FORMATS.find((f) => f.value === this.responseFormat())!);
  protected readonly formatMenu = signal(false);
  protected readonly newMenu = signal(false);
  protected readonly requestKinds = REQUEST_KINDS;
  protected readonly kindHints: Record<RequestKind, string> = {
    http: 'REST and other HTTP APIs',
    graphql: 'Queries built from the schema',
    websocket: 'A live two-way connection',
    socketio: 'Events with a Socket.IO server',
    mqtt: 'Publish and subscribe to a broker',
    ai: 'Prompt OpenAI, Claude, Gemini and more',
    mcp: 'Try a server’s tools, resources and prompts',
  };
  /** HTTP and GraphQL use the request form; WebSocket and Socket.IO the live panel. */
  protected readonly isHttp = computed(() => isHttpKind(this.draft().kind));
  protected readonly isGraphql = computed(() => this.draft().kind === 'graphql');
  /** Schemas read per endpoint, kept while the page is open. */
  private readonly schemas = signal(new Map<string, SchemaState>());
  protected readonly schemaState = computed(() => this.schemas().get(this.prepared().url) ?? { status: 'idle' as const });
  protected readonly previewKind = computed(() => {
    const response = this.response();
    return response ? previewKind(response.contentType, response.text !== null) : 'none';
  });
  /** Images, PDFs, audio and video open in Preview; text opens in its format. */
  protected readonly previewOn = linkedSignal(() => ['image', 'pdf', 'video', 'audio'].includes(this.previewKind()));
  /** Long lines wrap, except in Hex, whose columns only line up unwrapped. */
  protected readonly wrap = linkedSignal(() => this.responseFormat() !== 'hex');
  protected readonly searchOpen = signal(false);
  /** The body's bytes, read only when Hex or Base64 needs them. */
  protected readonly responseBytes = signal<{ response: ApiResponse; bytes: Uint8Array } | null>(null);
  /** The body as shown in the editor and copied by Copy. */
  protected readonly responseText = computed(() => {
    const response = this.response();
    if (!response) return '';
    const format = this.responseFormat();
    if (format === 'hex' || format === 'base64') {
      const loaded = this.responseBytes();
      if (loaded?.response !== response) return 'Reading the response…';
      return format === 'hex' ? hexDump(loaded.bytes) : toBase64(loaded.bytes);
    }
    const text = response.text ?? '';
    if (format === 'json') {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
    return text;
  });
  /** JSON shows as a tree to explore, or as formatted text in the editor. */
  protected readonly jsonMode = signal<'tree' | 'text'>('tree');
  protected readonly jsonModes = [
    { id: 'tree' as const, label: 'Tree', tip: 'Fold, copy and hover keys' },
    { id: 'text' as const, label: 'Text', tip: 'Formatted JSON text' },
  ];
  protected readonly jsonParses = computed(() => {
    const text = this.response()?.text;
    if (!text) return false;
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  });
  /** The JSON body as a tree when JSON is the format and Tree is chosen; null otherwise or when it is not valid JSON. */
  protected readonly responseTree = computed(() => {
    const text = this.response()?.text;
    if (!text || this.responseFormat() !== 'json' || this.jsonMode() !== 'tree' || !this.jsonParses()) return null;
    return parseTree(text);
  });
  /** The PDF's local address for the Preview frame. */
  protected readonly previewResource = computed(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
  protected readonly headersText = computed(() => (this.response()?.headers ?? []).map(([n, v]) => `${n}: ${v}`).join('\n'));
  /**
   * Where a body that should be JSON breaks: shown in JSON format when the server
   * says it is JSON, or the body starts like JSON, but it does not parse.
   */
  protected readonly responseJsonError = computed(() => {
    const response = this.response();
    const text = response?.text;
    if (!text?.trim() || this.responseFormat() !== 'json' || this.jsonParses()) return null;
    return findJsonError(text);
  });
  /** An HTML response for the sandboxed Preview frame, which runs no scripts. */
  protected readonly previewHtml = computed(() => {
    const response = this.response();
    if (!response?.text || this.previewKind() !== 'html') return null;
    return this.sanitizer.bypassSecurityTrustHtml(previewDocument(response.text, response.url));
  });
  // Search in the response: steps through matches in the tree and the editor, filters headers.
  protected readonly responseQuery = signal('');
  /** How far Next and Previous have moved; wraps around the number of matches. */
  protected readonly searchStep = linkedSignal({ source: this.responseQuery, computation: () => 0 });
  protected readonly searchMode = computed(() =>
    this.responseTab() === 'headers' ? 'headers' : this.previewOn() ? 'preview' : this.responseTree() ? 'tree' : 'raw',
  );
  protected readonly shownHeaders = computed(() => {
    const query = this.responseQuery().toLowerCase();
    const headers = this.response()?.headers ?? [];
    return query ? headers.filter(([name, value]) => `${name}: ${value}`.toLowerCase().includes(query)) : headers;
  });
  protected readonly searchTotal = computed(() => {
    switch (this.searchMode()) {
      case 'headers':
        return this.shownHeaders().length;
      case 'tree':
        return this.jsonView()?.matchCount() ?? 0;
      default:
        return countMatches(this.responseText(), this.responseQuery());
    }
  });
  protected readonly searchCurrent = computed(() => {
    const total = this.searchTotal();
    return total ? ((this.searchStep() % total) + total) % total : 0;
  });
  private readonly jsonView = viewChild(JsonView);
  private readonly responseEditor = viewChild<CodeEditor>('responseEditor');

  /** A local address for an image, PDF, audio or video response, for Preview. */
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly tree = computed(() => this.store.collections().map((c) => ({ collection: c, rows: flatten(c) })));
  protected readonly saveTargets = computed(() =>
    this.store.collections().flatMap((c) => folderOptions(c, c.id)),
  );

  private readonly sender = inject(ApiSender);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly analytics = inject(Analytics);
  private controller: AbortController | null = null;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // The page is prerendered, so a URL typed or pasted before the app starts is in the
    // box but not in the request; the first render would wipe it. Keep it instead, so a
    // Send pressed in that moment (replayed once the app starts) sends it.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const typed = inject(DOCUMENT).querySelector<HTMLInputElement>('input[aria-label="URL"]')?.value.trim();
      if (typed && typed !== this.draft().url) this.setUrl(typed);
    }

    // Hex and Base64 need the body's bytes, which are read once per response.
    effect(() => {
      const response = this.response();
      const format = this.responseFormat();
      if (!response || (format !== 'hex' && format !== 'base64')) return;
      if (untracked(this.responseBytes)?.response === response) return;
      void response.blob.arrayBuffer().then((buffer) => {
        if (this.response() === response) this.responseBytes.set({ response, bytes: new Uint8Array(buffer) });
      });
    });

    // Underline where an invalid JSON body breaks, once the editor shows it.
    effect(() => {
      const error = this.responseJsonError();
      const editor = this.responseEditor();
      if (!editor) return;
      if (error) editor.showError(error.line, error.column, error.message);
      else editor.clearError();
    });

    // The editor marks raw matches itself; it keeps the search until Monaco has loaded.
    effect(() => {
      const editor = this.responseEditor();
      const query = this.searchMode() === 'raw' ? this.responseQuery() : '';
      editor?.search(query, this.searchCurrent());
    });

    // The Code panel shows signed requests, which take a moment to work out.
    effect(() => {
      if (this.panel() !== 'code') return;
      const prepared = this.prepared();
      signRequest(prepared)
        .then((signed) =>
          this.signedPreview.set({
            prepared: signed,
            note: prepared.signWith ? 'This request is signed with the current time, so copied code works for a few minutes only.' : '',
          }),
        )
        .catch((e) => this.signedPreview.set({ prepared, note: e instanceof Error ? e.message : '' }));
    });
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      this.releasePreview();
      clearTimeout(this.copyTimer);
    });
  }

  // Editing the request

  protected setMethod(method: Method): void {
    this.store.update({ method });
  }

  protected setUrl(url: string): void {
    this.store.update({ url, params: mergeUrlParams(url, this.draft().params) });
  }

  protected setParams(params: KeyValue[]): void {
    this.store.update({ params, url: urlWithParams(this.draft().url, params) });
  }

  protected setHeaders(headers: KeyValue[]): void {
    this.store.update({ headers });
  }

  protected setAuth(auth: Auth): void {
    this.store.update({ auth });
  }

  /** OAuth 2.0: asks the token URL for a new access token (client credentials or password grant). */
  protected async getAccessToken(): Promise<void> {
    const auth = this.draft().auth;
    if (auth.type !== 'oauth2' || this.tokenState() === 'working') return;
    const value = (text: string) => resolveVariables(text, this.variables());
    if (!auth.tokenUrl.trim()) {
      this.note.set('Enter the access token URL first.');
      return;
    }
    const form = new URLSearchParams({ grant_type: auth.grantType });
    if (auth.scope) form.set('scope', value(auth.scope));
    if (auth.grantType === 'password') {
      form.set('username', value(auth.username));
      form.set('password', value(auth.password));
    }
    const headers: [string, string][] = [
      ['Content-Type', 'application/x-www-form-urlencoded'],
      ['Accept', 'application/json'],
    ];
    if (auth.clientAuth === 'header') {
      headers.push(['Authorization', `Basic ${btoa(`${value(auth.clientId)}:${value(auth.clientSecret)}`)}`]);
    } else {
      form.set('client_id', value(auth.clientId));
      form.set('client_secret', value(auth.clientSecret));
    }
    this.tokenState.set('working');
    try {
      const body = form.toString();
      const response = await this.sender.send(
        { method: 'POST', url: value(auth.tokenUrl.trim()), headers, body, bodyText: body, formFields: [], dropped: [], unresolved: [] },
        new AbortController().signal,
      );
      const data = JSON.parse(response.text ?? '{}') as { access_token?: string; error?: string; error_description?: string };
      if (data.access_token) {
        this.setAuth({ ...auth, accessToken: data.access_token });
        this.note.set('');
        this.flash('New access token added');
      } else {
        this.note.set(`The token URL answered ${response.status} without an access_token${data.error ? `: ${data.error_description ?? data.error}` : '.'}`);
      }
    } catch (e) {
      this.note.set(
        e instanceof RequestFailure && e.kind === 'blocked'
          ? 'The token URL could not be reached from the browser (often CORS). Get the token with Postman or curl, then paste it into Access token.'
          : e instanceof Error
            ? e.message
            : 'The token could not be fetched.',
      );
    } finally {
      this.tokenState.set('idle');
    }
  }

  protected setBodyMode(mode: BodyMode): void {
    this.setBody({ mode });
  }

  protected setBody(changes: Partial<RequestBody>): void {
    this.store.update({ body: { ...this.draft().body, ...changes } });
  }

  protected setLanguage(language: RawLanguage): void {
    this.setBody({ language });
  }

  protected setGraphql(changes: Partial<RequestBody['graphql']>): void {
    const graphql = { ...this.draft().body.graphql, ...changes };
    if (graphql.query === this.draft().body.graphql.query && graphql.variables === this.draft().body.graphql.variables) return;
    this.setBody({ graphql });
  }

  protected chooseBinary(element: HTMLInputElement): void {
    const file = element.files?.[0];
    element.value = '';
    if (file) this.setBody({ file: keepFile(file) });
  }

  /** The chosen binary file, or null when it has to be chosen again after a reload. */
  protected binaryReady(): boolean {
    return !!fileFor(this.draft().body.file);
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

  protected formatGraphqlVariables(): void {
    try {
      this.setGraphql({ variables: JSON.stringify(JSON.parse(this.draft().body.graphql.variables), null, 2) });
      this.note.set('');
    } catch {
      this.note.set('The GraphQL variables are not valid JSON, so they could not be formatted.');
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
    const check = this.prepared();
    if (check.bodyError) {
      this.note.set(check.bodyError);
      return;
    }
    if (check.missingFiles?.length) {
      this.note.set(`Choose ${check.missingFiles.join(', ')} again in the Body tab. Files are not kept after the page is reloaded.`);
      return;
    }
    this.note.set('');
    this.controller = new AbortController();
    this.releasePreview();
    this.result.set({ kind: 'sending' });
    try {
      let prepared = this.prepared();
      try {
        prepared = await signRequest(prepared);
      } catch (e) {
        throw new RequestFailure('auth', e instanceof AuthError ? e.message : 'The request could not be signed.');
      }
      const response = await this.sender.send(prepared, this.controller.signal);
      if (['image', 'pdf', 'video', 'audio'].includes(previewKind(response.contentType, response.text !== null))) {
        this.previewUrl.set(URL.createObjectURL(response.blob));
      }
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

  protected chooseFormat(format: ResponseFormat): void {
    this.responseFormat.set(format);
    this.previewOn.set(false);
    this.formatMenu.set(false);
  }

  protected toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.responseQuery.set('');
  }

  /** Ctrl+F or Cmd+F in the response opens its search, except inside the editor, which has its own. */
  protected onResponseKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
    if ((event.target as HTMLElement).closest('app-code-editor')) return;
    event.preventDefault();
    this.searchOpen.set(true);
  }

  /** Closes the format menu on a click anywhere else. */
  protected closeMenus(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.formatMenu() && !target.closest('[data-format-menu]')) this.formatMenu.set(false);
    if (this.newMenu() && !target.closest('[data-new-menu]')) this.newMenu.set(false);
  }

  protected showJsonError(): void {
    const error = this.responseJsonError();
    if (error) this.responseEditor()?.revealError(error.line, error.column);
  }

  protected chooseSnippet(id: string): void {
    this.snippetLanguage.set(id);
    try {
      localStorage.setItem(SNIPPET_KEY, id);
    } catch {
      // Storage blocked; the choice lasts for this visit.
    }
  }

  protected stepSearch(direction: 1 | -1): void {
    this.searchStep.update((step) => step + direction);
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
    this.collectionView.set(null);
    const collection = this.store.collections().find((c) => c.id === row.collectionId);
    const found = collection && findIn(collection, row.id);
    if (!found) return;
    this.store.open(found, { collectionId: row.collectionId, requestId: row.id });
    this.result.set({ kind: 'idle' });
  }

  /** The collection shown in the main area instead of a request, when one is open. */
  protected readonly collectionView = signal<string | null>(null);
  /** Collections folded shut in the sidebar. */
  protected readonly collapsed = signal(new Set<string>());

  protected toggleCollapsed(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected openCollection(id: string): void {
    this.collectionView.set(id);
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  protected addRequest(collectionId: string, folderId?: string): void {
    this.store.addRequest(collectionId, folderId);
    this.collectionView.set(null);
    this.panel.set(null);
    this.result.set({ kind: 'idle' });
    this.requestTab.set('params');
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(collectionId);
      return next;
    });
  }

  protected addFolder(collectionId: string, parentId?: string): void {
    this.store.addFolder(collectionId, parentId);
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(collectionId);
      return next;
    });
  }

  protected removeFolder(collectionId: string, folderId: string): void {
    if (this.confirmDelete() !== folderId) {
      this.confirmDelete.set(folderId);
      return;
    }
    this.store.deleteFolder(collectionId, folderId);
    this.confirmDelete.set(null);
  }

  protected openHistory(entry: HistoryEntry): void {
    this.collectionView.set(null);
    this.store.openNew(cloneRequest(entry.request));
    this.result.set({ kind: 'idle' });
  }

  protected newRequest(kind: RequestKind = 'http'): void {
    this.newMenu.set(false);
    this.collectionView.set(null);
    this.panel.set(null);
    const label = REQUEST_KINDS.find((k) => k.value === kind)!.label;
    this.store.openNew(
      kind === 'http'
        ? newRequest()
        : kind === 'graphql'
          ? newRequest({ kind, name: 'New GraphQL request', method: 'POST', body: { ...emptyBody(), mode: 'graphql' } })
          : kind === 'ai'
            ? newRequest({ kind, name: 'New AI request', ai: defaultAi() })
            : kind === 'mcp'
              ? newRequest({ kind, name: 'New MCP request' })
              : newRequest({ kind, name: `New ${label} request`, realtime: defaultRealtime() }),
    );
    this.result.set({ kind: 'idle' });
    this.requestTab.set('params');
  }

  protected loadGraphqlSample(): void {
    this.store.openNew(newRequest({ ...GRAPHQL_SAMPLE, kind: 'graphql', method: 'POST', body: { ...emptyBody(), ...GRAPHQL_SAMPLE.body } }));
    this.result.set({ kind: 'idle' });
    this.requestTab.set('body');
  }

  protected setSchema(state: SchemaState): void {
    this.setSchemaFor(this.prepared().url, state);
  }

  /** Sends the introspection query with the request's own headers and auth. */
  protected async fetchSchema(body: string): Promise<void> {
    const draft = this.draft();
    const request = { ...draft, kind: 'http' as const, method: 'POST' as const, body: { ...emptyBody(), mode: 'raw' as const, language: 'json' as const, raw: body } };
    const prepared = prepareRequest(request, this.variables(), this.store.effectiveAuth());
    const url = prepared.url;
    this.setSchemaFor(url, { status: 'loading' });
    try {
      const response = await this.sender.send(await signRequest(prepared), new AbortController().signal);
      if (!response.text) throw new Error(`The server answered ${response.status} with no schema.`);
      if (response.status >= 400 && !response.text.includes('__schema')) throw new Error(`The server answered ${response.status} ${response.statusText}.`);
      this.setSchemaFor(url, { status: 'ready', text: response.text });
    } catch (e) {
      const message =
        e instanceof RequestFailure && e.kind === 'blocked'
          ? 'The browser could not reach the endpoint. Check the URL, and that the server allows this site (CORS).'
          : e instanceof Error
            ? e.message
            : 'The schema could not be read.';
      this.setSchemaFor(url, { status: 'error', error: message });
    }
  }

  private setSchemaFor(url: string, state: SchemaState): void {
    this.schemas.update((map) => new Map(map).set(url, state));
  }

  protected loadMcpSample(): void {
    this.store.openNew(newRequest({ kind: 'mcp', name: 'DeepWiki MCP server', url: MCP_SAMPLE_URL }));
  }

  protected loadMqttSample(): void {
    this.store.openNew(
      newRequest({
        kind: 'mqtt',
        name: 'Public MQTT broker',
        url: MQTT_SAMPLE_URL,
        realtime: {
          ...defaultRealtime(),
          format: 'json',
          message: '{\n  "temperature": 21.5,\n  "unit": "C"\n}',
          mqtt: { ...defaultMqtt(), topic: 'devtools24/demo', subscriptions: [{ topic: 'devtools24/demo', qos: 0, enabled: true }] },
        },
      }),
    );
  }

  protected loadWebSocketSample(): void {
    this.store.openNew(
      newRequest({
        kind: 'websocket',
        name: 'Echo server',
        url: WEBSOCKET_SAMPLE_URL,
        realtime: { ...defaultRealtime(), format: 'json', message: '{\n  "type": "hello",\n  "text": "Hi from DevTools24"\n}' },
      }),
    );
  }

  protected loadSample(): void {
    this.store.openNew(newRequest({ ...SAMPLE_REQUEST, url: new URL(SAMPLE_PATH, location.href).href }));
    this.result.set({ kind: 'idle' });
    void this.send();
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
    this.openCollection(collection.id);
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
    const { text, left } = exportPostman(collection);
    downloadText(text, `${collection.name.replace(/[^\w.-]+/g, '-')}.postman_collection.json`);
    this.note.set(
      left ? `${left} WebSocket, Socket.IO, MQTT, AI or MCP ${left === 1 ? 'request was' : 'requests were'} left out: Postman's collection file only holds HTTP requests.` : '',
    );
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

  protected oauth2(): Extract<Auth, { type: 'oauth2' }> | null {
    const auth = this.draft().auth;
    return auth.type === 'oauth2' ? auth : null;
  }

  protected setOauth2(changes: Partial<Extract<Auth, { type: 'oauth2' }>>): void {
    const auth = this.oauth2();
    if (auth) this.setAuth({ ...auth, ...changes });
  }

  private flash(message: string): void {
    this.copied.set(message);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(''), 2000);
  }

  private releasePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
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
      rows.push({ kind: 'request', id: request.id, name: request.name, depth, method: badgeOf(request), collectionId: collection.id });
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
