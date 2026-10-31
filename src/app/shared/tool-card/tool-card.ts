import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToolInfo } from '../../core/tools';
import { UserTools } from '../../core/user-tools';
import { ICONS, Icon } from '../icon/icon';

/** Clickable card that links to a tool page. */
@Component({
  selector: 'app-tool-card',
  host: { class: 'relative block h-full' },
  imports: [RouterLink, Icon],
  template: `
    <a
      [routerLink]="'/' + tool().path"
      class="card group flex h-full flex-col gap-3 p-6 pr-14 transition-colors hover:border-brand"
    >
      <span class="grid size-11 place-items-center rounded-xl bg-page text-brand">
        <app-icon [path]="tool().icon" />
      </span>
      <h4 class="text-xl leading-7 group-hover:text-brand">{{ tool().name }}</h4>
      <p class="text-sm leading-5 text-muted">{{ tool().description }}</p>
    </a>
    <button
      type="button"
      class="absolute top-3 right-3 grid size-10 place-items-center rounded-full hover:bg-page"
      [class]="starred() ? 'text-warning' : 'text-muted hover:text-ink'"
      [attr.aria-label]="(starred() ? 'Unstar ' : 'Star ') + tool().name"
      [attr.aria-pressed]="starred()"
      (click)="user.toggleFavourite(tool().path)"
    >
      <app-icon [path]="icons.star" [size]="18" [filled]="starred()" />
    </button>
  `,
})
export class ToolCard {
  readonly tool = input.required<ToolInfo>();
  protected readonly user = inject(UserTools);
  protected readonly icons = ICONS;

  protected starred(): boolean {
    return this.user.isFavourite(this.tool().path);
  }
}
