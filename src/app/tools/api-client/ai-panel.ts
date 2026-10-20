import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { copyText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { AI_PROVIDERS, AiUsage, ChatMessage, aiErrorMessage, buildAiRequest, parseAiResponse, readSse, streamDelta } from './ai';
import { resolveVariables } from './build';
import { AiSettings, ApiRequest, defaultAi } from './model';

interface Turn extends ChatMessage {
  usage?: AiUsage;
  ms?: number;
  error?: boolean;
}

/**
 * An AI request, like Postman's: pick a provider and model, write a prompt and
 * read the answer as it streams in. The conversation can go on for several turns.
 */
@Component({
  selector: 'app-ai-panel',
  imports: [Icon],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip shrink-0 font-mono text-xs text-brand">AI</span>
        <select
          class="rounded-full border border-line bg-page px-3 py-2 text-sm font-semibold"
          aria-label="AI provider"
          (change)="setProvider($any($event.target).value)"
        >
          @for (p of providers; track p.value) {
            <option [value]="p.value" [selected]="ai().provider === p.value">{{ p.label }}</option>
          }
        </select>
        <input
          type="text"
          list="ai-models"
          class="min-w-0 flex-1 basis-40 rounded-full border border-line bg-page px-4 py-2 font-mono text-sm"
          aria-label="Model"
          placeholder="Model"
          spellcheck="false"
          [value]="ai().model"
          (input)="set({ model: $any($event.target).value })"
        />
        <datalist id="ai-models">
          @for (m of providerInfo().models; track m) {
            <option [value]="m"></option>
          }
        </datalist>
      </div>

      @if (ai().provider === 'compatible') {
        <input
          type="text"
          class="rounded-full border border-line bg-page px-4 py-2 font-mono text-sm"
          aria-label="Base URL"
          placeholder="https://openrouter.ai/api/v1 or http://localhost:11434/v1"
          spellcheck="false"
          [value]="ai().baseUrl"
          (input)="set({ baseUrl: $any($event.target).value })"
        />
      }
      <div class="flex items-center gap-2">
        <input
          [type]="showKey() ? 'text' : 'password'"
          class="min-w-0 flex-1 rounded-full border border-line bg-page px-4 py-2 font-mono text-sm"
          aria-label="API key"
          autocomplete="off"
          spellcheck="false"
          [placeholder]="'{{OPENAI_API_KEY}} or ' + providerInfo().keyHint"
          [value]="ai().apiKey"
          (input)="set({ apiKey: $any($event.target).value })"
        />
        <button type="button" class="btn-small" (click)="showKey.set(!showKey())">{{ showKey() ? 'Hide' : 'Show' }}</button>
      </div>
      <p class="text-xs text-muted">
        The key goes from this browser straight to the provider and is saved with the request in this browser only. Put it
        in an environment variable, such as {{ '{{OPENAI_API_KEY}}' }}, to keep it out of shared collections.
      </p>

      <details class="rounded-xl border border-line px-3 py-2">
        <summary class="cursor-pointer text-sm font-semibold">Settings and system prompt</summary>
        <div class="mt-3 flex flex-col gap-3">
          <textarea
            rows="3"
            class="rounded-xl border border-line bg-page p-3 text-sm"
            aria-label="System prompt"
            placeholder="You are a helpful assistant."
            [value]="ai().system"
            (input)="set({ system: $any($event.target).value })"
          ></textarea>
          <div class="flex flex-wrap items-center gap-4 text-sm">
            <label class="flex items-center gap-2">
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                class="w-20 rounded-lg border border-line bg-page px-2 py-1"
                aria-label="Temperature"
                placeholder="Default"
                [value]="ai().temperature ?? ''"
                (input)="setTemperature($any($event.target).value)"
              />
            </label>
            <label class="flex items-center gap-2">
              Max tokens
              <input
                type="number"
                min="1"
                class="w-24 rounded-lg border border-line bg-page px-2 py-1"
                aria-label="Max tokens"
                [value]="ai().maxTokens"
                (input)="set({ maxTokens: +$any($event.target).value || 1024 })"
              />
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" class="size-4 accent-brand" [checked]="ai().stream" (change)="set({ stream: $any($event.target).checked })" />
              Stream the answer
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" class="size-4 accent-brand" [checked]="keepThread()" (change)="keepThread.set($any($event.target).checked)" />
              Keep the conversation
            </label>
          </div>
        </div>
      </details>

      <section class="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="ai-heading">
        <div class="flex flex-wrap items-center gap-3">
          <h2 id="ai-heading" class="text-lg leading-7">Conversation</h2>
          @if (thread().length) {
            <button type="button" class="btn-small ml-auto" (click)="clear()">Clear</button>
          }
        </div>
        @for (turn of thread(); track $index) {
          <div
            class="flex flex-col gap-1 rounded-xl border px-4 py-3"
            [class]="turn.error ? 'border-danger bg-danger/10' : turn.role === 'user' ? 'border-line bg-surface' : 'border-line'"
          >
            <div class="flex items-center gap-2 text-xs font-semibold text-muted uppercase">
              {{ turn.role === 'user' ? 'You' : turn.error ? 'Error' : ai().model }}
              @if (turn.role === 'assistant' && !turn.error) {
                <button type="button" class="ml-auto normal-case hover:text-ink" [attr.aria-label]="'Copy answer ' + ($index + 1)" data-tip="Copy answer" data-tip-side="left" (click)="copy(turn.content)">
                  <app-icon [path]="icons.copy" [size]="14" />
                </button>
              }
            </div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-words" [attr.aria-live]="$last && busy() ? 'polite' : null">{{ turn.content }}@if ($last && busy()) {<span class="animate-pulse">▍</span>}</div>
            @if (turn.ms !== undefined) {
              <p class="text-xs text-muted">
                {{ turn.ms }} ms
                @if (turn.usage?.input !== undefined || turn.usage?.output !== undefined) {
                  · {{ turn.usage?.input ?? '?' }} tokens in, {{ turn.usage?.output ?? '?' }} out
                }
              </p>
            }
          </div>
        } @empty {
          <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Write a prompt and choose Send. The request goes from your browser straight to the AI provider.
          </p>
        }
        <textarea
          rows="4"
          class="rounded-xl border border-line bg-page p-3 text-sm"
          aria-label="Prompt"
          placeholder="Ask anything. Ctrl+Enter or ⌘+Enter sends."
          [value]="ai().prompt"
          (input)="set({ prompt: $any($event.target).value })"
          (keydown.control.enter)="send()"
          (keydown.meta.enter)="send()"
        ></textarea>
        <div class="flex items-center gap-2">
          @if (note()) {
            <span class="text-sm font-semibold text-success" aria-live="polite">{{ note() }}</span>
          }
          @if (busy()) {
            <button type="button" class="btn-secondary ml-auto" (click)="stop()">Stop</button>
          } @else {
            <button type="button" class="btn-primary ml-auto" [disabled]="!ai().prompt.trim() || !ai().model.trim()" (click)="send()">
              Send
            </button>
          }
        </div>
      </section>
    </div>
  `,
})
export class AiPanel implements OnDestroy {
  readonly request = input.required<ApiRequest>();
  readonly variables = input<Map<string, string>>(new Map());
  readonly requestChange = output<Partial<ApiRequest>>();

  protected readonly icons = ICONS;
  protected readonly providers = AI_PROVIDERS;
  protected readonly ai = computed(() => ({ ...defaultAi(), ...this.request().ai }));
  protected readonly providerInfo = computed(() => AI_PROVIDERS.find((p) => p.value === this.ai().provider) ?? AI_PROVIDERS[0]);
  protected readonly thread = signal<Turn[]>([]);
  protected readonly busy = signal(false);
  protected readonly showKey = signal(false);
  protected readonly keepThread = signal(true);
  protected readonly note = signal('');

  private readonly analytics = inject(Analytics);
  private readonly requestId = computed(() => this.request().id);
  private controller: AbortController | null = null;
  private noteTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Another request starts its own conversation.
    effect(() => {
      this.requestId();
      untracked(() => {
        this.stop();
        this.thread.set([]);
      });
    });
  }

  protected set(changes: Partial<AiSettings>): void {
    this.requestChange.emit({ ai: { ...this.ai(), ...changes } });
  }

  protected setProvider(provider: AiSettings['provider']): void {
    const models = AI_PROVIDERS.find((p) => p.value === provider)?.models ?? [];
    this.set({ provider, model: models[0] ?? '' });
  }

  protected setTemperature(value: string): void {
    this.set({ temperature: value === '' ? null : Number(value) });
  }

  protected clear(): void {
    this.stop();
    this.thread.set([]);
  }

  protected stop(): void {
    this.controller?.abort();
    this.controller = null;
  }

  protected async send(): Promise<void> {
    const settings = this.ai();
    const prompt = settings.prompt.trim();
    if (this.busy() || !prompt || !settings.model.trim()) return;
    const fill = (text: string) => resolveVariables(text, this.variables());
    const history = this.keepThread() ? this.thread().filter((t) => !t.error) : [];
    const messages: ChatMessage[] = [...history.map(({ role, content }) => ({ role, content })), { role: 'user', content: fill(prompt) }];
    const request = buildAiRequest({ ...settings, model: fill(settings.model), baseUrl: fill(settings.baseUrl), system: fill(settings.system) }, messages, fill(settings.apiKey).trim());

    this.thread.set([...(this.keepThread() ? this.thread() : []), { role: 'user', content: fill(prompt) }, { role: 'assistant', content: '' }]);
    this.set({ prompt: '' });
    this.busy.set(true);
    this.controller = new AbortController();
    const started = performance.now();
    this.analytics.track('api-ai', { provider: settings.provider, stream: settings.stream });
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: this.controller.signal,
      });
      if (!response.ok) throw new Error(aiErrorMessage(response.status, await response.text()));
      let usage: AiUsage = {};
      if (settings.stream && response.body) {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const { events, rest } = readSse(buffer + value);
          buffer = rest;
          for (const data of events) {
            try {
              const delta = streamDelta(settings.provider, JSON.parse(data));
              usage = { ...usage, ...Object.fromEntries(Object.entries(delta.usage).filter(([, v]) => v !== undefined)) };
              if (delta.text) this.updateLast({ content: this.lastContent() + delta.text });
            } catch {
              // A keep-alive or other non-JSON line.
            }
          }
        }
      } else {
        const parsed = parseAiResponse(settings.provider, await response.json());
        usage = parsed.usage;
        this.updateLast({ content: parsed.text });
      }
      if (!this.lastContent()) this.updateLast({ content: '(The model sent an empty answer.)' });
      this.updateLast({ usage, ms: Math.round(performance.now() - started) });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      const message = aborted
        ? this.lastContent() + '\n(Stopped.)'
        : e instanceof TypeError
          ? settings.provider === 'openai'
            ? 'OpenAI refused the request without saying why: it hides error details from web pages. Most often the API key is wrong, has no credit, or cannot use this model.'
            : 'The browser could not reach the provider. Check the base URL; a local server such as Ollama must allow this site (OLLAMA_ORIGINS).'
          : e instanceof Error
            ? e.message
            : 'The request failed.';
      this.updateLast({ content: message, error: !aborted, ms: Math.round(performance.now() - started) });
    } finally {
      this.busy.set(false);
      this.controller = null;
    }
  }

  protected async copy(text: string): Promise<void> {
    this.note.set((await copyText(text)) ? 'Answer copied' : 'Copy failed');
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => this.note.set(''), 2000);
  }

  private lastContent(): string {
    return this.thread().at(-1)?.content ?? '';
  }

  private updateLast(changes: Partial<Turn>): void {
    this.thread.update((thread) => [...thread.slice(0, -1), { ...thread.at(-1)!, ...changes }]);
  }

  ngOnDestroy(): void {
    this.stop();
    clearTimeout(this.noteTimer);
  }
}
