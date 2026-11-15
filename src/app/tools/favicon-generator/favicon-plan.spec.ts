import { FAVICON_PNGS, fit, headTags, safeColour, safeName, webManifest } from './favicon-plan';

describe('favicon plan', () => {
  it('lists the standard favicon files, with an opaque apple-touch-icon', () => {
    expect(FAVICON_PNGS.map((f) => f.name)).toEqual([
      'favicon-16x16.png',
      'favicon-32x32.png',
      'apple-touch-icon.png',
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
    ]);
    expect(FAVICON_PNGS.find((f) => f.name === 'apple-touch-icon.png')).toEqual({ name: 'apple-touch-icon.png', size: 180, opaque: true });
  });

  it('writes the head tags with a safe theme colour', () => {
    expect(headTags('#4F46E5')).toContain('<meta name="theme-color" content="#4f46e5">');
    expect(headTags('red"><script>')).toContain('content="#ffffff"');
    expect(headTags('#000000')).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48">');
  });

  it('writes a manifest and cleans the name', () => {
    const manifest = JSON.parse(webManifest('My <b>"Cool"</b> Site', '#112233', '#ffffff'));
    expect(manifest.name).toBe('My bCool/b Site');
    expect(manifest.short_name).toBe('My bCool/b S');
    expect(manifest.icons).toHaveLength(2);
    expect(safeName('   ')).toBe('My Website');
    expect(safeColour('#ABCDEF')).toBe('#abcdef');
  });

  it('fits a wide image into the square with padding', () => {
    expect(fit(200, 100, 100, 0.1)).toEqual({ x: 10, y: 30, width: 80, height: 40 });
  });
});
