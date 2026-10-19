import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADS } from './app-config';
import { ADS_CONFIG, Ads, AdsConfig, adSlot, adsEnabled } from './ads';
import { AdSlot } from '../shared/ad-slot/ad-slot';
import { PrivacyPage } from '../pages/info/privacy-page';
import { AboutPage } from '../pages/info/about-page';

const ON: AdsConfig = { adsenseClient: 'ca-pub-1234567890123456', slots: { belowTool: '1111111111', beforeFaq: '' } };

describe('ads settings', () => {
  it('stays off in the shipped config until a publisher ID is added', () => {
    expect(adsEnabled(ADS)).toBe(false);
    expect(adSlot('belowTool', ADS)).toBeNull();
  });

  it('needs a real publisher ID and numeric slot IDs', () => {
    expect(adsEnabled(ON)).toBe(true);
    expect(adsEnabled({ ...ON, adsenseClient: 'pub-1234567890123456' })).toBe(false);
    expect(adsEnabled({ ...ON, adsenseClient: 'ca-pub-XXXX' })).toBe(false);
    expect(adSlot('belowTool', ON)).toBe('1111111111');
    expect(adSlot('beforeFaq', ON)).toBeNull();
  });
});

describe('Ads', () => {
  afterEach(() => {
    document.querySelectorAll('script[src*="googlesyndication"]').forEach((s) => s.remove());
    delete (window as { adsbygoogle?: unknown }).adsbygoogle;
  });

  const setup = (config: AdsConfig) => {
    TestBed.configureTestingModule({ providers: [{ provide: ADS_CONFIG, useValue: config }] });
    return TestBed.inject(Ads);
  };

  it('does nothing while ads are off', () => {
    setup(ADS).fill();
    expect(document.querySelector('script[src*="googlesyndication"]')).toBeNull();
    expect((window as { adsbygoogle?: unknown[] }).adsbygoogle).toBeUndefined();
  });

  it('queues each ad and adds the script once, when the browser is idle', () => {
    let idle: (() => void) | undefined;
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback;
      return 1;
    });
    const ads = setup(ON);
    ads.fill();
    ads.fill();
    expect((window as { adsbygoogle?: unknown[] }).adsbygoogle).toHaveLength(2);
    // Nothing is fetched until the page is idle.
    expect(document.querySelector('script[src*="googlesyndication"]')).toBeNull();
    idle!();
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="googlesyndication"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain('client=ca-pub-1234567890123456');
    expect(scripts[0].async).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('AdSlot', () => {
  const render = async (config: AdsConfig, placement: 'belowTool' | 'beforeFaq' = 'belowTool') => {
    const fill = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ADS_CONFIG, useValue: config },
        { provide: Ads, useValue: { fill } },
      ],
    });
    const fixture = TestBed.createComponent(AdSlot);
    fixture.componentRef.setInput('placement', placement);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, fill };
  };

  it('renders nothing while ads are off', async () => {
    const { el, fill } = await render(ADS);
    expect(el.innerHTML.replace(/<!--[^>]*-->/g, '').trim()).toBe('');
    expect(fill).not.toHaveBeenCalled();
  });

  it('reserves labelled space and asks for an ad when on', async () => {
    const { el, fill } = await render(ON);
    expect(el.querySelector('aside')?.getAttribute('aria-label')).toBe('Advertisement');
    const ins = el.querySelector('ins.adsbygoogle')!;
    expect(ins.getAttribute('data-ad-client')).toBe('ca-pub-1234567890123456');
    expect(ins.getAttribute('data-ad-slot')).toBe('1111111111');
    expect(el.querySelector('.min-h-\\[280px\\]')).not.toBeNull();
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('shows a dashed preview box with ?ad-preview, without loading any ad', async () => {
    history.replaceState(null, '', '/json-formatter?ad-preview');
    const { el, fill } = await render(ADS);
    expect(el.querySelector('aside')?.getAttribute('aria-label')).toBe('Advertisement preview');
    expect(el.textContent).toContain('Ad space preview: belowTool');
    expect(el.querySelector('ins')).toBeNull();
    expect(fill).not.toHaveBeenCalled();
    history.replaceState(null, '', '/');
  });

  it('skips a place that has no ad unit', async () => {
    const { el, fill } = await render(ON, 'beforeFaq');
    expect(el.querySelector('aside')).toBeNull();
    expect(fill).not.toHaveBeenCalled();
  });
});

describe('policy text', () => {
  const page = async (component: Type<unknown>, config: AdsConfig) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ADS_CONFIG, useValue: config }] });
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  };

  it('says there are no ads or cookies while ads are off', async () => {
    const privacy = await page(PrivacyPage, ADS);
    expect(privacy).toContain('the site does not use cookies.');
    expect(privacy).toContain('The site does not currently show ads.');
    expect(await page(AboutPage, ADS)).toContain('the site does not use cookies.');
  });

  it('explains Google ads, consent and opting out when ads are on', async () => {
    const privacy = await page(PrivacyPage, ON);
    expect(privacy).toContain('the only cookies are those Google uses to show ads');
    expect(privacy).toContain('ads from Google AdSense');
    expect(privacy).toContain('a consent message from Google asks for your choice');
    expect(privacy).toContain("Google's ad settings");
    expect(privacy).not.toContain('the site does not use cookies');
    const about = await page(AboutPage, ON);
    expect(about).toContain('The site is free because it shows ads');
    expect(about).not.toContain('the site does not use cookies');
  });
});
