import { describe, expect, it } from 'vitest';
import { chunkPages, pageTable, pageText, parsePageRanges, rowsToObjects, toCsv, type TextPiece } from './pdf-core';

describe('parsePageRanges', () => {
  it('reads pages and ranges in order without repeats', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([1, 2, 3, 5]);
    expect(parsePageRanges('5, 2-3, 3', 10)).toEqual([5, 2, 3]);
    expect(parsePageRanges('8-', 10)).toEqual([8, 9, 10]);
    expect(parsePageRanges('-2', 10)).toEqual([1, 2]);
    expect(parsePageRanges('3-1', 10)).toEqual([3, 2, 1]);
  });
  it('explains bad input', () => {
    expect(() => parsePageRanges('', 3)).toThrow('Enter pages');
    expect(() => parsePageRanges('abc', 3)).toThrow('not a page');
    expect(() => parsePageRanges('2-9', 3)).toThrow('has 3 pages');
    expect(() => parsePageRanges('0', 3)).toThrow('start at 1');
  });
});

describe('chunkPages', () => {
  it('splits into groups', () => {
    expect(chunkPages(5, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkPages(3, 1)).toEqual([[1], [2], [3]]);
  });
});

const piece = (text: string, x: number, y: number, width = text.length * 5): TextPiece => ({ text, x, y, width, height: 10 });

describe('text and tables', () => {
  const pieces = [
    piece('Invoice', 50, 700),
    piece('Item', 50, 650),
    piece('Qty', 200, 650),
    piece('Price', 300, 651),
    piece('Pen', 50, 630),
    piece('2', 200, 630),
    piece('10.00', 300, 629),
  ];

  it('reads lines top to bottom', () => {
    expect(pageText(pieces)).toBe('Invoice\nItem    Qty    Price\nPen    2    10.00');
  });

  it('finds columns and builds CSV and objects', () => {
    const rows = pageTable(pieces);
    expect(rows).toEqual([['Invoice'], ['Item', 'Qty', 'Price'], ['Pen', '2', '10.00']]);
    expect(toCsv(rows)).toBe('Invoice\nItem,Qty,Price\nPen,2,10.00');
    expect(rowsToObjects(rows)).toEqual([{ Item: 'Pen', Qty: '2', Price: '10.00' }]);
  });

  it('quotes CSV cells', () => {
    expect(toCsv([['a,b', 'say "hi"']])).toBe('"a,b","say ""hi"""');
  });
});
