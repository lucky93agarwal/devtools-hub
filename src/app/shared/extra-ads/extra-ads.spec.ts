import { bannerUrl, popupDue } from './extra-ads';

describe('popupDue', () => {
  const config = { enabled: true, afterClicks: 3, everyMinutes: 5 };

  it('waits for enough clicks', () => {
    expect(popupDue(2, 0, 10_000_000, config)).toBe(false);
    expect(popupDue(3, 0, 10_000_000, config)).toBe(true);
  });

  it('opens at most once in the set minutes', () => {
    const now = 10_000_000;
    expect(popupDue(5, now - 4 * 60_000, now, config)).toBe(false);
    expect(popupDue(5, now - 5 * 60_000, now, config)).toBe(true);
  });

  it('never opens when turned off', () => {
    expect(popupDue(99, 0, 10_000_000, { ...config, enabled: false })).toBe(false);
  });
});

describe('bannerUrl', () => {
  it('points at the ad frame page with the key and size', () => {
    expect(bannerUrl('abc123', 160, 600)).toBe('/ad-frame?key=abc123&w=160&h=600');
  });
});
