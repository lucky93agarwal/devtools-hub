import { bannerUrl, popupDue, popupScale, railsFit } from './extra-ads';

describe('popupDue', () => {
  const config = { enabled: true, onFirstLoad: true, everyClicks: 5 };

  it('opens on every fifth click', () => {
    expect(popupDue(4, config)).toBe(false);
    expect(popupDue(5, config)).toBe(true);
  });

  it('never opens when turned off', () => {
    expect(popupDue(99, { ...config, enabled: false })).toBe(false);
    expect(popupDue(99, { ...config, everyClicks: 0 })).toBe(false);
  });
});

describe('popupScale', () => {
  it('enlarges the popup ad on big screens, up to 1.25 times so it stays sharp', () => {
    expect(popupScale(1500, 950)).toBe(1.25);
  });

  it('keeps it fitting on smaller screens and never shrinks it', () => {
    expect(popupScale(400, 800)).toBe(1.1);
    expect(popupScale(370, 800)).toBe(1);
    expect(popupScale(320, 600)).toBe(1);
  });
});

describe('bannerUrl', () => {
  it('points at the ad frame page with the key and size', () => {
    expect(bannerUrl('abc123', 160, 600)).toBe('/ad-frame?key=abc123&w=160&h=600');
  });
});

describe('railsFit', () => {
  it('needs less room beside the narrow tool pages than beside the wide ones', () => {
    expect(railsFit('/json-formatter', 1440)).toBe(true);
    expect(railsFit('/json-formatter?x=1', 1300)).toBe(false);
    expect(railsFit('/', 1440)).toBe(false);
    expect(railsFit('/api-client#a', 1440)).toBe(false);
    expect(railsFit('/', 1600)).toBe(true);
  });
});
