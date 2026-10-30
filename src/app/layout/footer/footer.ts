import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_NAME } from '../../core/app-config';
import { ICONS, Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, Icon],
  template: `
    <footer class="mt-16 border-t border-line">
      <div
        class="container-page flex flex-col gap-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between"
      >
        <p class="flex items-center gap-2">
          <app-icon [path]="lockIcon" [size]="16" />
          Your files and data never leave your browser.
        </p>
        <nav aria-label="Footer">
          <ul class="flex flex-wrap gap-x-4 gap-y-2">
            @for (link of links; track link.path) {
              <li>
                <a [routerLink]="'/' + link.path" class="rounded hover:text-ink">{{ link.label }}</a>
              </li>
            }
          </ul>
        </nav>
        <p>© {{ year }} {{ siteName }}</p>
      </div>
    </footer>
  `,
})
export class Footer {
  protected readonly siteName = SITE_NAME;
  protected readonly lockIcon = ICONS.lock;
  protected readonly year = new Date().getFullYear();
  protected readonly links = [
    { label: 'Guides', path: 'guides' },
    { label: 'About', path: 'about' },
    { label: 'Privacy', path: 'privacy' },
    { label: 'Terms', path: 'terms' },
    { label: 'Contact', path: 'contact' },
  ];
}
