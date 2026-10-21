import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { formatBytes } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { Auth } from './auth';
import { AuthEditor } from './auth-editor';
import { KvTable } from './kv-table';
import { Collection, Folder } from './model';
import { RunItem, runCollection, runItems } from './runner';
import { ApiSender } from './sender';
import { ApiStore } from './store';

type Tab = 'overview' | 'auth' | 'variables' | 'runs';

/**
 * A collection's own page, as in Postman: its overview and description, the auth
 * its requests inherit, its variables, and a runner that sends every request in turn.
 */
@Component({
  selector: 'app-collection-panel',
  imports: [AuthEditor, Icon, KvTable],
  template: `
    @if (collection(); as c) {
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 text-xl font-semibold outline-none focus:bg-surface"
            aria-label="Collection name"
            [value]="c.name"
            (change)="store.renameCollection(c.id, $any($event.target).value)"
          />
          <button type="button" class="btn-small" data-tip="Send every request in this collection" data-tip-side="bottom" (click)="startRun()">
            <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
            Run
          </button>
          <button type="button" class="btn-small px-2.5" aria-label="Close collection" data-tip="Back to the request" data-tip-side="bottom" (click)="closed.emit()">
            <app-icon [path]="icons.close" [size]="16" />
          </button>
        </div>

        <div class="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Collection">
          @for (t of tabs; track t.id) {
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

        @switch (tab()) {
          @case ('overview') {
            <div class="flex flex-wrap items-center gap-4 text-sm text-muted">
              <span>{{ counts().requests }} {{ counts().requests === 1 ? 'request' : 'requests' }}</span>
              <span>{{ counts().folders }} {{ counts().folders === 1 ? 'folder' : 'folders' }}</span>
              <span>{{ c.variables.length }} {{ c.variables.length === 1 ? 'variable' : 'variables' }}</span>
              @if (c.createdAt) {
                <span>Created {{ created() }}</span>
              }
            </div>
            <textarea
              rows="4"
              class="rounded-xl border border-line bg-page p-3 text-sm"
              aria-label="Collection description"
              placeholder="Help people understand your collection by adding a description."
              [value]="c.description ?? ''"
              (change)="store.setCollectionDescription(c.id, $any($event.target).value)"
            ></textarea>
            @if (!counts().requests && !counts().folders) {
              <div class="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line px-4 py-6">
                <span class="font-semibold">This collection is empty. Add a request to get started.</span>
                <button type="button" class="btn-small" (click)="addRequest.emit(c.id)">
                  <app-icon [path]="icons.plus" [size]="14" /> Add request
                </button>
                <button type="button" class="btn-small" (click)="addFolder.emit(c.id)">
                  <app-icon [path]="icons.plus" [size]="14" /> Add folder
                </button>
              </div>
            }
          }
          @case ('auth') {
            <p class="text-sm text-muted">
              This authorization method is used for every request in this collection that is set to "Inherit auth from
              parent". A request can still set its own.
            </p>
            <app-auth-editor [auth]="c.auth ?? noAuth" [allowInherit]="false" (authChange)="store.setCollectionAuth(c.id, $event)" />
          }
          @case ('variables') {
            <p class="text-sm text-muted">
              Use them as {{ '{{name}}' }} in this collection's requests. A variable in the active environment with the same
              name wins.
            </p>
            <app-kv-table
              keyLabel="Variable"
              [rows]="c.variables"
              [columns]="store.columns()"
              (columnsChange)="store.columns.set($event)"
              (rowsChange)="store.setCollectionVariables(c.id, $event)"
            />
          }
          @case ('runs') {
            <div class="flex flex-wrap items-center gap-3 text-sm">
              @if (running()) {
                <button type="button" class="btn-secondary" (click)="stopRun()">Stop</button>
              } @else {
                <button type="button" class="btn-primary" [disabled]="!counts().requests" (click)="startRun()">Run collection</button>
              }
              <label class="flex items-center gap-2">
                Delay between requests
                <input
                  type="number"
                  min="0"
                  step="100"
                  class="w-24 rounded-lg border border-line bg-page px-2 py-1"
                  aria-label="Delay in milliseconds"
                  [value]="delay()"
                  (input)="delay.set(+$any($event.target).value || 0)"
                />
                ms
              </label>
              <span class="text-muted">Environment: {{ store.activeEnvironment()?.name ?? 'none' }}</span>
            </div>
            @if (run().length) {
              <p class="flex flex-wrap gap-4 text-sm" aria-live="polite">
                <span class="font-semibold text-success">{{ summary().passed }} passed</span>
                <span class="font-semibold text-danger">{{ summary().failed }} failed</span>
                @if (summary().skipped) {
                  <span class="text-muted">{{ summary().skipped }} skipped</span>
                }
                @if (summary().ms) {
                  <span class="text-muted">{{ summary().ms }} ms in all</span>
                }
              </p>
              <ol class="flex flex-col divide-y divide-line rounded-xl border border-line text-sm" aria-label="Run results">
                @for (item of run(); track item.id) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span class="w-5 text-center font-bold" [class]="stateClass[item.state]" [attr.aria-label]="item.state">{{ stateMark[item.state] }}</span>
                    <span class="w-12 font-mono text-[11px] font-bold text-muted">{{ item.method }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="font-semibold">{{ item.name }}</span>
                      @if (item.folder) {
                        <span class="text-xs text-muted"> · {{ item.folder }}</span>
                      }
                      @if (item.note) {
                        <span class="block text-xs" [class]="item.state === 'failed' ? 'text-danger' : 'text-muted'">{{ item.note }}</span>
                      }
                    </span>
                    @if (item.status !== undefined) {
                      <span class="font-mono text-xs font-bold" [class]="item.status < 400 ? 'text-success' : 'text-danger'">{{ item.status }}</span>
                      <span class="text-xs text-muted">{{ item.ms }} ms · {{ formatBytes(item.size ?? 0) }}</span>
                    }
                  </li>
                }
              </ol>
            } @else {
              <p class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                Run the collection to send its requests one after another and see which ones pass (status below 400).
              </p>
            }
          }
        }
      </div>
    }
  `,
})
export class CollectionPanel implements OnDestroy {
  readonly collectionId = input.required<string>();
  readonly closed = output<void>();
  readonly addRequest = output<string>();
  readonly addFolder = output<string>();

  protected readonly store = inject(ApiStore);
  protected readonly icons = ICONS;
  protected readonly formatBytes = formatBytes;
  protected readonly noAuth: Auth = { type: 'none' };
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'auth', label: 'Authorization' },
    { id: 'variables', label: 'Variables' },
    { id: 'runs', label: 'Runs' },
  ];
  protected readonly stateMark: Record<RunItem['state'], string> = { waiting: '·', running: '…', passed: '✓', failed: '✕', skipped: '–' };
  protected readonly stateClass: Record<RunItem['state'], string> = {
    waiting: 'text-muted',
    running: 'text-brand',
    passed: 'text-success',
    failed: 'text-danger',
    skipped: 'text-muted',
  };

  protected readonly tab = signal<Tab>('overview');
  protected readonly run = signal<RunItem[]>([]);
  protected readonly running = signal(false);
  protected readonly delay = signal(0);

  protected readonly collection = computed(() => this.store.collections().find((c) => c.id === this.collectionId()) ?? null);
  protected readonly counts = computed(() => {
    let requests = 0;
    let folders = 0;
    const walk = (folder: Folder) => {
      requests += folder.requests.length;
      folders += folder.folders.length;
      folder.folders.forEach(walk);
    };
    const collection = this.collection();
    if (collection) walk(collection);
    return { requests, folders };
  });
  protected readonly created = computed(() => {
    const at = this.collection()?.createdAt;
    return at ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  });
  protected readonly summary = computed(() => {
    const items = this.run();
    return {
      passed: items.filter((i) => i.state === 'passed').length,
      failed: items.filter((i) => i.state === 'failed').length,
      skipped: items.filter((i) => i.state === 'skipped').length,
      ms: items.reduce((sum, i) => sum + (i.ms ?? 0), 0),
    };
  });

  private readonly sender = inject(ApiSender);
  private readonly analytics = inject(Analytics);
  private controller: AbortController | null = null;

  constructor() {
    // Another collection starts on its overview, with no run shown.
    effect(() => {
      this.collectionId();
      untracked(() => {
        this.stopRun();
        this.run.set([]);
        this.tab.set('overview');
      });
    });
  }

  protected async startRun(): Promise<void> {
    const collection = this.collection();
    if (!collection || this.running()) return;
    this.tab.set('runs');
    this.run.set(runItems(collection));
    this.running.set(true);
    this.controller = new AbortController();
    this.analytics.track('api-run', { requests: this.counts().requests });
    try {
      await runCollection(structuredClone(collection) as Collection, {
        environment: this.store.activeEnvironment()?.variables ?? [],
        send: (prepared, signal) => this.sender.send(prepared, signal),
        signal: this.controller.signal,
        delay: this.delay(),
        update: (index, item) => this.run.update((list) => list.map((old, i) => (i === index ? { ...old, ...item } : old))),
      });
    } finally {
      this.running.set(false);
      this.controller = null;
      this.run.update((list) => list.map((i) => (i.state === 'waiting' || i.state === 'running' ? { ...i, state: 'skipped', note: 'Stopped.' } : i)));
    }
  }

  protected stopRun(): void {
    this.controller?.abort();
  }

  ngOnDestroy(): void {
    this.stopRun();
  }
}
