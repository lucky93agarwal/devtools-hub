import { Component, computed, input } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { ICONS, Icon } from '../icon/icon';
import { ToolGroupNav } from '../tool-group-nav/tool-group-nav';
import { ToolContent, ToolInfoSection } from '../tool-info/tool-info';

/**
 * The frame every tool page shares: links to related tools, heading and description, the tool itself
 * (projected), a privacy note and the explanation, steps and FAQ below.
 */
@Component({
  selector: 'app-tool-page',
  imports: [Icon, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="pt-10 sm:pt-16" [class]="wide() ? 'container-page' : 'container-tool'">
      <app-tool-group-nav [tool]="tool()" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool().name }}</h1>
      <p class="mt-3 text-muted">{{ tool().description }}</p>
      <div class="mt-8">
        <ng-content />
      </div>
      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        {{ privacy() }}
      </p>
      <app-tool-info [tool]="tool()" [content]="content()" />
    </div>
  `,
})
export class ToolPage {
  /** The tool's path in the registry, such as "password-generator". */
  readonly path = input.required<string>();
  readonly content = input.required<ToolContent>();
  readonly privacy = input('Runs in your browser. Nothing you enter is sent to a server.');
  /** Use the full page width, for tools with side-by-side panes. */
  readonly wide = input(false);

  protected readonly icons = ICONS;
  protected readonly tool = computed(() => TOOLS.find((t) => t.path === this.path())!);
}
