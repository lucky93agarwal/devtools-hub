import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TOOLS, TOOL_CATEGORIES, ToolCategory, ToolInfo } from '../../core/tools';
import { UserTools } from '../../core/user-tools';
import { searchTools } from '../command-palette/tool-search';
import { ICONS, Icon } from '../icon/icon';

/**
 * Every tool in one list, grouped like an admin panel's side menu: a filter box, the visitor's starred and
 * recent tools, then each category as a section that opens and closes. Used by the left drawer on every page
 * and as the home page's sidebar. All links are in the page, also when a section is closed.
 */
@Component({
  selector: 'app-tool-nav',
  imports: [RouterLink, NgTemplateOutlet, Icon],
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="shrink-0 p-3">
      <label class="flex items-center gap-2 rounded-xl border border-line bg-page px-3">
        <app-icon [path]="icons.search" [size]="16" class="text-muted" />
        <input
          #filterBox
          type="search"
          class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          [attr.aria-label]="'Filter ' + total + ' tools'"
          [placeholder]="'Filter ' + total + ' tools'"
          autocomplete="off"
          spellcheck="false"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </label>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4" [attr.aria-label]="label()">
      @if (query().trim()) {
        <ul class="flex flex-col gap-0.5">
          @for (tool of matches(); track tool.path) {
            <li><ng-container *ngTemplateOutlet="row; context: { $implicit: tool }" /></li>
          } @empty {
            <li class="px-2 py-4 text-sm text-muted">No tool matches “{{ query() }}”.</li>
          }
        </ul>
      } @else {
        @if (yourTools().length) {
          <p class="px-2 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Your tools</p>
          <ul class="mb-2 flex flex-col gap-0.5">
            @for (tool of yourTools(); track tool.path) {
              <li>
                <a
                  [routerLink]="'/' + tool.path"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface"
                  [class]="tool.path === current() ? 'bg-surface font-semibold text-ink' : 'text-muted'"
                  [attr.aria-current]="tool.path === current() ? 'page' : null"
                  (click)="navigated.emit()"
                >
                  <app-icon [path]="user.isFavourite(tool.path) ? icons.star : icons.clock" [size]="14" [filled]="user.isFavourite(tool.path)" class="text-warning" />
                  {{ tool.shortName ?? tool.name }}
                </a>
              </li>
            }
          </ul>
        }
        @for (group of groups; track group.id) {
          <details class="group border-t border-line py-1" [open]="isOpen(group.id)" (toggle)="onToggle(group.id, $event)">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-surface">
              <span>{{ group.label }}</span>
              <span class="flex items-center gap-2 text-xs font-normal text-muted">
                {{ group.tools.length }}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="transition-transform group-open:rotate-90" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </summary>
            <ul class="flex flex-col gap-0.5 pb-1">
              @for (tool of group.tools; track tool.path) {
                <li><ng-container *ngTemplateOutlet="row; context: { $implicit: tool }" /></li>
              }
            </ul>
          </details>
        }
      }
    </nav>

    <ng-template #row let-tool>
      <a
        [routerLink]="'/' + tool.path"
        class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface"
        [class]="tool.path === current() ? 'bg-surface' : ''"
        [attr.aria-current]="tool.path === current() ? 'page' : null"
        (click)="navigated.emit()"
      >
        <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface text-brand"><app-icon [path]="tool.icon" [size]="15" /></span>
        <span class="min-w-0">
          <span class="block text-sm leading-5 font-semibold" [class]="tool.path === current() ? 'text-brand' : 'text-ink'">{{ tool.name }}</span>
          @if (descriptions()) {
            <span class="block text-xs leading-4 text-muted">{{ tool.description }}</span>
          }
        </span>
      </a>
    </ng-template>
  `,
})
export class ToolNav {
  /** Show each tool's one-line description under its name. */
  readonly descriptions = input(true);
  /** Sections open at the start; by default only the one holding the current page. */
  readonly openAll = input(false);
  readonly label = input('All tools');
  /** A link was followed, so a drawer can close. */
  readonly navigated = output<void>();

  protected readonly icons = ICONS;
  protected readonly user = inject(UserTools);
  protected readonly query = signal('');
  protected readonly total = TOOLS.filter((t) => t.live).length;
  protected readonly groups = TOOL_CATEGORIES.map((c) => ({ ...c, tools: TOOLS.filter((t) => t.live && t.category === c.id) }));
  private readonly filterBox = viewChild<ElementRef<HTMLInputElement>>('filterBox');

  private readonly router = inject(Router);
  protected readonly current = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split(/[?#]/)[0].replace(/^\//, '')),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0].replace(/^\//, '') },
  );
  /** Sections the visitor opened or closed by hand. */
  private readonly toggled = signal(new Map<ToolCategory, boolean>());

  protected readonly matches = computed(() => searchTools(this.query()));
  protected readonly yourTools = computed<ToolInfo[]>(() => {
    const favourites = this.user.favourites();
    return UserTools.tools([...favourites, ...this.user.recent().filter((p) => !favourites.includes(p))]).slice(0, 8);
  });

  protected isOpen(id: ToolCategory): boolean {
    const manual = this.toggled().get(id);
    if (manual !== undefined) return manual;
    return this.openAll() || TOOLS.find((t) => t.path === this.current())?.category === id;
  }

  protected onToggle(id: ToolCategory, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open === this.isOpen(id)) return;
    this.toggled.update((m) => new Map(m).set(id, open));
  }

  /** Puts the cursor in the filter box, for when the drawer opens. */
  focusFilter(): void {
    this.filterBox()?.nativeElement.focus();
  }

  clearFilter(): void {
    this.query.set('');
  }
}
