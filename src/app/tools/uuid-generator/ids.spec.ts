import { formatId, generate, inspect, nanoid, ulid, uuidV4, uuidV7 } from './ids';

describe('ids', () => {
  it('makes RFC 9562 UUID v4 and v7', () => {
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const v7 = uuidV7(Date.UTC(2026, 9, 31, 12, 0, 0));
    expect(v7).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(inspect(v7)?.details).toContainEqual({ label: 'Created', value: '2026-10-31T12:00:00.000Z' });
  });

  it('makes ULIDs whose first 10 characters hold the time', () => {
    const id = ulid(1469918176385);
    expect(id).toHaveLength(26);
    expect(id.slice(0, 10)).toBe('01ARYZ6S41');
    expect(inspect(id)).toEqual({ kind: 'ULID', details: [{ label: 'Created', value: '2016-07-30T22:36:16.385Z' }] });
  });

  it('makes NanoIDs of any size from any alphabet', () => {
    expect(nanoid()).toMatch(/^[\w-]{21}$/);
    expect(nanoid(10, 'ab')).toMatch(/^[ab]{10}$/);
    expect(() => nanoid(5, 'aaa')).toThrow();
    expect(new Set(generate('nanoid', 200)).size).toBe(200);
  });

  it('formats UUIDs and leaves other ids alone', () => {
    const id = '0190c3a2-7b1e-7cc1-9a2f-3d4e5f607182';
    expect(formatId(id, 'uuid7', { uppercase: true, hyphens: false, braces: true })).toBe('{0190C3A27B1E7CC19A2F3D4E5F607182}');
    expect(formatId('abc', 'nanoid', { uppercase: true, hyphens: false, braces: true })).toBe('abc');
  });

  it('reads the time and node of a version 1 UUID', () => {
    const result = inspect('C232AB00-9414-11EC-B3C8-9F6BDECED846');
    expect(result?.details).toEqual([
      { label: 'Version', value: '1 (time and node)' },
      { label: 'Variant', value: 'RFC 9562' },
      { label: 'Created', value: '2022-02-22T19:22:22.000Z' },
      { label: 'Node', value: '9f:6b:de:ce:d8:46' },
    ]);
    expect(inspect('not an id')).toBeNull();
    expect(inspect('00000000-0000-0000-0000-000000000000')?.kind).toBe('Nil UUID');
  });
});
