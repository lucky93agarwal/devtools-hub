import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { ADS, GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from './app-config';
import { adsEnabled } from './ads';
import { TOOLS } from './tools';

/**
 * Sets the search and sharing tags for each page from its route: the title
 * ("<title> | DevTools24"), meta description, canonical link, Open Graph tags,
 * and noindex for pages with `data.noindex`. Runs during prerendering, so the tags
 * are in the HTML that search engines read.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    const fullTitle = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
    this.title.setTitle(fullTitle);

    let route = snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const description = (route.data['description'] as string | undefined) ?? '';
    const noindex = route.data['noindex'] === true || route.data['notFound'] === true;
    const url = canonicalUrl(snapshot.url);

    this.meta.updateTag({ name: 'description', content: description });
    if (noindex) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag('name="robots"');

    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    // Share card made by scripts/make-images.mjs: the tool's own, or the general one.
    const tool = TOOLS.find((t) => snapshot.url.split(/[?#]/)[0] === `/${t.path}`);
    const image = `${SITE_URL}/og/${tool ? tool.path : 'default'}.jpg`;
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: tool ? `${tool.name}, ${SITE_NAME}` : SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    if (GOOGLE_SITE_VERIFICATION) {
      this.meta.updateTag({ name: 'google-site-verification', content: GOOGLE_SITE_VERIFICATION });
    }
    // Lets AdSense confirm that this site belongs to the account.
    if (adsEnabled()) this.meta.updateTag({ name: 'google-adsense-account', content: ADS.adsenseClient });

    this.setCanonical(url);
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}

/** Full address of a page without query, fragment or trailing slash ("/" stays for the home page). */
export function canonicalUrl(routerUrl: string): string {
  const path = routerUrl.split(/[?#]/)[0].replace(/\/+$/, '');
  return `${SITE_URL}${path || '/'}`;
}
