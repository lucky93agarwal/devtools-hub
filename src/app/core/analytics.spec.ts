import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Analytics, analyticsEnabled, sizeBucket } from './analytics';
import { ANALYTICS, SITE_URL } from './app-config';

/** The config is read-only in app code; tests switch it on and off. */
const config = ANALYTICS as { umamiScriptUrl: string; umamiWebsiteId: string };

describe('Analytics', () => {
  const original = { ...config };
  const script = () => TestBed.inject(DOCUMENT).querySelector<HTMLScriptElement>('script[data-website-id]');

  afterEach(() => {
    Object.assign(config, original);
    script()?.remove();
    delete (window as { umami?: unknown }).umami;
  });

  it('is off and loads nothing while the Umami values are empty', () => {
    config.umamiScriptUrl = '';
    config.umamiWebsiteId = '';
    expect(analyticsEnabled()).toBe(false);
    TestBed.inject(Analytics).load();
    expect(script()).toBeNull();
  });

  it('loads the tracker once, limited to the real site and honouring Do Not Track', () => {
    config.umamiScriptUrl = 'https://analytics.example/script.js';
    config.umamiWebsiteId = 'abc-123';
    const analytics = TestBed.inject(Analytics);
    analytics.load();
    analytics.load();
    expect(TestBed.inject(DOCUMENT).querySelectorAll('script[data-website-id]')).toHaveLength(1);
    expect(script()!.src).toBe('https://analytics.example/script.js');
    expect(script()!.dataset['websiteId']).toBe('abc-123');
    expect(script()!.dataset['domains']).toBe(new URL(SITE_URL).hostname);
    expect(script()!.dataset['doNotTrack']).toBe('true');
  });

  it('sends events to Umami when it is there and stays quiet when it is not', () => {
    const analytics = TestBed.inject(Analytics);
    expect(() => analytics.track('json-format')).not.toThrow();

    const track = vi.fn();
    (window as { umami?: unknown }).umami = { track };
    analytics.track('image-convert', { format: 'webp', images: 3 });
    expect(track).toHaveBeenCalledWith('image-convert', { format: 'webp', images: 3 });
  });

  it('never lets a broken tracker break a tool', () => {
    (window as { umami?: unknown }).umami = {
      track: () => {
        throw new Error('blocked');
      },
    };
    expect(() => TestBed.inject(Analytics).track('x')).not.toThrow();
  });
});

describe('sizeBucket', () => {
  it('reports rough sizes only', () => {
    expect(sizeBucket(500)).toBe('under 10 KB');
    expect(sizeBucket(50_000)).toBe('10-100 KB');
    expect(sizeBucket(500_000)).toBe('100 KB-1 MB');
    expect(sizeBucket(5_000_000)).toBe('over 1 MB');
  });
});
