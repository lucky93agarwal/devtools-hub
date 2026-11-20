import { ChangeDetectionStrategy, Component, afterNextRender, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ACCOUNTS } from '../../core/app-config';

const SEEN_KEY = 'dt_visit_notice';

/** A small bar at the bottom: what is recorded on each visit, with OK and a link to the Privacy Policy. */
@Component({
  selector: 'app-visit-notice',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div
        class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur"
        role="region"
        aria-label="Visit notice"
      >
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p class="min-w-0 flex-1 text-muted">
            We record each visit (IP address, approximate city, device and browser) and, if you allow it, your location, to keep accounts safe and improve
            the site.
          </p>
          <div class="flex shrink-0 items-center gap-2">
            <a routerLink="/privacy" class="rounded-full px-3 py-1.5 font-semibold text-brand hover:underline">Privacy</a>
            <button type="button" class="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand hover:opacity-90" (click)="ok()">OK</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class VisitNotice {
  readonly show = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!ACCOUNTS.enabled) return;
      try {
        this.show.set(localStorage.getItem(SEEN_KEY) !== '1');
      } catch {
        this.show.set(true);
      }
    });
  }

  ok(): void {
    this.show.set(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: the bar comes back next time.
    }
  }
}
