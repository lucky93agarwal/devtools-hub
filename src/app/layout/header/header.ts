import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAV_LINKS } from '../../core/tools';
import { SITE_NAME } from '../../core/app-config';
import { ThemeService } from '../../core/theme.service';
import { ICONS, Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './header.html',
})
export class Header {
  protected readonly theme = inject(ThemeService);
  protected readonly links = NAV_LINKS;
  protected readonly siteName = SITE_NAME;
  protected readonly icons = ICONS;
  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
