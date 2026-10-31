import { Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TOOLS, TOOL_CATEGORIES, ToolInfo } from '../../core/tools';

/** Links to the other tools in the same group, shown above a tool. */
@Component({
  selector: 'app-tool-group-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav [attr.aria-label]="label()" class="flex flex-wrap gap-1">
      @for (link of links(); track link.path) {
        <a
          [routerLink]="'/' + link.path"
          routerLinkActive="!border-brand !text-ink"
          ariaCurrentWhenActive="page"
          class="rounded-full border border-line px-3 py-1.5 text-sm leading-5 font-semibold text-muted hover:text-ink"
          >{{ link.shortName ?? link.name }}</a
        >
      }
    </nav>
  `,
})
export class ToolGroupNav {
  readonly tool = input.required<ToolInfo>();

  protected readonly links = computed(() => TOOLS.filter((t) => t.live && t.category === this.tool().category));
  protected readonly label = computed(
    () => TOOL_CATEGORIES.find((c) => c.id === this.tool().category)?.label ?? 'Related tools',
  );
}
