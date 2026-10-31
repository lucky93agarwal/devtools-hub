import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAV_LINKS } from '../../core/tools';
import { SITE_NAME } from '../../core/app-config';
import { ThemeService } from '../../core/theme.service';
import { CommandPalette } from '../../shared/command-palette/command-palette';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolNav } from '../../shared/tool-nav/tool-nav';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, Icon, CommandPalette, ToolNav],
  templateUrl: './header.html',
})
export class Header {
  protected readonly theme = inject(ThemeService);
  protected readonly links = NAV_LINKS;
  protected readonly siteName = SITE_NAME;
  protected readonly icons = ICONS;
  protected readonly pages = [
    { label: 'Guides', path: 'guides' },
    { label: 'About', path: 'about' },
    { label: 'Privacy', path: 'privacy' },
    { label: 'Contact', path: 'contact' },
  ];
  protected readonly drawerOpen = signal(false);
  private readonly drawer = viewChild.required<ElementRef<HTMLDialogElement>>('drawer');
  private readonly toolNav = viewChild.required<ToolNav>('toolNav');

  /** The list of every tool slides in from the left, like an admin panel's menu. */
  protected openDrawer(): void {
    this.toolNav().clearFilter();
    this.drawer().nativeElement.showModal();
    this.drawerOpen.set(true);
    this.toolNav().focusFilter();
  }

  protected closeDrawer(): void {
    this.drawer().nativeElement.close();
  }

  /** A click on the dimmed page beside the panel closes it. */
  protected onDrawerClick(event: MouseEvent): void {
    if (event.target === this.drawer().nativeElement) this.closeDrawer();
  }
}
