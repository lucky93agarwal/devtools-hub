import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { TOOLS } from './core/tools';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('renders the header, main area and footer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-header header')).toBeTruthy();
    expect(el.querySelector('main#main')).toBeTruthy();
    expect(el.querySelector('app-footer')?.textContent).toContain('never leave your browser');
  });
});

describe('routes', () => {
  it('has one route with its search title and description for every tool', () => {
    for (const tool of TOOLS) {
      const route = routes.find((r) => r.path === tool.path);
      expect(route, tool.path).toBeTruthy();
      expect(route?.title).toBe(tool.seoTitle);
      expect(route?.data?.['description']).toBe(tool.metaDescription);
      expect(route?.loadComponent).toBeTypeOf('function');
    }
  });

  it('keeps tools that are not live out of search results', () => {
    for (const tool of TOOLS) {
      const route = routes.find((r) => r.path === tool.path);
      expect(route?.data?.['noindex'], tool.path).toBe(!tool.live);
    }
  });

  it('keeps search titles short enough to show in full', () => {
    for (const tool of TOOLS) {
      expect(`${tool.seoTitle} | DevTools Hub`.length, tool.path).toBeLessThanOrEqual(60);
      expect(tool.metaDescription.length, tool.path).toBeLessThanOrEqual(160);
    }
  });

  it('has a real page with a description for About, Privacy, Terms and Contact', () => {
    for (const path of ['about', 'privacy', 'terms', 'contact']) {
      const route = routes.find((r) => r.path === path);
      expect(route?.data?.['description'], path).toBeTruthy();
      expect(route?.data?.['heading'], path).toBeUndefined();
    }
  });

  it('ends with a not-found route', () => {
    expect(routes.at(-1)?.path).toBe('**');
  });
});
