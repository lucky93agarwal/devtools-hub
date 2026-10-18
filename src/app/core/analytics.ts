import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ANALYTICS, SITE_URL } from './app-config';

/** Event data may only describe what happened, never what the user typed or uploaded. */
export type EventData = Record<string, string | number | boolean>;

interface UmamiWindow {
  umami?: { track(event: string, data?: EventData): void };
}

/** Which free limit was reached. */
export type LimitKind = 'count' | 'file-size' | 'batch-size';

/** True when both Umami values are set in app-config.ts. */
export const analyticsEnabled = () => Boolean(ANALYTICS.umamiScriptUrl && ANALYTICS.umamiWebsiteId);

/**
 * Privacy-friendly visit counting with Umami: no cookies, and the browser's
 * Do Not Track setting is respected. Page views are counted by Umami itself;
 * tools call track() for actions such as "image-convert".
 */
@Injectable({ providedIn: 'root' })
export class Analytics {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Adds the Umami script once, in the browser, when analytics is configured. */
  load(): void {
    if (!this.browser || !analyticsEnabled() || this.document.querySelector('script[data-website-id]')) return;
    const script = this.document.createElement('script');
    script.defer = true;
    script.src = ANALYTICS.umamiScriptUrl;
    script.dataset['websiteId'] = ANALYTICS.umamiWebsiteId;
    // Count only the real site, not local development or previews.
    script.dataset['domains'] = new URL(SITE_URL).hostname;
    script.dataset['doNotTrack'] = 'true';
    this.document.head.appendChild(script);
  }

  /**
   * Someone hit one of the free limits (too many images, a file too large…).
   * Counted to see whether a paid plan with higher limits is worth building.
   */
  limitHit(tool: string, limit: LimitKind): void {
    this.track('limit-hit', { tool, limit });
  }

  /** Records a custom event. Does nothing when analytics is off or blocked. */
  track(event: string, data?: EventData): void {
    if (!this.browser) return;
    try {
      (this.document.defaultView as (Window & UmamiWindow) | null)?.umami?.track(event, data);
    } catch {
      // A blocked or broken tracker must never break a tool.
    }
  }
}

/** Rough size bucket, so events show how big inputs are without revealing anything about them. */
export function sizeBucket(bytes: number): string {
  if (bytes < 10 * 1024) return 'under 10 KB';
  if (bytes < 100 * 1024) return '10-100 KB';
  if (bytes < 1024 * 1024) return '100 KB-1 MB';
  return 'over 1 MB';
}
