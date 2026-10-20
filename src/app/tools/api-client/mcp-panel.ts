import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { parseTree } from '../json-formatter/json-tree';
import { mergeUrlParams, resolveVariables } from './build';
import { JsonView } from './json-view';
import { KvColumns, KvTable } from './kv-table';
import { McpClient, McpPrompt, McpResource, McpServerInfo, McpTool, schemaSkeleton } from './mcp';
import { ApiRequest, KeyValue } from './model';

type Tab = 'tools' | 'resources' | 'prompts';

interface ContentItem {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: { uri?: string; text?: string; blob?: string; mimeType?: string };
}

interface Outcome {
  title: string;
  ms: number;
  isError: boolean;
  items: ContentItem[];
  raw: unknown;
}

/**
 * An MCP request: connect to a server over Streamable HTTP, see its tools,
 * resources and prompts, and try each one with arguments made from its schema.
 */
@Component({
  selector: 'app-mcp-panel',
  imports: [CodeEditor, JsonView, KvTable],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip shrink-0 font-mono text-xs text-brand">MCP</span>
        <input
          type="text"
          class="min-w-0 flex-1 basis-full rounded-full border border-line bg-page px-4 py-2.5 font-mono text-sm sm:basis-auto"
          aria-label="URL"
          placeholder="https://example.com/mcp"
          spellcheck="false"
          autocomplete="off"
          [value]="request().url"
          (input)="setUrl($any($event.target).value)"
          (keydown.enter)="connect()"
        />
        @if (server() || busy() === 'connect') {
          <button type="button" class="btn-secondary shrink-0" (click)="disconnect()">Disconnect</button>
        } @else {
          <button type="button" class="btn-primary shrink-0" [disabled]="!request().url.trim()" (click)="connect()">Connect</button>
        }
      </div>
      <details class="rounded-xl border border-line px-3 py-2">
        <summary class="cursor-pointer text-sm font-semibold">
          Headers{{ headerCount() ? ' (' + headerCount() + ')' : '' }}
        </summary>
        <p class="my-2 text-xs text-muted">For a server that needs a token, add Authorization: Bearer {{ '{{token}}' }}.</p>
        <app-kv-table [rows]="request().headers" [columns]="columns()" (columnsChange)="columnsChange.emit($event)" (rowsChange)="requestChange.emit({ headers: $event })" />
      </details>

      @if (problem()) {
        <p class="rounded-xl border border-danger bg-danger/10 px-4 py-2 text-sm" role="alert">{{ problem() }}</p>
      }
      @if (busy() === 'connect') {
        <p class="text-sm text-muted">Connecting…</p>
      }

      @if (server(); as s) {
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="rounded-full bg-success/15 px-3 py-1 font-bold text-success">Connected</span>
          <span class="font-semibold">{{ s.name }}</span>
          @if (s.version) {
            <span class="text-muted">{{ s.version }}</span>
          }
          <span class="text-xs text-muted">protocol {{ s.protocolVersion }}</span>
        </div>
        @if (s.instructions) {
          <details class="text-sm">
            <summary class="cursor-pointer text-muted">Server instructions</summary>
            <p class="mt-2 whitespace-pre-wrap">{{ s.instructions }}</p>
          </details>
        }

        <div class="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Server features">
          @for (t of tabs(); track t.id) {
            <button
              type="button"
              role="tab"
              class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold"
              [class]="tab() === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'"
              [attr.aria-selected]="tab() === t.id"
              (click)="tab.set(t.id)"
            >
              {{ t.label }}
            </button>
          }
        </div>

        <div class="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <ul class="flex max-h-[28rem] flex-col gap-1 overflow-auto" [attr.aria-label]="tab()">
            @for (item of listItems(); track item.key) {
              <li>
                <button
                  type="button"
                  class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
                  [class.bg-surface]="selected() === item.key"
                  [attr.aria-pressed]="selected() === item.key"
                  (click)="select(item.key)"
                >
                  <span class="block truncate font-mono font-semibold">{{ item.label }}</span>
                  @if (item.description) {
                    <span class="line-clamp-2 block text-xs text-muted">{{ item.description }}</span>
                  }
                </button>
              </li>
            } @empty {
              <li class="px-3 py-2 text-sm text-muted">This server offers none.</li>
            }
          </ul>

          <div class="flex min-w-0 flex-col gap-3">
            @if (selected()) {
              @if (detail(); as d) {
                <h3 class="font-mono text-base font-semibold break-all">{{ d.label }}</h3>
                @if (d.description) {
                  <p class="text-sm whitespace-pre-wrap text-muted">{{ d.description }}</p>
                }
              }
              @if (tab() !== 'resources') {
                <span class="text-xs font-semibold text-muted uppercase">Arguments (JSON)</span>
                <app-code-editor class="h-40" language="json" ariaLabel="Arguments" [value]="args()" (valueChange)="args.set($event)" />
              }
              <button type="button" class="btn-primary self-start" [disabled]="!!busy()" (click)="run()">
                {{ busy() === 'run' ? 'Running…' : tab() === 'tools' ? 'Run tool' : tab() === 'resources' ? 'Read resource' : 'Get prompt' }}
              </button>
            } @else {
              <p class="text-sm text-muted">Choose an item on the left.</p>
            }

            @if (outcome(); as o) {
              <div class="flex flex-col gap-2 border-t border-line pt-3" aria-live="polite">
                <p class="text-sm">
                  <span class="font-semibold" [class.text-danger]="o.isError">{{ o.isError ? 'Error from ' : 'Result of ' }}{{ o.title }}</span>
                  <span class="text-muted"> · {{ o.ms }} ms</span>
                </p>
                @for (item of o.items; track $index) {
                  @if (item.type === 'image' && item.data) {
                    <img [src]="'data:' + item.mimeType + ';base64,' + item.data" alt="Image returned by the server" class="checkerboard max-h-72 self-start rounded-lg border border-line" />
                  } @else if (treeOf(textOf(item)); as root) {
                    <app-json-view [root]="root" />
                  } @else {
                    <pre class="max-h-96 overflow-auto rounded-lg bg-surface p-3 font-mono text-[13px] whitespace-pre-wrap break-words">{{ textOf(item) }}</pre>
                  }
                }
                <details>
                  <summary class="cursor-pointer text-sm text-muted">Raw JSON-RPC result</summary>
                  @if (treeOf(rawText(o)); as root) {
                    <app-json-view [root]="root" />
                  }
                </details>
              </div>
            }
          </div>
        </div>
      } @else if (!busy() && !problem()) {
        <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Enter the server's Streamable HTTP address (it often ends in /mcp) and choose Connect.
        </p>
      }
    </div>
  `,
})
export class McpPanel implements OnDestroy {
  readonly request = input.required<ApiRequest>();
  readonly variables = input<Map<string, string>>(new Map());
  readonly columns = input<KvColumns>({ value: true, description: true });
  readonly requestChange = output<Partial<ApiRequest>>();
  readonly columnsChange = output<KvColumns>();

  protected readonly server = signal<McpServerInfo | null>(null);
  protected readonly tools = signal<McpTool[]>([]);
  protected readonly resources = signal<McpResource[]>([]);
  protected readonly prompts = signal<McpPrompt[]>([]);
  protected readonly tab = signal<Tab>('tools');
  protected readonly selected = signal<string | null>(null);
  protected readonly args = signal('{}');
  protected readonly outcome = signal<Outcome | null>(null);
  protected readonly busy = signal<'connect' | 'run' | null>(null);
  protected readonly problem = signal('');

  protected readonly headerCount = computed(() => this.request().headers.filter((h) => h.enabled && h.key).length);
  protected readonly tabs = computed(() => [
    { id: 'tools' as const, label: `Tools (${this.tools().length})` },
    { id: 'resources' as const, label: `Resources (${this.resources().length})` },
    { id: 'prompts' as const, label: `Prompts (${this.prompts().length})` },
  ]);
  protected readonly listItems = computed(() => {
    switch (this.tab()) {
      case 'tools':
        return this.tools().map((t) => ({ key: t.name, label: t.title || t.name, description: t.description }));
      case 'resources':
        return this.resources().map((r) => ({ key: r.uri, label: r.title || r.name || r.uri, description: r.description || r.uri }));
      default:
        return this.prompts().map((p) => ({ key: p.name, label: p.title || p.name, description: p.description }));
    }
  });
  protected readonly detail = computed(() => this.listItems().find((i) => i.key === this.selected()) ?? null);

  private readonly analytics = inject(Analytics);
  private readonly requestId = computed(() => this.request().id);
  private client: McpClient | null = null;

  constructor() {
    effect(() => {
      this.requestId();
      untracked(() => this.disconnect());
    });
    // A new tab starts with nothing chosen.
    effect(() => {
      this.tab();
      untracked(() => {
        this.selected.set(null);
        this.outcome.set(null);
      });
    });
  }

  protected setUrl(url: string): void {
    this.requestChange.emit({ url, params: mergeUrlParams(url, this.request().params) });
  }

  protected async connect(): Promise<void> {
    this.disconnect();
    this.problem.set('');
    this.busy.set('connect');
    const fill = (text: string) => resolveVariables(text, this.variables());
    let url = fill(this.request().url.trim());
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const headers = Object.fromEntries(
      this.request()
        .headers.filter((h: KeyValue) => h.enabled && h.key.trim())
        .map((h) => [fill(h.key.trim()), fill(h.value)]),
    );
    const client = new McpClient(url, headers);
    this.client = client;
    this.analytics.track('api-connect', { kind: 'mcp' });
    try {
      const info = await client.initialize();
      const has = (capability: string) => capability in info.capabilities;
      const [tools, resources, prompts] = await Promise.all([
        has('tools') ? client.listTools() : [],
        has('resources') ? client.listResources() : [],
        has('prompts') ? client.listPrompts() : [],
      ]);
      if (this.client !== client) return;
      this.tools.set(tools);
      this.resources.set(resources);
      this.prompts.set(prompts);
      this.server.set(info);
      this.tab.set(tools.length || (!resources.length && !prompts.length) ? 'tools' : resources.length ? 'resources' : 'prompts');
    } catch (e) {
      if (this.client !== client) return;
      this.client = null;
      this.problem.set(e instanceof Error ? e.message : 'The server could not be reached.');
    } finally {
      if (this.busy() === 'connect') this.busy.set(null);
    }
  }

  protected disconnect(): void {
    void this.client?.close();
    this.client = null;
    this.server.set(null);
    this.tools.set([]);
    this.resources.set([]);
    this.prompts.set([]);
    this.selected.set(null);
    this.outcome.set(null);
    this.busy.set(null);
  }

  protected select(key: string): void {
    this.selected.set(key);
    this.outcome.set(null);
    if (this.tab() === 'tools') {
      const tool = this.tools().find((t) => t.name === key);
      this.args.set(JSON.stringify(schemaSkeleton(tool?.inputSchema), null, 2));
    } else if (this.tab() === 'prompts') {
      const prompt = this.prompts().find((p) => p.name === key);
      this.args.set(JSON.stringify(Object.fromEntries((prompt?.arguments ?? []).map((a) => [a.name, ''])), null, 2));
    }
  }

  protected async run(): Promise<void> {
    const client = this.client;
    const key = this.selected();
    if (!client || !key) return;
    let args: Record<string, unknown> = {};
    if (this.tab() !== 'resources') {
      try {
        args = JSON.parse(resolveVariables(this.args(), this.variables()) || '{}') as Record<string, unknown>;
      } catch {
        this.problem.set('The arguments are not valid JSON.');
        return;
      }
    }
    this.problem.set('');
    this.busy.set('run');
    const started = performance.now();
    const tab = this.tab();
    try {
      const raw =
        tab === 'tools'
          ? await client.callTool(key, args)
          : tab === 'resources'
            ? await client.readResource(key)
            : await client.getPrompt(key, args as Record<string, string>);
      this.outcome.set({ title: key, ms: Math.round(performance.now() - started), isError: !!(raw as { isError?: boolean })?.isError, items: itemsOf(raw), raw });
    } catch (e) {
      this.outcome.set({
        title: key,
        ms: Math.round(performance.now() - started),
        isError: true,
        items: [{ type: 'text', text: e instanceof Error ? e.message : 'The call failed.' }],
        raw: null,
      });
    } finally {
      this.busy.set(null);
    }
  }

  protected textOf(item: ContentItem): string {
    return item.text ?? item.resource?.text ?? (item.resource?.blob ? `[${item.resource.mimeType ?? 'binary'} data, Base64] ${item.resource.blob}` : JSON.stringify(item, null, 2));
  }

  protected rawText(outcome: Outcome): string {
    return JSON.stringify(outcome.raw, null, 2) ?? '';
  }

  protected treeOf(text: string) {
    if (!/^\s*[[{]/.test(text)) return null;
    try {
      JSON.parse(text);
      return parseTree(text);
    } catch {
      return null;
    }
  }

  ngOnDestroy(): void {
    void this.client?.close();
  }
}

/** The parts of a result to show: tool content, resource contents or prompt messages. */
function itemsOf(raw: unknown): ContentItem[] {
  const result = (raw ?? {}) as {
    content?: ContentItem[];
    contents?: ContentItem[];
    messages?: { role: string; content: ContentItem }[];
    structuredContent?: unknown;
  };
  if (result.content) return result.content;
  if (result.contents) return result.contents.map((c) => ({ ...c, type: c.text !== undefined ? 'text' : 'blob', resource: c as ContentItem['resource'] }));
  if (result.messages) return result.messages.map((m) => ({ ...m.content, text: `${m.role}: ${m.content.text ?? JSON.stringify(m.content)}` }));
  return [{ type: 'text', text: JSON.stringify(raw, null, 2) }];
}
