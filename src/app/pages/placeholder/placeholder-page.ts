import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ICONS, Icon } from '../../shared/icon/icon';

/**
 * Temporary page for routes whose tool is not built yet.
 * Reads `heading`, `description` and `phase` from the route data.
 */
@Component({
  selector: 'app-placeholder-page',
  imports: [RouterLink, Icon],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ data()['heading'] }}</h1>
      <p class="mt-3 text-muted">{{ data()['description'] }}</p>

      <div class="card mt-8 flex flex-col items-center gap-4 px-6 py-16 text-center">
        @if (!data()['notFound']) {
          <p class="font-heading text-xl leading-7 font-semibold">Coming soon</p>
          <p class="max-w-md text-sm leading-5 text-muted">
            @if (data()['phase']) {
              This tool is planned for phase {{ data()['phase'] }} of the roadmap.
            } @else {
              This page is being written.
            }
          </p>
        }
        <a routerLink="/" class="btn-secondary">Back to all tools</a>
      </div>

      <p class="mt-6 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="lockIcon" [size]="16" />
        Everything runs in your browser. Nothing is uploaded to a server.
      </p>
    </div>
  `,
})
export class PlaceholderPage {
  protected readonly data = toSignal(inject(ActivatedRoute).data, { requireSync: true });
  protected readonly lockIcon = ICONS.lock;
}
