import { DOCUMENT, Injectable, InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ADS, SITE_URL } from './app-config';
import { PAGE_HOST } from './analytics';

export type AdPlacement = keyof typeof ADS.slots;

export interface AdsConfig {
  adsenseClient: string;
  slots: Record<AdPlacement, string>;
}

/** The AdSense settings; app-config.ts by default, replaced in tests. */
export const ADS_CONFIG = new InjectionToken<AdsConfig>('ADS_CONFIG', { providedIn: 'root', factory: () => ADS });

/** True when a real AdSense publisher ID is set. */
export const adsEnabled = (config: AdsConfig = ADS) => /^ca-pub-\d{10,20}$/.test(config.adsenseClient);

/** The ad unit ID for a place on the page, or null when that place has no ad. */
export function adSlot(placement: AdPlacement, config: AdsConfig = ADS): string | null {
  const slot = config.slots[placement];
  return adsEnabled(config) && /^\d+$/.test(slot) ? slot : null;
}

/** How long to wait after the page loads before fetching the ad script, so tools are ready first. */
const IDLE_TIMEOUT_MS = 3000;

interface AdsWindow {
  adsbygoogle?: unknown[];
}

/**
 * Loads Google AdSense once, after the page has finished loading and the browser
 * is idle, so ads never slow down the tools. Google's own consent message
 * (set up in AdSense, Privacy & messaging) is shown by this script where the law
 * requires consent.
 */
@Injectable({ providedIn: 'root' })
export class Ads {
  private readonly config = inject(ADS_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly pageHost = inject(PAGE_HOST);
  private scheduled = false;

  /** Fills an <ins class="adsbygoogle"> that is already in the page. */
  fill(): void {
    // Google serves ads only on the approved site, so local copies and tests load nothing.
    if (!this.browser || !adsEnabled(this.config) || this.pageHost !== new URL(SITE_URL).hostname) return;
    const view = this.document.defaultView as (Window & AdsWindow) | null;
    if (!view) return;
    // Requests made before the script arrives are queued and served once it loads.
    (view.adsbygoogle ??= []).push({});
    this.load(view);
  }

  private load(view: Window): void {
    if (this.scheduled) return;
    this.scheduled = true;
    const add = () => {
      const script = this.document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.config.adsenseClient}`;
      this.document.head.appendChild(script);
    };
    const whenIdle = () =>
      'requestIdleCallback' in view
        ? view.requestIdleCallback(add, { timeout: IDLE_TIMEOUT_MS })
        : setTimeout(add, IDLE_TIMEOUT_MS);
    if (this.document.readyState === 'complete') whenIdle();
    else view.addEventListener('load', whenIdle, { once: true });
  }
}
