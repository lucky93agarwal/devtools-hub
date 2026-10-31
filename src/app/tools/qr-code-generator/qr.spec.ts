import { emailPayload, makeQr, phonePayload, toSvg, wifiPayload } from './qr';

describe('qr', () => {
  it('makes a square matrix with finder patterns in three corners', () => {
    const result = makeQr('https://devtools24.in', 'M');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const m = result.modules;
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const n = m.length;
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c] && m[r][c + 6] && m[r + 6][c] && m[r + 3][c + 3]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
    }
  });

  it('grows with the data and the error correction level', () => {
    const size = (text: string, ecc: 'L' | 'H') => {
      const r = makeQr(text, ecc);
      return r.ok ? r.modules.length : 0;
    };
    expect(size('hi', 'L')).toBe(21);
    expect(size('x'.repeat(200), 'H')).toBeGreaterThan(size('x'.repeat(200), 'L'));
  });

  it('encodes any language as UTF-8 and refuses too much data', () => {
    expect(makeQr('नमस्ते 👋', 'M').ok).toBe(true);
    expect(makeQr('x'.repeat(3000), 'H')).toMatchObject({ ok: false });
    expect(makeQr('', 'M')).toEqual({ ok: false, error: '' });
  });

  it('draws one path, with the quiet zone in the view box', () => {
    const svg = toSvg([[true, true], [false, true]], { margin: 4, foreground: '#000', background: '#fff' });
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(svg).toContain('d="M4 4h2v1h-2zM5 5h1v1h-1z"');
    expect(toSvg([[true]], { margin: 0, foreground: '#000', background: 'transparent' })).not.toContain('<rect');
  });

  it('builds Wi-Fi, email and phone payloads', () => {
    expect(wifiPayload('Home;Net', 'pa:ss"1', 'WPA', false)).toBe('WIFI:T:WPA;S:Home\\;Net;P:pa\\:ss\\"1;;');
    expect(wifiPayload('Cafe', 'x', 'nopass', true)).toBe('WIFI:T:nopass;S:Cafe;H:true;;');
    expect(emailPayload('a@b.dev', 'Hi there', '')).toBe('mailto:a@b.dev?subject=Hi%20there');
    expect(phonePayload('+91 98765-43210')).toBe('tel:+919876543210');
  });
});
