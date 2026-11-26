import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';
import { formatBytes } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { dayLabel, noteParts, type NotePart } from './note-parts';

const CONTENT: ToolContent = {
  aboutHeading: 'About My Notes',
  about:
    'A private chat with yourself, like messaging your own number on WhatsApp, but built for work. Save quick notes, ' +
    'links, commands and code snippets in one timeline with the exact date and time, and keep screenshots, PDFs and ' +
    'documents next to them. Search everything, filter links, code, media or documents, copy a snippet in one click and ' +
    'open your files from any device where you log in.',
  steps: ['Log in.', 'Type a note (Enter sends, Shift+Enter adds a line) or attach a file with the clip button.', 'Search or filter to find it later; copy, edit or delete any note.'],
  faq: [
    { question: 'Who can see my notes and files?', answer: 'Only you. Files are stored privately and are only sent to your logged-in account.' },
    { question: 'How much can I store?', answer: 'Files up to 25 MB each and 1 GB in total.' },
    { question: 'How do I save code?', answer: 'Wrap it in three backticks, like ```js on the first line and ``` on the last. It shows as a code block with a copy button.' },
  ],
};

interface Note {
  id: number;
  text: string;
  file: { name: string; type: string; size: number; url: string } | null;
  createdAt: number;
  editedAt: number | null;
}

type Filter = 'all' | 'links' | 'code' | 'media' | 'docs';

@Component({
  selector: 'app-my-notes',
  imports: [ToolPage, CopyButton, RouterLink],
  template: `
    <app-tool-page path="my-notes" [content]="content" [wide]="true" privacy="Your notes and files are private to your account.">
      @if (!auth.checked()) {
        <p class="text-muted">Loading…</p>
      } @else if (!auth.user()) {
        <div class="card mx-auto max-w-lg p-6 text-center" role="region" aria-label="Log in to continue">
          <p class="text-lg font-semibold">Log in to open your notes</p>
          <p class="mt-2 text-sm text-muted">Your notes, links, code and files are saved privately to your account.</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <a routerLink="/login" [queryParams]="{ next: '/my-notes' }" class="btn-primary">Log in</a>
            <a routerLink="/signup" class="btn-secondary">Create a free account</a>
          </div>
        </div>
      } @else {
        <div class="card flex h-[75vh] min-h-[28rem] flex-col overflow-hidden p-0">
          <div class="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm">
            <input class="field min-w-40 flex-1 !py-1.5" type="search" aria-label="Search notes" placeholder="Search notes and file names" [value]="query()" (input)="setQuery($any($event.target).value)" />
            <div class="flex flex-wrap gap-1" role="tablist" aria-label="Show">
              @for (f of filters; track f.id) {
                <button type="button" role="tab" class="btn-small !py-1" [attr.aria-selected]="filter() === f.id" [class.!bg-brand]="filter() === f.id" [class.!text-on-brand]="filter() === f.id" (click)="setFilter(f.id)">{{ f.label }}</button>
              }
            </div>
            <span class="text-xs text-muted" [title]="'Files: ' + usedText()">{{ usedText() }}</span>
          </div>

          <div #feed class="flex-1 overflow-y-auto bg-surface/50 px-3 py-4" role="log" aria-label="Notes" aria-live="polite">
            @if (more()) {
              <div class="mb-3 text-center"><button type="button" class="btn-small" [disabled]="busy()" (click)="loadOlder()">Load older notes</button></div>
            }
            @for (n of notes(); track n.id; let i = $index) {
              @if (i === 0 || day(n.createdAt) !== day(notes()[i - 1].createdAt)) {
                <p class="my-3 text-center"><span class="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted shadow-sm">{{ day(n.createdAt) }}</span></p>
              }
              <article class="group mb-2 ml-auto w-fit max-w-[min(42rem,92%)] rounded-2xl rounded-tr-sm bg-brand/10 px-3 py-2 text-sm shadow-sm" [attr.aria-label]="'Note from ' + time(n.createdAt)">
                @if (n.file; as f) {
                  @if (f.type.startsWith('image/')) {
                    <a [href]="f.url" target="_blank" rel="noopener"><img [src]="f.url" [alt]="f.name" loading="lazy" class="mb-1 max-h-72 rounded-lg object-contain" /></a>
                  } @else {
                    <a [href]="f.url" target="_blank" rel="noopener" class="mb-1 flex items-center gap-3 rounded-lg bg-page/70 p-2 hover:bg-page">
                      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-xs font-bold text-on-brand">{{ ext(f.name) }}</span>
                      <span class="min-w-0"><span class="block truncate font-semibold">{{ f.name }}</span><span class="text-xs text-muted">{{ size(f.size) }}</span></span>
                    </a>
                  }
                }
                @if (editingId() === n.id) {
                  <textarea class="field min-h-20 w-full min-w-64 text-sm" aria-label="Edit note" [value]="editText()" (input)="editText.set($any($event.target).value)"></textarea>
                  <div class="mt-1 flex gap-2"><button type="button" class="btn-small" (click)="saveEdit(n)">Save</button><button type="button" class="btn-small" (click)="editingId.set(0)">Cancel</button></div>
                } @else if (n.text) {
                  @for (p of parts(n.text); track $index) {
                    @switch (p.kind) {
                      @case ('text') { <span class="whitespace-pre-wrap break-words">{{ $any(p).text }}</span> }
                      @case ('link') { <a [href]="$any(p).href" target="_blank" rel="noopener noreferrer" class="break-all text-brand underline">{{ $any(p).href }}</a> }
                      @case ('code') {
                        <div class="my-1 overflow-hidden rounded-lg bg-ink/90 text-page">
                          <div class="flex items-center justify-between px-2 py-1 text-xs opacity-80"><span>{{ $any(p).lang || 'code' }}</span><app-copy-button [text]="$any(p).code" label="Copy code" /></div>
                          <pre class="overflow-x-auto px-3 pb-2 font-mono text-xs">{{ $any(p).code }}</pre>
                        </div>
                      }
                    }
                  }
                }
                <div class="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted">
                  <span class="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    @if (n.text) { <app-copy-button [text]="n.text" label="Copy" /> }
                    @if (n.file) { <a class="btn-small !py-0.5" [href]="n.file.url + '?download=1'">Download</a> }
                    <button type="button" class="btn-small !py-0.5" [attr.aria-label]="'Edit note from ' + time(n.createdAt)" (click)="startEdit(n)">Edit</button>
                    <button type="button" class="btn-small !py-0.5 !text-danger" [attr.aria-label]="'Delete note from ' + time(n.createdAt)" (click)="remove(n)">Delete</button>
                  </span>
                  <time [attr.datetime]="iso(n.createdAt)" [title]="full(n.createdAt)">{{ time(n.createdAt) }}@if (n.editedAt) { · edited }</time>
                </div>
              </article>
            } @empty {
              <p class="mt-10 text-center text-sm text-muted">{{ query() || filter() !== 'all' ? 'Nothing matches.' : 'No notes yet. Write your first one below.' }}</p>
            }
          </div>

          @if (error()) { <p class="border-t border-danger bg-danger/10 px-4 py-2 text-sm" role="alert">{{ error() }}</p> }
          @if (pending(); as file) {
            <div class="flex items-center gap-2 border-t border-line px-3 py-2 text-sm">
              <span class="min-w-0 flex-1 truncate">📎 {{ file.name }} · {{ size(file.size) }}</span>
              <button type="button" class="btn-small" (click)="pending.set(null)">Remove</button>
            </div>
          }
          <form class="flex items-end gap-2 border-t border-line p-3" (submit)="$event.preventDefault(); send()">
            <input #fileInput type="file" class="hidden" aria-label="Attach a file" (change)="choose($any($event.target).files)" />
            <button type="button" class="btn-small !h-10 !w-10 shrink-0 !p-0 text-lg" [disabled]="!uploads()" [title]="uploads() ? 'Attach a file (up to 25 MB)' : 'File uploads are not switched on yet'" aria-label="Attach a file" (click)="fileInput.click()">📎</button>
            <textarea class="field max-h-40 min-h-10 flex-1 resize-none !py-2 text-sm" rows="1" aria-label="New note" placeholder="Write a note, paste a link or a code snippet" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown.enter)="onEnter($any($event))" (paste)="onPaste($any($event))"></textarea>
            <button type="submit" class="btn-primary !h-10 shrink-0" [disabled]="busy() || (!draft().trim() && !pending())">{{ busy() ? '…' : 'Send' }}</button>
          </form>
        </div>
      }
    </app-tool-page>
  `,
})
export class MyNotes {
  protected readonly content = CONTENT;
  protected readonly auth = inject(Auth);
  protected readonly filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'links', label: 'Links' },
    { id: 'code', label: 'Code' },
    { id: 'media', label: 'Media' },
    { id: 'docs', label: 'Docs' },
  ];
  protected readonly notes = signal<Note[]>([]);
  protected readonly more = signal(false);
  protected readonly uploads = signal(false);
  protected readonly usage = signal({ bytes: 0, quota: 0 });
  protected readonly draft = signal('');
  protected readonly pending = signal<File | null>(null);
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly editingId = signal(0);
  protected readonly editText = signal('');
  protected readonly usedText = computed(() => {
    const quota = this.usage().quota || 1024 ** 3;
    return `${formatBytes(this.usage().bytes)} of ${quota >= 1024 ** 3 ? `${+(quota / 1024 ** 3).toFixed(1)} GB` : formatBytes(quota)} used`;
  });
  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');
  private searchTimer?: ReturnType<typeof setTimeout>;
  private readonly partsCache = new Map<string, NotePart[]>();

  protected readonly day = (ms: number) => dayLabel(ms);
  protected readonly size = formatBytes;

  constructor() {
    effect(() => {
      if (this.auth.user()) untracked(() => void this.load());
    });
  }

  protected parts(text: string): NotePart[] {
    let parts = this.partsCache.get(text);
    if (!parts) this.partsCache.set(text, (parts = noteParts(text)));
    return parts;
  }

  private async load(): Promise<void> {
    await this.request(async () => {
      const data = await this.fetchPage();
      this.notes.set(data.notes);
      this.more.set(data.more);
      this.scrollToEnd();
    });
  }

  private async fetchPage(before?: number) {
    const params = new URLSearchParams({ q: this.query(), filter: this.filter() });
    if (before) params.set('before', String(before));
    const data = await this.auth.call<{ notes: Note[]; more: boolean; usage: { bytes: number; quota: number }; uploads: boolean }>('GET', `/api/notes?${params}`);
    this.usage.set(data.usage);
    this.uploads.set(data.uploads);
    return data;
  }

  protected async loadOlder(): Promise<void> {
    const first = this.notes()[0];
    if (!first) return;
    await this.request(async () => {
      const data = await this.fetchPage(first.id);
      this.notes.update((list) => [...data.notes, ...list]);
      this.more.set(data.more);
    });
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 300);
  }

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    void this.load();
  }

  protected onEnter(event: KeyboardEvent): void {
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.send();
  }

  /** Pasting a screenshot attaches it. */
  protected onPaste(event: ClipboardEvent): void {
    const file = [...(event.clipboardData?.files ?? [])][0];
    if (file && this.uploads()) {
      event.preventDefault();
      this.choose([file]);
    }
  }

  protected choose(files: FileList | File[] | null): void {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return this.error.set(`${file.name} is ${formatBytes(file.size)}. Files can be up to 25 MB.`);
    this.error.set('');
    this.pending.set(file);
  }

  protected async send(): Promise<void> {
    const text = this.draft();
    const file = this.pending();
    if (!text.trim() && !file) return;
    await this.request(async () => {
      let note: Note;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('text', text);
        const response = await fetch('/api/notes/upload', { method: 'POST', body: form, credentials: 'same-origin' });
        const data = (await response.json().catch(() => ({}))) as { note?: Note; error?: string };
        if (!response.ok || !data.note) throw new AccountError(data.error ?? 'The file could not be uploaded.', response.status);
        note = data.note;
        this.usage.update((u) => ({ ...u, bytes: u.bytes + file.size }));
      } else {
        note = (await this.auth.call<{ note: Note }>('POST', '/api/notes', { text })).note;
      }
      this.draft.set('');
      this.pending.set(null);
      if (this.filter() === 'all' && !this.query()) this.notes.update((list) => [...list, note]);
      else await this.load();
      this.scrollToEnd();
    });
  }

  protected startEdit(n: Note): void {
    this.editingId.set(n.id);
    this.editText.set(n.text);
  }

  protected async saveEdit(n: Note): Promise<void> {
    await this.request(async () => {
      const { note } = await this.auth.call<{ note: Note }>('POST', `/api/notes/${n.id}/edit`, { text: this.editText() });
      this.notes.update((list) => list.map((x) => (x.id === n.id ? note : x)));
      this.editingId.set(0);
    });
  }

  protected async remove(n: Note): Promise<void> {
    if (!confirm(n.file ? `Delete this note and the file "${n.file.name}"?` : 'Delete this note?')) return;
    await this.request(async () => {
      await this.auth.call('POST', `/api/notes/${n.id}/delete`, {});
      this.notes.update((list) => list.filter((x) => x.id !== n.id));
      if (n.file) this.usage.update((u) => ({ ...u, bytes: Math.max(0, u.bytes - n.file!.size) }));
    });
  }

  protected ext(name: string): string {
    return (name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase();
  }

  protected time(ms: number): string {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  protected full(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' });
  }

  protected iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const el = this.feed()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private async request(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
