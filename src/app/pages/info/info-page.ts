import { Component, input } from '@angular/core';

/** Layout for text pages such as Privacy and Terms: heading, optional date, then the projected text. */
@Component({
  selector: 'app-info-page',
  template: `
    <article class="container-tool content-page pt-10 pb-6 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ heading() }}</h1>
      @if (updated()) {
        <p class="text-sm text-muted">Last updated {{ updated() }}</p>
      }
      <ng-content />
    </article>
  `,
})
export class InfoPage {
  readonly heading = input.required<string>();
  /** Date shown as "Last updated ...", for policy pages. */
  readonly updated = input('');
}
