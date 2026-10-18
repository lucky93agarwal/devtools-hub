import { Component, afterNextRender, computed, inject, input } from '@angular/core';
import { ADS_CONFIG, AdPlacement, Ads, adSlot } from '../../core/ads';

/**
 * One display ad. Renders nothing at all while ads are off in app-config.ts.
 * The space is reserved up front, so the page does not jump when the ad arrives.
 */
@Component({
  selector: 'app-ad-slot',
  template: `
    @if (slot(); as id) {
      <aside class="flex flex-col gap-1" aria-label="Advertisement">
        <span class="text-xs leading-4 text-muted">Advertisement</span>
        <div class="min-h-[280px] overflow-hidden rounded-xl bg-surface">
          <ins
            class="adsbygoogle block min-h-[280px]"
            [attr.data-ad-client]="client"
            [attr.data-ad-slot]="id"
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
      </aside>
    }
  `,
})
export class AdSlot {
  readonly placement = input.required<AdPlacement>();
  private readonly config = inject(ADS_CONFIG);
  protected readonly client = this.config.adsenseClient;
  protected readonly slot = computed(() => adSlot(this.placement(), this.config));

  constructor() {
    const ads = inject(Ads);
    afterNextRender(() => {
      if (this.slot()) ads.fill();
    });
  }
}
