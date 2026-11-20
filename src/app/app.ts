import { Component, afterNextRender, inject } from '@angular/core';
import { Analytics } from './core/analytics';
import { UserTools } from './core/user-tools';
import { AppUpdates } from './core/app-updates';
import { RouterOutlet } from '@angular/router';
import { Header } from './layout/header/header';
import { Footer } from './layout/footer/footer';
import { ExtraAds } from './shared/extra-ads/extra-ads';
import { GlobalActions } from './shared/global-actions/global-actions';
import { VisitNotice } from './shared/visit-notice/visit-notice';
import { Visits } from './core/accounts/visits';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, ExtraAds, GlobalActions, VisitNotice],
  template: `
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
      >Skip to content</a
    >
    <div class="flex min-h-dvh flex-col">
      <app-header />
      <main id="main" class="flex-1">
        <router-outlet />
      </main>
      <app-footer />
    </div>
    <app-extra-ads />
    <app-global-actions />
    <app-visit-notice />
  `,
})
export class App {
  constructor() {
    const analytics = inject(Analytics);
    // Starts remembering recently used tools for the home page and the search box.
    inject(UserTools);
    inject(AppUpdates);
    const visits = inject(Visits);
    afterNextRender(() => {
      analytics.load();
      // Records this visit (logged in or not) and asks for the location.
      visits.start();
      // The focus ring shows only for keyboard users: a click or tap hides it, Tab brings it back.
      const root = document.documentElement;
      addEventListener('pointerdown', () => (root.dataset['input'] = 'pointer'), {
        capture: true,
        passive: true,
      });
      addEventListener(
        'keydown',
        (event: KeyboardEvent) => {
          if (event.key === 'Tab') root.dataset['input'] = 'keyboard';
        },
        { capture: true },
      );
    });
  }
}
