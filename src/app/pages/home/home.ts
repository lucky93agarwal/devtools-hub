import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TOOLS } from '../../core/tools';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolCard } from '../../shared/tool-card/tool-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon, ToolCard],
  template: `
    <section class="container-page pt-12 pb-10 text-center sm:pt-20">
      <h1 class="mx-auto max-w-3xl text-[28px] leading-9 sm:text-[40px] sm:leading-12">
        Developer tools that stay on your device
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-xl leading-7 font-semibold text-muted">
        Format JSON, convert images and decode tokens in seconds. Free, fast and private.
      </p>

      <div class="mt-8 flex justify-center">
        <a routerLink="/json-formatter" class="btn-primary">
          Open JSON formatter
          <app-icon [path]="icons.arrowRight" [size]="20" />
        </a>
      </div>

      <ul class="mt-6 flex flex-wrap justify-center gap-2" aria-label="Highlights">
        @for (chip of chips; track chip) {
          <li class="chip">
            <app-icon [path]="icons.check" [size]="16" />
            {{ chip }}
          </li>
        }
      </ul>
    </section>

    <section class="container-page" aria-labelledby="tools-heading">
      <h2 id="tools-heading" class="sr-only">All tools</h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (tool of tools; track tool.path) {
          <li><app-tool-card [tool]="tool" /></li>
        }
      </ul>
    </section>
  `,
})
export class Home {
  protected readonly tools = TOOLS.filter((tool) => tool.onHome);
  protected readonly icons = ICONS;
  protected readonly chips = ['No login', 'No uploads', 'Free'];
}
