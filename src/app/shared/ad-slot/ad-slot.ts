import { Component, DOCUMENT, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { ADS_CONFIG, AdPlacement, Ads, adSlot } from '../../core/ads';

/** Add ?ad-preview to any address to see where ads will go, before AdSense is set up. */
export const AD_PREVIEW_PARAM = 'ad-preview';

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
    } @else if (preview()) {
      <aside class="flex flex-col gap-1" aria-label="Advertisement preview">
        <span class="text-xs leading-4 text-muted">Advertisement</span>
        <div
          class="grid min-h-[280px] place-items-center rounded-xl border-2 border-dashed border-line text-sm text-muted"
        >
          Ad space preview: {{ placement() }}
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
  /** Set in the browser only, after hydration, so prerendered pages never contain it. */
  protected readonly preview = signal(false);

  constructor() {
    const ads = inject(Ads);
    const document = inject(DOCUMENT);
    afterNextRender(() => {
      if (this.slot()) ads.fill();
      else if (new URLSearchParams(document.defaultView?.location.search).has(AD_PREVIEW_PARAM)) this.preview.set(true);
    });
  }
}
