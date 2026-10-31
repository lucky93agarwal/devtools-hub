import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { clearSiteData, makeBackup, restoreBackup } from '../../core/backup';
import { prefill } from '../../core/shared-input';
import { SavedItem, ToolHistory } from '../../core/tool-history';
import { TOOLS } from '../../core/tools';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ago } from '../../shared/share-button/share-button';

/** The inputs saved by name across all tools, and backup, restore and clear for everything kept in this browser. */
@Component({
  selector: 'app-your-data',
  imports: [Icon, RouterLink],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[40px] sm:leading-12">Your saved data</h1>
      <p class="mt-3 text-muted">
        Inputs you saved, starred and recent tools, tool history and API Client collections are kept only in this browser.
        Nothing is stored on a server, so back it up here to move it to another browser or device.
      </p>

      <section class="mt-10" aria-labelledby="saved-heading">
        <h2 id="saved-heading" class="text-xl leading-7">Saved inputs ({{ history.saved().length }})</h2>
        @if (!groups().length) {
          <p class="card mt-3 p-4 text-sm text-muted">Nothing saved yet. In a tool, open History and choose Save to keep an input here.</p>
        }
        @for (g of groups(); track g.path) {
          <h3 class="mt-5 text-base font-semibold"><a class="hover:text-brand" [routerLink]="'/' + g.path">{{ g.name }}</a></h3>
          <ul class="mt-2 flex flex-col divide-y divide-line rounded-xl border border-line">
            @for (s of g.items; track s.id) {
              <li class="flex items-center gap-3 px-4 py-2">
                <button type="button" class="min-w-0 flex-1 text-left" (click)="open(s)">
                  <span class="block truncate font-semibold">{{ s.name }}</span>
                  <span class="block truncate text-sm text-muted">{{ s.preview }} · {{ when(s.at) }}</span>
                </button>
                <button type="button" class="btn-small" (click)="open(s)">Open</button>
                <button type="button" class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" [attr.aria-label]="'Delete ' + s.name" (click)="history.remove(s.id)">
                  <app-icon [path]="icons.close" [size]="16" />
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <section class="mt-12" aria-labelledby="backup-heading">
        <h2 id="backup-heading" class="text-xl leading-7">Backup and restore</h2>
        <p class="mt-1 text-sm text-muted">The backup is a JSON file with everything this site keeps in this browser. Keep it private: it can contain your saved inputs and API Client requests.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" (click)="download()">
            <app-icon [path]="icons.download" [size]="20" />
            Download backup
          </button>
          <button type="button" class="btn-secondary" (click)="file.click()">
            <app-icon [path]="icons.upload" [size]="20" />
            Restore from file
          </button>
          <input #file type="file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="restore(file)" />
        </div>
        <p class="mt-3 min-h-6 text-sm" aria-live="polite" [class]="message()?.ok === false ? 'text-danger' : 'text-success'">{{ message()?.text }}</p>
      </section>

      <section class="mt-10" aria-labelledby="clear-heading">
        <h2 id="clear-heading" class="text-xl leading-7">Clear everything</h2>
        <p class="mt-1 text-sm text-muted">Removes saved inputs, history, starred and recent tools, API Client data and the theme from this browser.</p>
        @if (confirming()) {
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">This cannot be undone. Clear it all?</span>
            <button type="button" class="btn-small border-danger text-danger" (click)="clearAll()">Yes, clear</button>
            <button type="button" class="btn-small" (click)="confirming.set(false)">Cancel</button>
          </div>
        } @else {
          <button type="button" class="btn-small mt-3" (click)="confirming.set(true)">Clear my data…</button>
        }
      </section>
    </div>
  `,
})
export class YourData {
  protected readonly icons = ICONS;
  protected readonly history = inject(ToolHistory);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly confirming = signal(false);
  protected readonly groups = computed(() => {
    const saved = this.history.saved();
    return [...new Set(saved.map((s) => s.path))].map((path) => ({
      path,
      name: TOOLS.find((t) => t.path === path)?.name ?? path,
      items: saved.filter((s) => s.path === path),
    }));
  });
  private readonly router = inject(Router);

  protected when(at: number): string {
    return ago(at);
  }

  protected open(item: SavedItem): void {
    prefill(item.path, item.data);
    void this.router.navigateByUrl('/' + item.path);
  }

  protected download(): void {
    const backup = makeBackup(localStorage);
    downloadText(JSON.stringify(backup, null, 2), `devtools24-backup-${backup.createdAt.slice(0, 10)}.json`, 'application/json');
    this.message.set({ ok: true, text: `Backup made with ${Object.keys(backup.items).length} items.` });
  }

  protected async restore(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    const result = restoreBackup(localStorage, await file.text());
    if (!result.ok) {
      this.message.set({ ok: false, text: result.error });
      return;
    }
    this.message.set({ ok: true, text: `Restored ${result.count} items. Reloading…` });
    // Every part of the site reads its data at start, so load the page again.
    setTimeout(() => location.reload(), 800);
  }

  protected clearAll(): void {
    clearSiteData(localStorage);
    this.message.set({ ok: true, text: 'Cleared. Reloading…' });
    setTimeout(() => location.reload(), 800);
  }
}
