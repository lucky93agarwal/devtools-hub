import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { downloadText } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { CATEGORIES, TEMPLATES, renderTemplate, type AssistantProfile, type Channel, type MessageTemplate } from './templates';

const CONTENT: ToolContent = {
  aboutHeading: 'About the message assistant',
  about:
    'Write workplace messages faster. Paste rough notes, even in Hinglish, and get polished professional English as an ' +
    'email (with subject and sign-off) or a short Slack, Teams or WhatsApp message, in a formal, crisp or polite tone. ' +
    'Turn notes into a well-structured AI prompt, get three reply options for a message from your manager, or fill one ' +
    'of the ready templates: stand-ups, EOD reports, merge request and deployment requests, leave and WFH emails, bug and ' +
    'access requests, delays and clarifications. Save your details once and every template fills them in.',
  steps: ['Log in, then save your name, manager and signature under Profile.', 'Write notes, paste a message to reply to, or pick a template.', 'Copy, download or save the result; reuse it from History.'],
  faq: [
    { question: 'Which AI is used?', answer: 'Cloudflare Workers AI (Llama 3.3). Your text is sent only for that request and is not used to train models. Templates work without AI.' },
    { question: 'Who can see my history?', answer: 'Only you. It is stored with your account, and you can delete any item.' },
    { question: 'Is there a limit?', answer: 'Up to 60 AI requests per day per account. Templates have no limit.' },
  ],
};

type Tab = 'write' | 'reply' | 'templates' | 'history' | 'profile';
type Tone = 'formal' | 'crisp' | 'polite';

interface HistoryItem {
  id: number;
  kind: string;
  title: string;
  input: string;
  output: string;
  favorite: number;
  created_at: number;
}

@Component({
  selector: 'app-message-assistant',
  imports: [ToolPage, CopyButton, RouterLink],
  template: `
    <app-tool-page path="message-assistant" [content]="content" [wide]="true" privacy="Your messages and history are saved to your account only. AI requests go to Cloudflare Workers AI.">
      @if (!auth.checked()) {
        <p class="text-muted">Loading…</p>
      } @else if (!auth.user()) {
        <div class="card mx-auto max-w-lg p-6 text-center" role="region" aria-label="Log in to continue">
          <p class="text-lg font-semibold">Log in to use the message assistant</p>
          <p class="mt-2 text-sm text-muted">It saves your profile, history and favourite templates to your account. It's free.</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <a routerLink="/login" [queryParams]="{ next: '/message-assistant' }" class="btn-primary">Log in</a>
            <a routerLink="/signup" class="btn-secondary">Create a free account</a>
          </div>
        </div>
      } @else {
        <div class="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Assistant sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold" [class]="tab() === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}</button>
          }
        </div>
        @if (error()) { <p class="mb-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }

        @if (tab() === 'write' || tab() === 'reply') {
          <div class="card mb-3 flex flex-wrap items-end gap-4 p-4 text-sm">
            @if (tab() === 'write') {
              <label class="flex flex-col gap-1"><span class="font-semibold">Make it</span>
                <select class="field" aria-label="Output type" (change)="writeAs.set($any($event.target).value)">
                  <option value="refine" [selected]="writeAs() === 'refine'">Professional message</option>
                  <option value="prompt" [selected]="writeAs() === 'prompt'">AI prompt</option>
                </select>
              </label>
            }
            @if (tab() === 'reply' || writeAs() === 'refine') {
              <label class="flex flex-col gap-1"><span class="font-semibold">Channel</span>
                <select class="field" aria-label="Channel" (change)="channel.set($any($event.target).value)">
                  <option value="email" [selected]="channel() === 'email'">Email</option>
                  <option value="chat" [selected]="channel() === 'chat'">Slack / Teams / WhatsApp</option>
                </select>
              </label>
              <label class="flex flex-col gap-1"><span class="font-semibold">Tone</span>
                <select class="field" aria-label="Tone" (change)="tone.set($any($event.target).value)">
                  <option value="polite" [selected]="tone() === 'polite'">Polite</option>
                  <option value="formal" [selected]="tone() === 'formal'">Formal</option>
                  <option value="crisp" [selected]="tone() === 'crisp'">Crisp and direct</option>
                </select>
              </label>
            }
          </div>
          <textarea class="field min-h-40 w-full text-sm" [attr.aria-label]="tab() === 'write' ? 'Your notes' : 'Message you received'"
            [placeholder]="tab() === 'write' ? 'e.g. sir kal ka deployment ho gaya kya? testing start karni hai, backend MR merge kar dena pls' : 'Paste the message or email you received'"
            [value]="tab() === 'write' ? notes() : incoming()" (input)="tab() === 'write' ? notes.set($any($event.target).value) : incoming.set($any($event.target).value)"></textarea>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="runAi()">{{ busy() ? 'Writing…' : tab() === 'reply' ? 'Suggest 3 replies' : writeAs() === 'prompt' ? 'Make AI prompt' : 'Make it professional' }}</button>
            <button type="button" class="btn-small" (click)="clearCurrent()">Clear</button>
          </div>
          @for (out of outputs(); track $index) {
            <div class="card mt-3 p-4" [attr.aria-label]="outputs().length > 1 ? 'Option ' + ($index + 1) : 'Result'" role="region">
              @if (outputs().length > 1) { <p class="mb-1 text-xs font-semibold text-muted">Option {{ $index + 1 }}</p> }
              <pre class="font-sans text-sm whitespace-pre-wrap">{{ out }}</pre>
              <div class="mt-3 flex flex-wrap gap-2">
                <app-copy-button [text]="out" label="Copy" />
                <button type="button" class="btn-small" (click)="download(out)">Download</button>
              </div>
            </div>
          }
        }

        @if (tab() === 'templates') {
          <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <nav class="card max-h-[36rem] overflow-y-auto p-2 text-sm" aria-label="Templates">
              @if (favoriteTemplates().length) {
                <p class="px-2 pt-1 pb-1 text-xs font-semibold text-muted uppercase">Favourites</p>
                @for (t of favoriteTemplates(); track t.id) {
                  <button type="button" class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface" [class.bg-surface]="template().id === t.id" (click)="pick(t)">★ {{ t.title }}</button>
                }
              }
              @for (c of categories; track c) {
                <p class="px-2 pt-3 pb-1 text-xs font-semibold text-muted uppercase">{{ c }}</p>
                @for (t of byCategory(c); track t.id) {
                  <button type="button" class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface" [class.bg-surface]="template().id === t.id" [class.font-semibold]="template().id === t.id" (click)="pick(t)">{{ t.title }}</button>
                }
              }
            </nav>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-xl leading-7">{{ template().title }}</h2>
                <button type="button" class="btn-small" [attr.aria-pressed]="isFavorite(template().id)" (click)="toggleTemplateFavorite(template().id)">{{ isFavorite(template().id) ? '★ Favourite' : '☆ Add to favourites' }}</button>
              </div>
              <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <label class="flex flex-col gap-1"><span class="font-semibold">Send as</span>
                  <select class="field" aria-label="Template channel" (change)="templateChannel.set($any($event.target).value)">
                    <option value="email" [selected]="templateChannel() === 'email'">Email</option>
                    <option value="chat" [selected]="templateChannel() === 'chat'">Chat message</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1"><span class="font-semibold">To</span>
                  <input class="field" aria-label="To" [placeholder]="profile().managerName || 'Name'" [value]="values()['to'] ?? ''" (input)="setValue('to', $any($event.target).value)" />
                </label>
                @for (f of template().fields; track f.key) {
                  <label class="flex flex-col gap-1" [class.sm:col-span-2]="f.multiline"><span class="font-semibold">{{ f.label }}</span>
                    @if (f.multiline) {
                      <textarea class="field min-h-20" [attr.aria-label]="f.label" [placeholder]="f.placeholder ?? 'One item per line'" [value]="values()[f.key] ?? ''" (input)="setValue(f.key, $any($event.target).value)"></textarea>
                    } @else {
                      <input class="field" [attr.aria-label]="f.label" [placeholder]="f.placeholder ?? ''" [value]="values()[f.key] ?? ''" (input)="setValue(f.key, $any($event.target).value)" />
                    }
                  </label>
                }
              </div>
              <label class="mt-3 flex flex-col gap-1 text-sm"><span class="font-semibold">Message (you can edit it)</span>
                <textarea class="field min-h-56 font-sans" aria-label="Template message" [value]="draft()" (input)="edited.set($any($event.target).value)"></textarea>
              </label>
              <div class="mt-2 flex flex-wrap gap-2">
                <app-copy-button [text]="draft()" label="Copy" />
                <button type="button" class="btn-small" (click)="download(draft())">Download</button>
                <button type="button" class="btn-small" (click)="saveDraft()">Save to history</button>
                <button type="button" class="btn-secondary" [disabled]="busy()" (click)="polish()">{{ busy() ? 'Polishing…' : 'Polish with AI' }}</button>
                <button type="button" class="btn-small" (click)="resetTemplate()">Reset</button>
              </div>
              @if (notice()) { <p class="mt-2 text-sm text-success" role="status">{{ notice() }}</p> }
              @for (out of outputs(); track $index) {
                <div class="card mt-3 p-4" role="region" aria-label="Polished message">
                  <pre class="font-sans text-sm whitespace-pre-wrap">{{ out }}</pre>
                  <div class="mt-3 flex flex-wrap gap-2"><app-copy-button [text]="out" label="Copy" /><button type="button" class="btn-small" (click)="download(out)">Download</button></div>
                </div>
              }
            </div>
          </div>
        }

        @if (tab() === 'history') {
          <div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <input class="field min-w-60 flex-1" type="search" aria-label="Search history" placeholder="Search your messages" [value]="query()" (input)="query.set($any($event.target).value)" (keydown.enter)="loadHistory()" />
            <label class="flex items-center gap-2"><input type="checkbox" [checked]="onlyFavorites()" (change)="onlyFavorites.set($any($event.target).checked); loadHistory()" /> Favourites only</label>
            <button type="button" class="btn-small" (click)="loadHistory()">Search</button>
          </div>
          <ul class="flex flex-col gap-3" aria-label="History">
            @for (h of historyItems(); track h.id) {
              <li class="card p-4">
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span><span class="chip !py-0">{{ kindLabel(h.kind) }}</span> {{ when(h.created_at) }}</span>
                  <span class="flex gap-1">
                    <button type="button" class="btn-small !px-2.5" [attr.aria-label]="(h.favorite ? 'Remove from favourites: ' : 'Add to favourites: ') + h.title" (click)="toggleFavorite(h)">{{ h.favorite ? '★' : '☆' }}</button>
                    <app-copy-button [text]="h.output" label="Copy" />
                    <button type="button" class="btn-small" (click)="reuse(h)">Use again</button>
                    <button type="button" class="btn-small !text-danger" [attr.aria-label]="'Delete ' + h.title" (click)="remove(h)">Delete</button>
                  </span>
                </div>
                <p class="mt-1 font-semibold">{{ h.title }}</p>
                <pre class="mt-1 max-h-40 overflow-y-auto font-sans text-sm whitespace-pre-wrap text-muted">{{ h.output }}</pre>
              </li>
            } @empty { <li class="text-sm text-muted">Nothing here yet. Messages you make are saved automatically.</li> }
          </ul>
        }

        @if (tab() === 'profile') {
          <form class="card grid max-w-2xl gap-3 p-4 text-sm sm:grid-cols-2" (submit)="$event.preventDefault(); saveProfile()">
            <p class="text-muted sm:col-span-2">Saved once, used by every template and AI message.</p>
            @for (f of profileFields; track f.key) {
              <label class="flex flex-col gap-1" [class.sm:col-span-2]="f.multiline"><span class="font-semibold">{{ f.label }}</span>
                @if (f.multiline) {
                  <textarea class="field min-h-20" [attr.aria-label]="f.label" [placeholder]="f.placeholder" [value]="draftProfile()[f.key] ?? ''" (input)="setProfile(f.key, $any($event.target).value)"></textarea>
                } @else {
                  <input class="field" [attr.aria-label]="f.label" [placeholder]="f.placeholder" [value]="draftProfile()[f.key] ?? ''" (input)="setProfile(f.key, $any($event.target).value)" />
                }
              </label>
            }
            <div class="flex items-center gap-3 sm:col-span-2">
              <button type="submit" class="btn-primary" [disabled]="busy()">Save profile</button>
              @if (notice()) { <span class="text-success" role="status">{{ notice() }}</span> }
            </div>
          </form>
        }
      }
    </app-tool-page>
  `,
})
export class MessageAssistant {
  protected readonly content = CONTENT;
  protected readonly auth = inject(Auth);
  protected readonly categories = CATEGORIES;
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'write', label: 'Write' },
    { id: 'reply', label: 'Reply' },
    { id: 'templates', label: 'Templates' },
    { id: 'history', label: 'History' },
    { id: 'profile', label: 'Profile' },
  ];
  protected readonly profileFields: { key: keyof AssistantProfile & string; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: 'yourName', label: 'Your name', placeholder: 'Lucky Agarwal' },
    { key: 'managerName', label: "Manager's name", placeholder: 'Asha' },
    { key: 'project', label: 'Project', placeholder: 'Payments platform' },
    { key: 'team', label: 'Team', placeholder: 'Backend' },
    { key: 'urls', label: 'Environment URLs', placeholder: 'Staging: https://staging.example.com', multiline: true },
    { key: 'signature', label: 'Email signature', placeholder: 'Lucky Agarwal\nSenior Developer', multiline: true },
  ];

  protected readonly tab = signal<Tab>('write');
  protected readonly writeAs = signal<'refine' | 'prompt'>('refine');
  protected readonly channel = signal<Channel>('email');
  protected readonly tone = signal<Tone>('polite');
  protected readonly notes = signal('');
  protected readonly incoming = signal('');
  protected readonly outputs = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly profile = signal<AssistantProfile>({});
  protected readonly draftProfile = signal<Record<string, string>>({});
  protected readonly template = signal<MessageTemplate>(TEMPLATES[0]);
  protected readonly templateChannel = signal<Channel>(TEMPLATES[0].channel);
  protected readonly values = signal<Record<string, string>>({});
  /** The user's own edits of the draft; cleared when a field changes. */
  protected readonly edited = signal<string | null>(null);
  protected readonly historyItems = signal<HistoryItem[]>([]);
  protected readonly query = signal('');
  protected readonly onlyFavorites = signal(false);

  protected readonly draft = computed(() => this.edited() ?? renderTemplate(this.template(), this.values(), this.profile(), this.templateChannel()));
  protected readonly favoriteTemplates = computed(() => TEMPLATES.filter((t) => this.profile().favoriteTemplates?.includes(t.id)));

  constructor() {
    effect(() => {
      if (this.auth.user()) untracked(() => void this.loadProfile());
    });
  }

  protected byCategory(c: string): MessageTemplate[] {
    return TEMPLATES.filter((t) => t.category === c);
  }

  protected open(tab: Tab): void {
    this.tab.set(tab);
    this.outputs.set([]);
    this.error.set('');
    this.notice.set('');
    if (tab === 'history') void this.loadHistory();
    if (tab === 'profile') this.draftProfile.set({ ...(this.profile() as Record<string, string>) });
  }

  private async loadProfile(): Promise<void> {
    try {
      const { profile } = await this.auth.call<{ profile: AssistantProfile }>('GET', '/api/assistant/profile');
      this.profile.set(profile);
    } catch {
      // Keep the empty profile; templates still work.
    }
  }

  protected setProfile(key: string, value: string): void {
    this.draftProfile.update((p) => ({ ...p, [key]: value }));
  }

  protected async saveProfile(): Promise<void> {
    await this.request(async () => {
      const { profile } = await this.auth.call<{ profile: AssistantProfile }>('POST', '/api/assistant/profile', { ...this.profile(), ...this.draftProfile() });
      this.profile.set(profile);
      this.notice.set('Saved.');
    });
  }

  protected async runAi(): Promise<void> {
    const isReply = this.tab() === 'reply';
    const text = isReply ? this.incoming() : this.notes();
    if (!text.trim()) return this.error.set(isReply ? 'Paste the message you received first.' : 'Type your notes first.');
    await this.request(async () => {
      const task = isReply ? 'reply' : this.writeAs();
      const { outputs } = await this.auth.call<{ outputs: string[] }>('POST', '/api/assistant/run', { task, text, channel: this.channel(), tone: this.tone() });
      this.outputs.set(outputs);
    });
  }

  protected pick(t: MessageTemplate): void {
    this.template.set(t);
    this.templateChannel.set(t.channel);
    this.values.set({});
    this.edited.set(null);
    this.outputs.set([]);
    this.notice.set('');
  }

  protected setValue(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
    this.edited.set(null);
  }

  protected resetTemplate(): void {
    this.pick(this.template());
  }

  protected isFavorite(id: string): boolean {
    return !!this.profile().favoriteTemplates?.includes(id);
  }

  protected async toggleTemplateFavorite(id: string): Promise<void> {
    const current = this.profile().favoriteTemplates ?? [];
    const favoriteTemplates = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    this.profile.update((p) => ({ ...p, favoriteTemplates }));
    await this.request(async () => {
      await this.auth.call('POST', '/api/assistant/profile', { ...this.profile(), favoriteTemplates });
    });
  }

  protected async saveDraft(): Promise<void> {
    await this.request(async () => {
      await this.auth.call('POST', '/api/assistant/history', { kind: 'template', title: this.template().title, input: JSON.stringify(this.values()), output: this.draft() });
      this.notice.set('Saved to history.');
    });
  }

  protected async polish(): Promise<void> {
    await this.request(async () => {
      const { outputs } = await this.auth.call<{ outputs: string[] }>('POST', '/api/assistant/run', { task: 'polish', text: this.draft(), channel: this.templateChannel(), tone: this.tone(), title: this.template().title });
      this.outputs.set(outputs);
    });
  }

  protected async loadHistory(): Promise<void> {
    await this.request(async () => {
      const params = new URLSearchParams({ q: this.query(), favorites: this.onlyFavorites() ? '1' : '0' });
      const { items } = await this.auth.call<{ items: HistoryItem[] }>('GET', `/api/assistant/history?${params}`);
      this.historyItems.set(items);
    });
  }

  protected async toggleFavorite(h: HistoryItem): Promise<void> {
    await this.request(async () => {
      await this.auth.call('POST', `/api/assistant/history/${h.id}/favorite`, { favorite: !h.favorite });
      this.historyItems.update((list) => list.map((x) => (x.id === h.id ? { ...x, favorite: h.favorite ? 0 : 1 } : x)));
    });
  }

  protected async remove(h: HistoryItem): Promise<void> {
    await this.request(async () => {
      await this.auth.call('POST', `/api/assistant/history/${h.id}/delete`, {});
      this.historyItems.update((list) => list.filter((x) => x.id !== h.id));
    });
  }

  protected reuse(h: HistoryItem): void {
    const tab: Tab = h.kind === 'reply' ? 'reply' : 'write';
    this.open(tab);
    if (h.kind === 'prompt') this.writeAs.set('prompt');
    if (tab === 'reply') this.incoming.set(h.input);
    else this.notes.set(h.kind === 'template' ? h.output : h.input);
  }

  protected clearCurrent(): void {
    if (this.tab() === 'write') this.notes.set('');
    else this.incoming.set('');
    this.outputs.set([]);
    this.error.set('');
  }

  protected download(text: string): void {
    downloadText(text, 'message.txt', 'text/plain');
  }

  protected kindLabel(kind: string): string {
    return ({ refine: 'Message', prompt: 'AI prompt', reply: 'Reply', template: 'Template' } as Record<string, string>)[kind] ?? kind;
  }

  protected when(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private async request(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await work();
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
