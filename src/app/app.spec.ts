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
  it('has one route with a title for every tool', () => {
    for (const tool of TOOLS) {
      const route = routes.find((r) => r.path === tool.path);
      expect(route, tool.path).toBeTruthy();
      expect(route?.title).toBe(tool.name);
      expect(route?.loadComponent).toBeTypeOf('function');
    }
  });

  it('ends with a not-found route', () => {
    expect(routes.at(-1)?.path).toBe('**');
  });
});
