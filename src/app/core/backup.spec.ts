import { clearSiteData, isSiteKey, makeBackup, restoreBackup } from './backup';

describe('backup', () => {
  beforeEach(() => localStorage.clear());

  it('backs up only the site’s own keys and restores them', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('dth-favourite-tools', '["base64"]');
    localStorage.setItem('popup-ad-arrival', '1');
    localStorage.setItem('other-site', 'x');
    const backup = makeBackup(localStorage, new Date('2026-11-01T00:00:00Z'));
    expect(backup).toEqual({ app: 'devtools24', version: 1, createdAt: '2026-11-01T00:00:00.000Z', items: { theme: 'dark', 'dth-favourite-tools': '["base64"]' } });

    localStorage.clear();
    expect(restoreBackup(localStorage, JSON.stringify(backup))).toEqual({ ok: true, count: 2 });
    expect(localStorage.getItem('dth-favourite-tools')).toBe('["base64"]');
  });

  it('refuses files that are not backups and ignores foreign keys inside one', () => {
    expect(restoreBackup(localStorage, 'nope')).toMatchObject({ ok: false });
    expect(restoreBackup(localStorage, '{"app":"other"}')).toMatchObject({ ok: false });
    const sneaky = { app: 'devtools24', version: 1, createdAt: '', items: { 'dth-saved': '[]', 'evil-key': 'x' } };
    expect(restoreBackup(localStorage, JSON.stringify(sneaky))).toEqual({ ok: true, count: 1 });
    expect(localStorage.getItem('evil-key')).toBeNull();
  });

  it('clears only the site’s data', () => {
    localStorage.setItem('dth-history', '{}');
    localStorage.setItem('keep-me', '1');
    expect(clearSiteData(localStorage)).toBe(1);
    expect(localStorage.getItem('keep-me')).toBe('1');
    expect(isSiteKey('dth-new-version-reload')).toBe(false);
  });
});
