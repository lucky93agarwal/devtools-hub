import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '../../../../worker/tracking';
import { gpsText, placeName } from '../../pages/account/admin-traffic';

describe('parseUserAgent', () => {
  const cases: [string, string, ReturnType<typeof parseUserAgent>][] = [
    [
      'Windows Chrome',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      { deviceType: 'Computer', os: 'Windows', browser: 'Chrome', platform: 'Web' },
    ],
    [
      'Mac Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      { deviceType: 'Computer', os: 'macOS', browser: 'Safari', platform: 'Web' },
    ],
    [
      'Android phone Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      { deviceType: 'Phone', os: 'Android', browser: 'Chrome', platform: 'Android' },
    ],
    [
      'Android tablet',
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      { deviceType: 'Tablet', os: 'Android', browser: 'Chrome', platform: 'Android' },
    ],
    [
      'iPhone Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      { deviceType: 'Phone', os: 'iOS', browser: 'Safari', platform: 'iOS' },
    ],
    [
      'iPad (desktop mode)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      { deviceType: 'Tablet', os: 'iPadOS', browser: 'Safari', platform: 'iOS' },
    ],
    [
      'Windows Edge',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      { deviceType: 'Computer', os: 'Windows', browser: 'Edge', platform: 'Web' },
    ],
    ['Linux Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', { deviceType: 'Computer', os: 'Linux', browser: 'Firefox', platform: 'Web' }],
    ['empty', '', { deviceType: 'Computer', os: 'Unknown', browser: 'Unknown', platform: 'Web' }],
  ];
  for (const [name, ua, expected] of cases) {
    it(name, () => expect(parseUserAgent(ua)).toEqual(expected));
  }
});

describe('admin traffic text', () => {
  it('shows the place', () => {
    expect(placeName({ city: 'Lucknow', region: 'Uttar Pradesh', country: 'IN' })).toBe('Lucknow, Uttar Pradesh, IN');
    expect(placeName({ city: null, region: null, country: 'IN' })).toBe('IN');
    expect(placeName({ city: null, region: null, country: null })).toBe('—');
  });

  it('shows GPS or why there is none', () => {
    expect(gpsText({ gps_status: 'allowed', gps_lat: 26.846694, gps_lon: 80.946166, gps_accuracy: 12.4 })).toBe('26.84669, 80.94617 (±12 m)');
    expect(gpsText({ gps_status: 'denied', gps_lat: null, gps_lon: null, gps_accuracy: null })).toBe('Not allowed');
    expect(gpsText({ gps_status: 'asked', gps_lat: null, gps_lon: null, gps_accuracy: null })).toBe('No answer');
    expect(gpsText({ gps_lat: null, gps_lon: null, gps_accuracy: null })).toBe('—');
  });
});
