import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { SITE_URL } from './app-config';
import { SeoTitleStrategy, canonicalUrl } from './seo-title-strategy';

@Component({ template: '' })
class Blank {}

describe('canonicalUrl', () => {
  it('drops query, fragment and trailing slash, and keeps / for the home page', () => {
    expect(canonicalUrl('/')).toBe(`${SITE_URL}/`);
    expect(canonicalUrl('/jwt/')).toBe(`${SITE_URL}/jwt`);
    expect(canonicalUrl('/jwt?token=abc#x')).toBe(`${SITE_URL}/jwt`);
  });
});

describe('SeoTitleStrategy', () => {
  async function go(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank, data: { description: 'Home text' } },
          { path: 'tool', title: 'A Tool', component: Blank, data: { description: 'Tool text' } },
          { path: 'soon', title: 'Soon', component: Blank, data: { description: 'Later', noindex: true } },
        ]),
        { provide: TitleStrategy, useClass: SeoTitleStrategy },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const head = TestBed.inject(DOCUMENT).head;
    const meta = (selector: string) => head.querySelector(`meta[${selector}]`)?.getAttribute('content');
    return {
      title: TestBed.inject(DOCUMENT).title,
      description: meta('name="description"'),
      robots: meta('name="robots"'),
      ogTitle: meta('property="og:title"'),
      ogUrl: meta('property="og:url"'),
      canonical: head.querySelectorAll('link[rel="canonical"]'),
    };
  }

  it('sets the title, description, canonical link and sharing tags', async () => {
    const page = await go('/tool?x=1');
    expect(page.title).toBe('A Tool | DevTools Hub');
    expect(page.description).toBe('Tool text');
    expect(page.ogTitle).toBe('A Tool | DevTools Hub');
    expect(page.ogUrl).toBe(`${SITE_URL}/tool`);
    expect(page.canonical).toHaveLength(1);
    expect(page.canonical[0].getAttribute('href')).toBe(`${SITE_URL}/tool`);
    expect(page.robots).toBeUndefined();
  });

  it('uses the site name alone when a page has no title', async () => {
    expect((await go('/')).title).toBe('DevTools Hub');
  });

  it('marks noindex pages and clears the mark on the next page', async () => {
    expect((await go('/soon')).robots).toBe('noindex');
    await TestBed.inject(Router).navigateByUrl('/tool');
    expect(TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
