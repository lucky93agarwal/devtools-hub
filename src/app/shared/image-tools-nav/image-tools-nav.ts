import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Links between the image tools, shown above each of them. */
@Component({
  selector: 'app-image-tools-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Image tools" class="flex flex-wrap gap-1">
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="!border-brand !text-ink"
          ariaCurrentWhenActive="page"
          class="rounded-full border border-line px-3 py-1.5 text-sm leading-5 font-semibold text-muted hover:text-ink"
          >{{ link.label }}</a
        >
      }
    </nav>
  `,
})
export class ImageToolsNav {
  protected readonly links = [
    { path: '/image-converter', label: 'Convert' },
    { path: '/image-resizer', label: 'Resize' },
    { path: '/image-cropper', label: 'Crop' },
    { path: '/background-remover', label: 'Remove background' },
  ];
}
