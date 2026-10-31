import { Injectable, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * With the service worker, an open tab keeps using the version it started with (so a deploy never breaks it).
 * Once a newer version has downloaded, the next page change loads it with a full page load, so nobody loses
 * what they are typing.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private ready = false;

  constructor() {
    // Missing in unit tests and switched off in development.
    const updates = inject(SwUpdate, { optional: true });
    if (!updates?.isEnabled) return;
    updates.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => (this.ready = true));
    // A version the browser can no longer serve (its files were evicted) cannot be recovered without a reload.
    updates.unrecoverable.subscribe(() => location.reload());
    inject(Router)
      .events.pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe((e) => {
        if (this.ready) location.assign(e.url);
      });
  }
}
