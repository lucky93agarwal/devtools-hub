import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToolInfo } from '../../core/tools';
import { Icon } from '../icon/icon';

/** Clickable card that links to a tool page. */
@Component({
  selector: 'app-tool-card',
  imports: [RouterLink, Icon],
  template: `
    <a
      [routerLink]="'/' + tool().path"
      class="card group flex h-full flex-col gap-3 p-6 transition-colors hover:border-brand"
    >
      <span class="grid size-11 place-items-center rounded-xl bg-page text-brand">
        <app-icon [path]="tool().icon" />
      </span>
      <h3 class="text-xl leading-7 group-hover:text-brand">{{ tool().name }}</h3>
      <p class="text-sm leading-5 text-muted">{{ tool().description }}</p>
    </a>
  `,
})
export class ToolCard {
  readonly tool = input.required<ToolInfo>();
}
