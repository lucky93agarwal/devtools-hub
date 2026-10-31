import { nextRuns, parseCron } from './cron';

const runs = (expression: string, from: string, count = 3) => {
  const result = parseCron(expression);
  if (!result.ok) throw new Error(result.error);
  return nextRuns(result.cron, new Date(from), count, true).map((d) => d.toISOString());
};

describe('cron', () => {
  it('finds the next runs of common schedules', () => {
    expect(runs('*/15 * * * *', '2026-10-31T10:07:30Z')).toEqual([
      '2026-10-31T10:15:00.000Z',
      '2026-10-31T10:30:00.000Z',
      '2026-10-31T10:45:00.000Z',
    ]);
    expect(runs('30 9 * * 1-5', '2026-10-30T10:00:00Z', 2)).toEqual(['2026-11-02T09:30:00.000Z', '2026-11-03T09:30:00.000Z']);
    expect(runs('0 0 29 2 *', '2026-01-01T00:00:00Z', 1)).toEqual(['2028-02-29T00:00:00.000Z']);
    expect(runs('@monthly', '2026-10-31T00:00:00Z', 1)).toEqual(['2026-11-01T00:00:00.000Z']);
  });

  it('uses names, steps from a start, 7 for Sunday and an optional seconds field', () => {
    expect(runs('0 12 * JAN-MAR SUN', '2026-12-31T00:00:00Z', 1)).toEqual(['2027-01-03T12:00:00.000Z']);
    expect(runs('0 0 * * 7', '2026-10-31T00:00:00Z', 1)).toEqual(['2026-11-01T00:00:00.000Z']);
    expect(runs('10/20 * * * *', '2026-10-31T10:00:00Z')).toEqual([
      '2026-10-31T10:10:00.000Z',
      '2026-10-31T10:30:00.000Z',
      '2026-10-31T10:50:00.000Z',
    ]);
    expect(runs('*/20 * * * * *', '2026-10-31T10:00:05Z', 2)).toEqual(['2026-10-31T10:00:20.000Z', '2026-10-31T10:00:40.000Z']);
  });

  it('runs on either day when day of month and day of week are both set', () => {
    // The 13th, or any Friday.
    expect(runs('0 0 13 * 5', '2026-11-01T00:00:00Z', 3)).toEqual([
      '2026-11-06T00:00:00.000Z',
      '2026-11-13T00:00:00.000Z',
      '2026-11-20T00:00:00.000Z',
    ]);
  });

  it('explains what is wrong', () => {
    expect(parseCron('* * *')).toMatchObject({ ok: false, error: expect.stringContaining('This one has 3') });
    expect(parseCron('60 * * * *')).toEqual({ ok: false, error: '“60” is not a valid minute (0 to 59).' });
    expect(parseCron('0 0 L * *')).toMatchObject({ ok: false, error: expect.stringContaining('Quartz') });
    expect(parseCron('0 0 * * 5-1')).toMatchObject({ ok: false, error: expect.stringContaining('backwards') });
    expect(parseCron('*/0 * * * *')).toMatchObject({ ok: false, error: expect.stringContaining('invalid step') });
    expect(parseCron('@sometimes')).toMatchObject({ ok: false });
    expect(parseCron('0 0 31 2 *').ok).toBe(true);
    expect(runs('0 0 31 2 *', '2026-01-01T00:00:00Z')).toEqual([]);
  });
});
