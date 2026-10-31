import { allUnits, formatDuration, parseSize, toBytes, transferSeconds } from './data-size';

describe('data-size', () => {
  it('converts between decimal and binary units', () => {
    const units = Object.fromEntries(allUnits(toBytes(1, 'GiB')).map((u) => [u.id, u.value]));
    expect(units['MiB']).toBe('1,024');
    expect(units['MB']).toBe('1,073.741824');
    expect(units['b']).toBe('8,589,934,592');
  });

  it('reads sizes as people write them', () => {
    expect(parseSize('1.5 GB')).toEqual({ value: 1.5, unit: 'GB' });
    expect(parseSize('700MiB')).toEqual({ value: 700, unit: 'MiB' });
    expect(parseSize('100 Mb')).toEqual({ value: 12.5, unit: 'MB' });
    expect(parseSize('2,048')).toEqual({ value: 2048, unit: 'B' });
    expect(parseSize('lots')).toBeNull();
  });

  it('works out transfer time at a connection speed', () => {
    expect(formatDuration(transferSeconds(toBytes(1, 'GB'), 100))).toBe('1 min 20 s');
    expect(formatDuration(transferSeconds(toBytes(5, 'MB'), 1000))).toBe('40 ms');
    expect(formatDuration(transferSeconds(1, 0))).toBe('—');
  });
});
