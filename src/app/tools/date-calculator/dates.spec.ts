import { addDuration, describeDuration, difference, durationSeconds, emptyDuration, formatIsoDuration, parseIsoDuration } from './dates';

describe('dates', () => {
  it('counts years, months, days and working days between dates', () => {
    expect(difference('2026-01-31', '2026-03-01')).toMatchObject({ years: 0, months: 1, days: 1, totalDays: 29, negative: false });
    expect(difference('1990-05-20', '2026-10-31')).toMatchObject({ years: 36, months: 5, days: 11 });
    expect(difference('2026-01-15', '2026-03-10')).toMatchObject({ years: 0, months: 1, days: 23 });
    expect(difference('2024-02-29', '2025-02-28')).toMatchObject({ years: 1, months: 0, days: 0 });
    // Mon 2 Nov to Mon 9 Nov 2026: five working days.
    expect(difference('2026-11-02', '2026-11-09')?.workingDays).toBe(5);
    expect(difference('2026-11-09', '2026-11-02')).toMatchObject({ totalDays: 7, negative: true });
    expect(difference('nope', '2026-01-01')).toBeNull();
  });

  it('adds and subtracts durations, keeping month ends sensible', () => {
    const jan31 = new Date('2026-01-31T10:00:00Z');
    expect(addDuration(jan31, { ...emptyDuration(), months: 1 }).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addDuration(new Date('2024-01-31T00:00:00Z'), { ...emptyDuration(), months: 1 }).toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(addDuration(jan31, { ...emptyDuration(), days: 1, hours: 2 }, -1).toISOString()).toBe('2026-01-30T08:00:00.000Z');
  });

  it('reads and writes ISO 8601 durations', () => {
    const r = parseIsoDuration('P1Y2M10DT2H30M');
    expect(r).toEqual({ ok: true, duration: { years: 1, months: 2, weeks: 0, days: 10, hours: 2, minutes: 30, seconds: 0 } });
    if (r.ok) {
      expect(formatIsoDuration(r.duration)).toBe('P1Y2M10DT2H30M');
      expect(describeDuration(r.duration)).toBe('1 year, 2 months, 10 days, 2 hours, 30 minutes');
    }
    expect(parseIsoDuration('PT1.5S')).toMatchObject({ ok: true, duration: { seconds: 1.5 } });
    const pt = parseIsoDuration('PT1H30M');
    expect(pt.ok && durationSeconds(pt.duration)).toBe(5400);
    for (const bad of ['P', 'PT', '1H', 'P1H', 'PT1D']) expect(parseIsoDuration(bad).ok, bad).toBe(false);
    expect(formatIsoDuration(emptyDuration())).toBe('PT0S');
  });
});
