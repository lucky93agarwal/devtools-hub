import { currentZoneName, formatOffset, isoInZone, msToWallTime, parseTime, relative, timeZones, wallTimeToMs, zoneOffset } from './time';

describe('time', () => {
  it('guesses the unit from the number of digits', () => {
    expect(parseTime('1730000000')).toEqual({ ok: true, ms: 1730000000000, unit: 's' });
    expect(parseTime('1730000000123')).toEqual({ ok: true, ms: 1730000000123, unit: 'ms' });
    expect(parseTime('1730000000123456')).toEqual({ ok: true, ms: 1730000000123.456, unit: 'us' });
    expect(parseTime('1730000000123456789')).toMatchObject({ ok: true, unit: 'ns' });
    expect(parseTime('1730000000', 'ms')).toEqual({ ok: true, ms: 1730000000, unit: 'ms' });
    expect(parseTime('-86400')).toEqual({ ok: true, ms: -86400000, unit: 's' });
    expect(parseTime('1_730_000_000')).toMatchObject({ ok: true, ms: 1730000000000 });
  });

  it('reads date strings and rejects nonsense', () => {
    expect(parseTime('2026-10-31T12:00:00Z')).toEqual({ ok: true, ms: Date.UTC(2026, 9, 31, 12), unit: 'date' });
    expect(parseTime('soon')).toMatchObject({ ok: false });
    expect(parseTime('9'.repeat(25))).toMatchObject({ ok: false, error: 'This number is too large to be a date.' });
  });

  it('formats an instant in a time zone, including half-hour offsets and DST', () => {
    const ms = Date.UTC(2026, 9, 31, 12, 0, 0, 5);
    expect(isoInZone(ms, 'UTC')).toBe('2026-10-31T12:00:00.005+00:00');
    expect(isoInZone(ms, 'Asia/Kolkata')).toBe('2026-10-31T17:30:00.005+05:30');
    expect(zoneOffset(Date.UTC(2026, 6, 1), 'America/New_York')).toBe(-240);
    expect(zoneOffset(Date.UTC(2026, 0, 1), 'America/New_York')).toBe(-300);
    expect(formatOffset(-570)).toBe('-09:30');
    expect(isoInZone(-1, 'UTC')).toBe('1969-12-31T23:59:59.999+00:00');
  });

  it('turns a wall-clock time in a zone into an instant and back', () => {
    expect(wallTimeToMs('2026-10-31T17:30', 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 31, 12, 0));
    expect(wallTimeToMs('2026-07-01T09:00:30', 'America/New_York')).toBe(Date.UTC(2026, 6, 1, 13, 0, 30));
    expect(msToWallTime(Date.UTC(2026, 9, 31, 12), 'Asia/Kolkata')).toBe('2026-10-31T17:30:00');
    expect(wallTimeToMs('nope', 'UTC')).toBeNull();
  });

  it('lists zones under their current names', () => {
    expect(currentZoneName('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(timeZones()).toContain('Asia/Kolkata');
    expect(timeZones()).not.toContain('Asia/Calcutta');
    expect(timeZones()[0]).toBe('UTC');
  });

  it('says how long ago or how far ahead', () => {
    const now = Date.UTC(2026, 0, 10);
    expect(relative(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(relative(now + 2 * 86400_000, now)).toBe('in 2 days');
    expect(relative(now, now)).toBe('now');
  });
});
