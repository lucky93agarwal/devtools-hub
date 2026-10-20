import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { copyText, formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { parseTree } from '../json-formatter/json-tree';
import { mergeUrlParams, resolveVariables, urlWithParams } from './build';
import { JsonView } from './json-view';
import { KvColumns, KvTable } from './kv-table';
import { ApiRequest, KeyValue, MqttSettings, QoS, REQUEST_KINDS, RealtimeSettings, defaultMqtt, defaultRealtime } from './model';
import {
  LogDirection,
  LogEntry,
  RealtimeConnection,
  RealtimeHandlers,
  blockedReason,
  connectMqtt,
  connectSocketIo,
  connectWebSocket,
  mqttUrl,
  socketIoUrl,
  webSocketUrl,
} from './realtime';
import { SearchBox } from './search-box';

/** Older messages are dropped past this, so a busy feed cannot slow the page down. */
const MAX_LOG = 1000;

type Status = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * A WebSocket or Socket.IO request, as in Postman: connect, write and send
 * messages, keep favourites, and read everything sent and received, newest first.
 */
@Component({
  selector: 'app-realtime-panel',
  imports: [CodeEditor, Icon, JsonView, KvTable, SearchBox],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip shrink-0 font-mono text-xs text-brand">{{ kindInfo().badge }}</span>
        <input
          type="text"
          class="min-w-0 flex-1 basis-full rounded-full border border-line bg-page px-4 py-2.5 font-mono text-sm sm:basis-auto"
          spellcheck="false"
          autocomplete="off"
          aria-label="URL"
          [placeholder]="isSocketIo() ? 'https://example.com/namespace' : isMqtt() ? 'wss://broker.example.com:8084/mqtt' : 'wss://echo.websocket.org'"
          [value]="request().url"
          (input)="setUrl($any($event.target).value)"
          (keydown.enter)="toggleConnection()"
        />
        @if (status() === 'open' || status() === 'connecting') {
          <button type="button" class="btn-secondary shrink-0" (click)="disconnect()">
            {{ status() === 'connecting' ? 'Cancel' : 'Disconnect' }}
          </button>
        } @else {
          <button type="button" class="btn-primary shrink-0" [disabled]="!request().url.trim()" (click)="connect()">Connect</button>
        }
      </div>
      @if (problem()) {
        <p class="text-sm text-danger" role="alert">{{ problem() }}</p>
      }

      <div class="flex flex-wrap items-center gap-1 border-b border-line" role="tablist" aria-label="Connection">
        @for (tab of tabs(); track tab.id) {
          <button
            type="button"
            role="tab"
            class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold"
            [class]="tabId() === tab.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'"
            [attr.aria-selected]="tabId() === tab.id"
            (click)="tabId.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      @switch (tabId()) {
        @case ('message') {
          @if (isMqtt()) {
            <div class="flex flex-col gap-2 rounded-xl border border-line p-3">
              <span class="text-xs font-semibold text-muted uppercase">Subscriptions</span>
              @for (sub of mqtt().subscriptions; track $index; let i = $index) {
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    class="size-4 accent-brand"
                    [attr.aria-label]="'Listen to ' + sub.topic"
                    [checked]="sub.enabled"
                    (change)="toggleSubscription(i, $any($event.target).checked)"
                  />
                  <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ sub.topic }}</span>
                  <span class="chip px-2 py-0.5 text-xs">QoS {{ sub.qos }}</span>
                  <button type="button" class="text-muted hover:text-danger" [attr.aria-label]="'Remove subscription ' + sub.topic" (click)="removeSubscription(i)">&times;</button>
                </div>
              }
              <div class="flex flex-wrap items-center gap-2">
                <input
                  #newTopic
                  type="text"
                  class="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                  placeholder="sensors/+/temperature or devices/#"
                  aria-label="Topic to subscribe to"
                  spellcheck="false"
                  (keydown.enter)="addSubscription(newTopic, newQos)"
                />
                <select #newQos class="rounded-lg border border-line bg-page px-2 py-1.5 text-sm" aria-label="Subscription QoS">
                  <option value="0">QoS 0</option>
                  <option value="1">QoS 1</option>
                  <option value="2">QoS 2</option>
                </select>
                <button type="button" class="btn-small" (click)="addSubscription(newTopic, newQos)">Subscribe</button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex min-w-0 flex-1 items-center gap-2 text-sm">
                Topic
                <input
                  type="text"
                  class="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                  aria-label="Publish topic"
                  placeholder="devices/42/commands"
                  spellcheck="false"
                  [value]="mqtt().topic"
                  (input)="setMqtt({ topic: $any($event.target).value })"
                />
              </label>
              <select
                class="rounded-lg border border-line bg-page px-2 py-1.5 text-sm"
                aria-label="Publish QoS"
                (change)="setMqtt({ qos: toQos($any($event.target).value) })"
              >
                @for (q of [0, 1, 2]; track q) {
                  <option [value]="q" [selected]="mqtt().qos === q">QoS {{ q }}</option>
                }
              </select>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4 accent-brand" [checked]="mqtt().retain" (change)="setMqtt({ retain: $any($event.target).checked })" />
                Retain
              </label>
            </div>
          }
          @if (isSocketIo()) {
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2 text-sm">
                Event
                <input
                  type="text"
                  class="w-48 rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                  aria-label="Event name"
                  spellcheck="false"
                  [value]="settings().event"
                  (input)="setSettings({ event: $any($event.target).value })"
                />
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4 accent-brand" [checked]="settings().ack" (change)="setSettings({ ack: $any($event.target).checked })" />
                Wait for acknowledgement
              </label>
            </div>
          }
          <app-code-editor
            class="h-40"
            ariaLabel="Message"
            [language]="settings().format === 'json' ? 'json' : 'plaintext'"
            [placeholder]="settings().format === 'json' ? '{&quot;type&quot;: &quot;ping&quot;}' : 'Write a message'"
            [value]="settings().message"
            (valueChange)="setMessage($event)"
          />
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded-lg border border-line bg-page px-2 py-1.5 text-sm font-semibold"
              aria-label="Message format"
              (change)="setSettings({ format: $any($event.target).value })"
            >
              <option value="text" [selected]="settings().format === 'text'">Text</option>
              <option value="json" [selected]="settings().format === 'json'">JSON</option>
            </select>
            <button type="button" class="btn-small" [disabled]="!settings().message" (click)="saveMessage()">Save message</button>
            <button
              type="button"
              class="ml-auto"
              [class]="status() === 'open' ? 'btn-primary' : 'btn-secondary'"
              [disabled]="status() !== 'open' || !settings().message"
              (click)="send()"
            >
              Send
            </button>
          </div>
          @if (settings().saved.length) {
            <div class="flex flex-col gap-1">
              <span class="text-xs font-semibold text-muted uppercase">Saved messages</span>
              <div class="flex flex-wrap gap-2">
                @for (saved of settings().saved; track $index; let i = $index) {
                  <span class="chip gap-1 py-1 pr-1">
                    <button type="button" class="max-w-56 truncate font-mono text-xs text-ink" [title]="saved.message" (click)="useSaved(i)">
                      {{ saved.name }}
                    </button>
                    <button
                      type="button"
                      class="grid size-5 place-items-center rounded-full hover:bg-surface"
                      [attr.aria-label]="'Remove saved message ' + saved.name"
                      (click)="removeSaved(i)"
                    >
                      &times;
                    </button>
                  </span>
                }
              </div>
            </div>
          }
        }
        @case ('params') {
          <app-kv-table [rows]="request().params" [columns]="columns()" (columnsChange)="columnsChange.emit($event)" (rowsChange)="setParams($event)" />
        }
        @case ('settings') {
          @if (isMqtt()) {
            <div class="grid gap-3 sm:grid-cols-2">
              @for (field of mqttFields; track field.key) {
                <label class="flex flex-col gap-1 text-sm">
                  <span class="font-semibold">{{ field.label }}</span>
                  <input
                    class="rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                    spellcheck="false"
                    autocomplete="off"
                    [type]="field.type"
                    [attr.aria-label]="field.label"
                    [placeholder]="field.placeholder"
                    [value]="mqtt()[field.key]"
                    (input)="setMqttField(field.key, $any($event.target).value)"
                  />
                </label>
              }
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4 accent-brand" [checked]="mqtt().clean" (change)="setMqtt({ clean: $any($event.target).checked })" />
                Clean session
              </label>
            </div>
            <p class="text-xs text-muted">
              Browsers reach MQTT brokers only over WebSocket (ws:// or wss://, often port 8083/8084 with path /mqtt), not
              plain TCP port 1883 or 8883. The password is saved with the request in this browser.
            </p>
          } @else if (isSocketIo()) {
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-semibold">Path</span>
              <input
                type="text"
                class="w-full max-w-sm rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                aria-label="Socket.IO path"
                spellcheck="false"
                [value]="settings().path"
                (input)="setSettings({ path: $any($event.target).value })"
              />
            </label>
            <div class="flex flex-col gap-1 text-sm">
              <span class="font-semibold">Handshake auth (JSON)</span>
              <app-code-editor
                class="h-28"
                language="json"
                ariaLabel="Handshake auth"
                [placeholder]="authPlaceholder"
                [value]="settings().auth"
                (valueChange)="setSettings({ auth: $event })"
              />
              <span class="text-xs text-muted">The server reads it from socket.handshake.auth. Put tokens here, since browsers cannot add headers.</span>
            </div>
          } @else {
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-semibold">Subprotocols</span>
              <input
                type="text"
                class="w-full max-w-sm rounded-lg border border-line bg-page px-3 py-1.5 font-mono text-sm"
                aria-label="Subprotocols"
                placeholder="graphql-ws, chat"
                spellcheck="false"
                [value]="settings().protocols"
                (input)="setSettings({ protocols: $any($event.target).value })"
              />
            </label>
            <p class="text-xs text-muted">
              Browsers cannot send custom headers when opening a WebSocket. Send a token in a query param, a subprotocol or
              the first message instead.
            </p>
          }
        }
      }

      <!-- Messages -->
      <section class="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="messages-heading">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="messages-heading" class="text-lg leading-7">Messages</h2>
          <span class="rounded-full px-3 py-1 text-sm font-bold" [class]="statusClass()" aria-live="polite">{{ statusText() }}</span>
          @if (log().length) {
            <span class="text-sm text-muted">{{ log().length }} {{ log().length === 1 ? 'message' : 'messages' }}</span>
            <button type="button" class="btn-small ml-auto" (click)="clearLog()">Clear</button>
          }
        </div>
        @if (log().length) {
          <app-search-box
            class="w-full sm:max-w-md"
            label="Search messages"
            placeholder="Filter messages"
            [stepper]="false"
            [total]="shownLog().length"
            [(query)]="filter"
          />
          <ol class="flex flex-col divide-y divide-line rounded-xl border border-line" aria-label="Message log">
            @for (entry of shownLog(); track entry.id) {
              <li class="text-sm">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface"
                  [attr.aria-expanded]="open() === entry.id"
                  (click)="open.set(open() === entry.id ? null : entry.id)"
                >
                  <span class="w-5 shrink-0 text-center font-bold" [class]="arrowClass[entry.direction]" [attr.aria-label]="arrowLabel[entry.direction]">
                    {{ arrow[entry.direction] }}
                  </span>
                  @if (entry.event) {
                    <span class="chip shrink-0 px-2 py-0.5 font-mono text-xs">{{ entry.event }}</span>
                  }
                  <span class="min-w-0 flex-1 truncate font-mono text-[13px]" [class.text-danger]="entry.direction === 'error'">
                    {{ entry.text }}
                  </span>
                  @if (entry.direction === 'in' || entry.direction === 'out') {
                    <span class="shrink-0 text-xs text-muted">{{ formatBytes(entry.size) }}</span>
                  }
                  <time class="shrink-0 font-mono text-xs text-muted">{{ time(entry.at) }}</time>
                </button>
                @if (open() === entry.id) {
                  <div class="flex flex-col gap-2 px-3 pb-3">
                    @if (entry.binary) {
                      <p class="text-xs text-muted">Binary message, shown as Base64.</p>
                    }
                    @if (treeOf(entry); as root) {
                      <app-json-view [root]="root" />
                    } @else {
                      <pre class="max-h-72 overflow-auto rounded-lg bg-surface p-3 font-mono text-[13px] whitespace-pre-wrap break-all">{{ entry.text }}</pre>
                    }
                    <div class="flex gap-2">
                      <button type="button" class="btn-small px-2.5" aria-label="Copy message" data-tip="Copy message" (click)="copyEntry(entry)">
                        <app-icon [path]="icons.copy" [size]="16" />
                      </button>
                      @if (entry.direction === 'in' || entry.direction === 'out') {
                        <button type="button" class="btn-small" (click)="reuse(entry)">Edit and send again</button>
                      }
                    </div>
                  </div>
                }
              </li>
            }
          </ol>
        } @else {
          <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Connect, then send a message. Everything sent and received shows here, newest first.
          </p>
        }
        @if (note()) {
          <p class="text-sm font-semibold text-success" aria-live="polite">{{ note() }}</p>
        }
      </section>
    </div>
  `,
})
export class RealtimePanel implements OnDestroy {
  readonly request = input.required<ApiRequest>();
  /** {{variables}} from the collection and environment. */
  readonly variables = input<Map<string, string>>(new Map());
  readonly columns = input<KvColumns>({ value: true, description: true });
  readonly requestChange = output<Partial<ApiRequest>>();
  readonly columnsChange = output<KvColumns>();

  protected readonly icons = ICONS;
  protected readonly authPlaceholder = '{"token": "{{token}}"}';
  protected readonly formatBytes = formatBytes;
  protected readonly arrow: Record<LogDirection, string> = { out: '↑', in: '↓', info: 'i', error: '!' };
  protected readonly arrowLabel: Record<LogDirection, string> = { out: 'Sent', in: 'Received', info: 'Info', error: 'Error' };
  protected readonly arrowClass: Record<LogDirection, string> = {
    out: 'text-brand',
    in: 'text-success',
    info: 'text-muted',
    error: 'text-danger',
  };

  protected readonly status = signal<Status>('idle');
  protected readonly log = signal<LogEntry[]>([]);
  protected readonly filter = signal('');
  protected readonly open = signal<number | null>(null);
  protected readonly problem = signal('');
  protected readonly note = signal('');
  protected readonly tabId = signal<'message' | 'params' | 'settings'>('message');

  /** Only a different request resets the connection, not edits to this one. */
  private readonly requestId = computed(() => this.request().id);
  protected readonly isSocketIo = computed(() => this.request().kind === 'socketio');
  protected readonly isMqtt = computed(() => this.request().kind === 'mqtt');
  protected readonly mqtt = computed(() => ({ ...defaultMqtt(), ...this.request().realtime?.mqtt }));
  protected readonly mqttFields: { key: 'clientId' | 'username' | 'password' | 'keepalive'; label: string; type: string; placeholder: string }[] = [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Random when empty' },
    { key: 'keepalive', label: 'Keep alive (seconds)', type: 'number', placeholder: '60' },
    { key: 'username', label: 'Username', type: 'text', placeholder: '' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '' },
  ];
  protected readonly kindInfo = computed(() => REQUEST_KINDS.find((k) => k.value === this.request().kind) ?? REQUEST_KINDS[1]);
  protected readonly settings = computed(() => ({ ...defaultRealtime(), ...this.request().realtime }));
  protected readonly tabs = computed(() => [
    { id: 'message' as const, label: 'Message' },
    { id: 'params' as const, label: `Params${this.request().params.filter((p) => p.enabled && p.key).length ? ` (${this.request().params.filter((p) => p.enabled && p.key).length})` : ''}` },
    { id: 'settings' as const, label: 'Settings' },
  ]);
  protected readonly shownLog = computed(() => {
    const query = this.filter().toLowerCase();
    const entries = [...this.log()].reverse();
    return query ? entries.filter((e) => `${e.event ?? ''} ${e.text}`.toLowerCase().includes(query)) : entries;
  });
  protected readonly statusText = computed(
    () => ({ idle: 'Not connected', connecting: 'Connecting…', open: 'Connected', closed: 'Disconnected' })[this.status()],
  );
  protected readonly statusClass = computed(
    () =>
      ({
        idle: 'bg-surface text-muted',
        connecting: 'bg-warning/15 text-warning',
        open: 'bg-success/15 text-success',
        closed: 'bg-surface text-muted',
      })[this.status()],
  );

  private readonly analytics = inject(Analytics);
  private connection: RealtimeConnection | null = null;
  /** Each connection gets a number, so late events from an old one are ignored. */
  private generation = 0;
  private nextId = 1;
  private noteTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Switching to another request closes this one's connection and starts a fresh log.
    effect(() => {
      this.requestId();
      untracked(() => {
        this.disconnect();
        this.log.set([]);
        this.status.set('idle');
        this.problem.set('');
      });
    });
  }

  // Editing

  protected setUrl(url: string): void {
    this.requestChange.emit({ url, params: mergeUrlParams(url, this.request().params) });
  }

  protected setParams(params: KeyValue[]): void {
    this.requestChange.emit({ params, url: urlWithParams(this.request().url, params) });
  }

  protected setSettings(changes: Partial<RealtimeSettings>): void {
    this.requestChange.emit({ realtime: { ...this.settings(), ...changes } });
  }

  protected setMqtt(changes: Partial<MqttSettings>): void {
    this.setSettings({ mqtt: { ...this.mqtt(), ...changes } });
  }

  protected toQos(value: string): QoS {
    return Math.min(2, Math.max(0, Number(value) || 0)) as QoS;
  }

  protected setMqttField(key: 'clientId' | 'username' | 'password' | 'keepalive', value: string): void {
    this.setMqtt(key === 'keepalive' ? { keepalive: Number(value) || 60 } : { [key]: value });
  }

  protected addSubscription(input: HTMLInputElement, qosSelect: HTMLSelectElement): void {
    const topic = input.value.trim();
    if (!topic) return;
    const qos = this.toQos(qosSelect.value);
    this.setMqtt({ subscriptions: [...this.mqtt().subscriptions.filter((s) => s.topic !== topic), { topic, qos, enabled: true }] });
    input.value = '';
    this.connection?.subscribe?.(resolveVariables(topic, this.variables()), qos);
  }

  protected toggleSubscription(index: number, enabled: boolean): void {
    const subscriptions = this.mqtt().subscriptions.map((s, i) => (i === index ? { ...s, enabled } : s));
    this.setMqtt({ subscriptions });
    const sub = subscriptions[index];
    const topic = resolveVariables(sub.topic, this.variables());
    if (enabled) this.connection?.subscribe?.(topic, sub.qos);
    else this.connection?.unsubscribe?.(topic);
  }

  protected removeSubscription(index: number): void {
    const sub = this.mqtt().subscriptions[index];
    if (sub.enabled) this.connection?.unsubscribe?.(resolveVariables(sub.topic, this.variables()));
    this.setMqtt({ subscriptions: this.mqtt().subscriptions.filter((_, i) => i !== index) });
  }

  protected setMessage(message: string): void {
    if (message !== this.settings().message) this.setSettings({ message });
  }

  protected saveMessage(): void {
    const { message, format, event, saved } = this.settings();
    const name = message.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Message';
    this.setSettings({ saved: [...saved, { name, message, format, event }] });
    this.say('Message saved');
  }

  protected useSaved(index: number): void {
    const { message, format, event } = this.settings().saved[index];
    this.setSettings({ message, format, event });
  }

  protected removeSaved(index: number): void {
    this.setSettings({ saved: this.settings().saved.filter((_, i) => i !== index) });
  }

  protected reuse(entry: LogEntry): void {
    const json = (() => {
      try {
        JSON.parse(entry.text);
        return true;
      } catch {
        return false;
      }
    })();
    this.setSettings({ message: entry.text, format: json ? 'json' : 'text', ...(entry.event && this.isSocketIo() ? { event: entry.event } : {}) });
    if (entry.event && this.isMqtt()) this.setMqtt({ topic: entry.event.replace(/ \(retained\)$/, '') });
    this.tabId.set('message');
  }

  // Connecting

  protected toggleConnection(): void {
    if (this.status() === 'open' || this.status() === 'connecting') this.disconnect();
    else this.connect();
  }

  protected async connect(): Promise<void> {
    this.disconnect();
    this.problem.set('');
    const fill = (text: string) => resolveVariables(text, this.variables());
    const raw = fill(this.request().url);
    const url = this.isSocketIo() ? socketIoUrl(raw) : this.isMqtt() ? mqttUrl(raw) : webSocketUrl(raw);
    const blocked = blockedReason(url, location.protocol);
    if (blocked) {
      this.problem.set(blocked);
      return;
    }

    const generation = ++this.generation;
    const live = () => generation === this.generation;
    const handlers: RealtimeHandlers = {
      open: (text) => {
        if (!live()) return;
        this.status.set('open');
        this.add('info', text);
      },
      receive: (text, size, details) => {
        if (live()) this.add('in', text, size, details);
      },
      closed: (text) => {
        if (!live()) return;
        this.status.set('closed');
        this.add('info', text);
        this.connection = null;
      },
      info: (text) => {
        if (live()) this.add('info', text);
      },
      error: (text) => {
        if (!live()) return;
        this.add('error', text);
        if (this.status() === 'connecting') this.status.set('closed');
      },
    };

    this.status.set('connecting');
    this.add('info', `Connecting to ${url}…`);
    this.analytics.track('api-connect', { kind: this.request().kind ?? 'websocket' });
    try {
      if (this.isMqtt()) {
        const m = this.mqtt();
        const connection = await connectMqtt(
          url,
          {
            clientId: fill(m.clientId),
            username: fill(m.username),
            password: fill(m.password),
            keepalive: m.keepalive,
            clean: m.clean,
            subscriptions: m.subscriptions.filter((s) => s.enabled && s.topic).map((s) => ({ topic: fill(s.topic), qos: s.qos })),
          },
          handlers,
        );
        if (live()) this.connection = connection;
        else connection.close();
      } else if (this.isSocketIo()) {
        const authText = fill(this.settings().auth).trim();
        let auth: Record<string, unknown> | undefined;
        if (authText) {
          try {
            auth = JSON.parse(authText) as Record<string, unknown>;
          } catch {
            throw new Error('The handshake auth is not valid JSON.');
          }
        }
        const connection = await connectSocketIo(url, { path: this.settings().path, auth }, handlers);
        if (live()) this.connection = connection;
        else connection.close();
      } else {
        const protocols = fill(this.settings().protocols)
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        this.connection = connectWebSocket(url, protocols, handlers);
      }
    } catch (e) {
      if (!live()) return;
      this.status.set('closed');
      this.add('error', e instanceof Error ? e.message : 'The connection could not be opened.');
    }
  }

  protected disconnect(): void {
    this.connection?.close();
    this.connection = null;
    if (this.status() === 'connecting') {
      this.generation++;
      this.status.set('closed');
      this.add('info', 'Cancelled');
    }
  }

  protected send(): void {
    if (!this.connection) return;
    const { message, format, event, ack } = this.settings();
    try {
      const m = this.mqtt();
      const topic = resolveVariables(m.topic, this.variables());
      const sent = this.connection.send(resolveVariables(message, this.variables()), format, {
        event: event || 'message',
        ack,
        topic,
        qos: m.qos,
        retain: m.retain,
      });
      const label = this.isSocketIo() ? event || 'message' : this.isMqtt() ? topic : undefined;
      this.add('out', sent.text, sent.size, label ? { event: label } : undefined);
    } catch (e) {
      this.problem.set(e instanceof Error ? e.message : 'The message could not be sent.');
      return;
    }
    this.problem.set('');
  }

  // Log

  protected clearLog(): void {
    this.log.set([]);
    this.open.set(null);
  }

  protected treeOf(entry: LogEntry) {
    if (entry.binary || !/^\s*[[{]/.test(entry.text)) return null;
    try {
      JSON.parse(entry.text);
      return parseTree(entry.text);
    } catch {
      return null;
    }
  }

  protected async copyEntry(entry: LogEntry): Promise<void> {
    this.say((await copyText(entry.text)) ? 'Message copied' : 'Copy failed');
  }

  protected time(at: number): string {
    const date = new Date(at);
    return `${date.toTimeString().slice(0, 8)}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  private add(direction: LogDirection, text: string, size = 0, details?: { event?: string; binary?: boolean }): void {
    const entry: LogEntry = { id: this.nextId++, at: Date.now(), direction, text, size, ...details };
    this.log.update((log) => (log.length >= MAX_LOG ? [...log.slice(log.length - MAX_LOG + 1), entry] : [...log, entry]));
  }

  private say(text: string): void {
    this.note.set(text);
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => this.note.set(''), 2000);
  }

  ngOnDestroy(): void {
    this.generation++;
    this.connection?.close();
    clearTimeout(this.noteTimer);
  }
}
