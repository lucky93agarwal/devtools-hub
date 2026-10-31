import { Component, afterNextRender, inject } from '@angular/core';
import { Analytics } from './core/analytics';
import { UserTools } from './core/user-tools';
import { AppUpdates } from './core/app-updates';
import { RouterOutlet } from '@angular/router';
import { Header } from './layout/header/header';
import { Footer } from './layout/footer/footer';
import { ExtraAds } from './shared/extra-ads/extra-ads';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, ExtraAds],
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
  `,
})
export class App {
  constructor() {
    const analytics = inject(Analytics);
    // Starts remembering recently used tools for the home page and the search box.
    inject(UserTools);
    inject(AppUpdates);
    afterNextRender(() => analytics.load());
  }
}
