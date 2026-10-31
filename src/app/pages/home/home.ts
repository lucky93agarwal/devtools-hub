import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TOOLS, TOOL_CATEGORIES, ToolCategory } from '../../core/tools';
import { GUIDES } from '../../core/guides';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolCard } from '../../shared/tool-card/tool-card';
import { SmartPaste } from '../../shared/smart-paste/smart-paste';
import { UserTools } from '../../core/user-tools';
import { ToolNav } from '../../shared/tool-nav/tool-nav';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon, ToolCard, SmartPaste, ToolNav],
  template: `
    <div class="container-page lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <!-- Admin-panel style list of every tool, always at hand on wide screens. Phones use the menu drawer. -->
      <aside class="hidden lg:block" aria-label="All tools">
        <div class="sticky top-20 mt-8 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border border-line">
          <p class="shrink-0 px-5 pt-4 font-heading font-semibold">All tools</p>
          <app-tool-nav class="min-h-0 flex-1" [descriptions]="false" label="All tools by group" />
        </div>
      </aside>

      <div class="min-w-0">
        <section class="pt-10 pb-8 sm:pt-14">
          <h1 class="max-w-3xl text-[28px] leading-9 sm:text-[40px] sm:leading-12">Developer tools that stay on your device</h1>
          <p class="mt-3 max-w-2xl text-lg leading-7 text-muted">
            {{ toolCount }} free tools for JSON, APIs, encoding, text, images and more. Everything runs in your browser.
          </p>
          <ul class="mt-4 flex flex-wrap gap-2" aria-label="Highlights">
            @for (chip of chips; track chip) {
              <li class="chip">
                <app-icon [path]="icons.check" [size]="16" />
                {{ chip }}
              </li>
            }
          </ul>
          <div class="mt-8">
            <app-smart-paste />
          </div>
        </section>

        @if (yourTools().length) {
          <section class="mb-8" aria-labelledby="your-tools-heading">
            <h2 id="your-tools-heading" class="text-xl leading-7">Your tools</h2>
            <p class="mt-1 text-sm text-muted">Starred and recently used, remembered in this browser only.</p>
            <ul class="mt-3 flex flex-wrap gap-2">
              @for (tool of yourTools(); track tool.path) {
                <li>
                  <a [routerLink]="'/' + tool.path" class="chip hover:border-brand hover:text-ink">
                    <app-icon [path]="user.isFavourite(tool.path) ? icons.star : icons.clock" [size]="14" [filled]="user.isFavourite(tool.path)" />
                    {{ tool.shortName ?? tool.name }}
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        <section id="tools" aria-labelledby="tools-heading">
          <h2 id="tools-heading" class="text-xl leading-7">Browse by group</h2>
          <div class="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div class="flex w-max gap-1 rounded-full border border-line p-1 sm:w-auto sm:flex-wrap sm:rounded-2xl" role="tablist" aria-label="Tool groups">
              @for (group of groups; track group.id) {
                <button
                  type="button"
                  role="tab"
                  class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm leading-5 font-semibold whitespace-nowrap transition-colors"
                  [class]="selected() === group.id ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'"
                  [id]="'tab-' + group.id"
                  [attr.aria-selected]="selected() === group.id"
                  aria-controls="group-panel"
                  (click)="selected.set(group.id)"
                >
                  {{ group.label }}
                  <span class="text-xs opacity-75">{{ group.tools.length }}</span>
                </button>
              }
            </div>
          </div>
          <div id="group-panel" role="tabpanel" [attr.aria-labelledby]="'tab-' + selected()">
            <ul class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              @for (tool of selectedTools(); track tool.path) {
                <li><app-tool-card [tool]="tool" /></li>
              }
            </ul>
          </div>
        </section>

        <section class="mt-16" aria-labelledby="why-heading">
          <h2 id="why-heading" class="text-2xl leading-8 sm:text-[28px] sm:leading-9">Why these tools run in your browser</h2>
          <div class="mt-4 grid gap-6 text-muted md:grid-cols-3">
            <p>
              Most online formatters and converters upload what you paste to a server. That is a poor fit for API responses,
              configuration files, access tokens and private photos. Every tool here does its work with JavaScript and
              WebAssembly on your own device, so your data is never sent anywhere.
            </p>
            <p>
              Because nothing travels over the network, the tools are fast even with large files and keep working on a slow
              connection. There is no account to create and nothing to install: open a page and start working.
            </p>
            <p>
              The tools are built for everyday developer work: checking a JSON payload, decoding a JWT from a failing request,
              comparing two API responses, generating typed models for a new endpoint, or preparing images and app icons for a
              release.
            </p>
          </div>
        </section>

        <section class="mt-16" aria-labelledby="guides-heading">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="guides-heading" class="text-2xl leading-8 sm:text-[28px] sm:leading-9">Guides</h2>
            <a routerLink="/guides" class="text-brand underline underline-offset-2">All guides</a>
          </div>
          <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (guide of guides; track guide.slug) {
              <li>
                <a [routerLink]="'/guides/' + guide.slug" class="flex h-full flex-col gap-2 rounded-xl border border-line p-4 hover:border-brand">
                  <span class="font-heading font-semibold">{{ guide.title }}</span>
                  <span class="text-sm text-muted">{{ guide.description }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      </div>
    </div>
  `,
})
export class Home {
  protected readonly groups = TOOL_CATEGORIES.map((category) => ({
    ...category,
    tools: TOOLS.filter((tool) => tool.onHome && tool.category === category.id),
  })).filter((group) => group.tools.length);
  protected readonly toolCount = TOOLS.filter((tool) => tool.live).length;
  /** Only one group's cards show at a time, so the page stays short. */
  protected readonly selected = signal<ToolCategory>(this.groups[0].id);
  protected readonly selectedTools = computed(() => this.groups.find((g) => g.id === this.selected())?.tools ?? []);
  protected readonly icons = ICONS;
  protected readonly user = inject(UserTools);
  protected readonly yourTools = computed(() => {
    const favourites = this.user.favourites();
    return UserTools.tools([...favourites, ...this.user.recent().filter((p) => !favourites.includes(p))]);
  });
  protected readonly chips = ['No login', 'No uploads', 'Free'];
  protected readonly guides = GUIDES.slice(0, 6);
}
