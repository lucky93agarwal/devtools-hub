import { SAMPLE_AGENTS, parseUserAgent } from './ua';

const ua = (label: string) => SAMPLE_AGENTS.find((s) => s.label === label)!.ua;

describe('ua', () => {
  it('names the browser, system and device', () => {
    expect(parseUserAgent(ua('Chrome on Windows'))).toMatchObject({ browser: 'Chrome 141.0.0.0', os: 'Windows 10', device: 'Desktop', bot: null });
    expect(parseUserAgent(ua('Safari on iPhone'))).toMatchObject({ browser: 'Safari 18.6', os: 'iOS 18.6', bot: null });
    expect(parseUserAgent(ua('Safari on iPhone'))?.device).toMatch(/^Mobile \(Apple/);
    expect(parseUserAgent(ua('Chrome on Android'))).toMatchObject({ os: 'Android 15', bot: null });
  });

  it('spots bots and HTTP clients', () => {
    expect(parseUserAgent(ua('Googlebot'))?.bot).toBe('Googlebot (Google Search)');
    expect(parseUserAgent(ua('OkHttp'))?.bot).toBe('OkHttp (Android or Java)');
    expect(parseUserAgent('')).toBeNull();
  });
});
