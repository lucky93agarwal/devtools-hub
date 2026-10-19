import { describe, expect, it } from 'vitest';
import { parseTree } from '../json-formatter/json-tree';
import {
  buildRows,
  containerIds,
  copyTextFor,
  defaultCollapsed,
  fileNameFromUrl,
  searchTree,
  splitMatches,
  stringFormat,
  typeInfo,
  urlKind,
} from './json-view-model';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('json view rows', () => {
  const root = parseTree('{"user":{"name":"Asha","tags":["a","b"]},"content-type":"json","n":1}');

  it('draws every value with its path, keys and commas', () => {
    const rows = buildRows(root, new Set());
    expect(rows.map((row) => `${row.kind} ${row.path}${row.comma ? ',' : ''}`)).toEqual([
      'open $',
      'open $.user,',
      'leaf $.user.name,',
      'open $.user.tags',
      'leaf $.user.tags[0],',
      'leaf $.user.tags[1]',
      'close $.user.tags',
      'close $.user,',
      'leaf $["content-type"],',
      'leaf $.n',
      'close $',
    ]);
    expect(rows[2].value).toBe('Asha');
  });

  it('hides the children of a collapsed container', () => {
    const rows = buildRows(root, new Set(['0/0']));
    expect(rows[1]).toMatchObject({ kind: 'open', collapsed: true, count: 2 });
    expect(rows.map((row) => row.path)).not.toContain('$.user.name');
  });

  it('draws big arrays a page at a time', () => {
    const big = parseTree(JSON.stringify(Array.from({ length: 250 }, (_, i) => i)));
    const rows = buildRows(big, new Set());
    expect(rows.filter((row) => row.kind === 'leaf')).toHaveLength(100);
    expect(rows.at(-2)).toMatchObject({ kind: 'more', hidden: 150 });
    expect(buildRows(big, new Set(), new Map([['0', 200]])).filter((row) => row.kind === 'leaf')).toHaveLength(200);
  });

  it('keeps ids unique when an object repeats a key', () => {
    const rows = buildRows(parseTree('{"a":1,"a":2}'), new Set());
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('opens large responses two levels deep', () => {
    const large = parseTree(JSON.stringify({ items: Array.from({ length: 300 }, (_, i) => ({ id: i, tags: [i] })) }));
    expect(defaultCollapsed(large).has('0/0/0')).toBe(true);
    expect(defaultCollapsed(large).has('0/0')).toBe(false);
    expect(defaultCollapsed(root).size).toBe(0);
    expect([...containerIds(root, 1)]).toEqual(['0/0', '0/0/1']);
  });
});

describe('json view values', () => {
  const rowFor = (json: string) => buildRows(parseTree(`{"v":${json}}`), new Set())[1];

  it('names the type of each value', () => {
    expect(typeInfo(rowFor('{"a":1,"b":2}'))).toEqual({ label: 'object', detail: '2 keys' });
    expect(typeInfo(rowFor('["a","b"]'))).toEqual({ label: 'array', detail: '2 items, all strings' });
    expect(typeInfo(rowFor('[1,"b"]')).detail).toBe('2 items, mixed types');
    expect(typeInfo(rowFor('"héllo"'))).toEqual({ label: 'string', detail: '5 characters' });
    expect(typeInfo(rowFor('1.5')).label).toBe('number (decimal)');
    expect(typeInfo(rowFor('1792368000')).detail).toBe('As Unix time: 2026-10-19 00:00:00 UTC');
    expect(typeInfo(rowFor('9007199254740993')).detail).toContain('Too large');
    expect(typeInfo(rowFor('true'))).toEqual({ label: 'boolean', detail: 'true' });
    expect(typeInfo(rowFor('null')).label).toBe('null');
    expect(typeInfo(rowFor(`"${JWT}"`)).label).toBe('string (JWT)');
  });

  it('recognises tokens, links, dates, emails and UUIDs', () => {
    expect(stringFormat(JWT)).toBe('jwt');
    expect(stringFormat('a.b.c')).toBeNull();
    expect(stringFormat('https://example.com/a.png')).toBe('url');
    expect(stringFormat('javascript:alert(1)')).toBeNull();
    expect(stringFormat('2026-10-19T09:30:00Z')).toBe('date');
    expect(stringFormat('a@b.co')).toBe('email');
    expect(stringFormat('6f1c2b9e-3d4a-4c8e-9b7a-2f5d8e1c0a47')).toBe('uuid');
    expect(stringFormat('hello')).toBeNull();
  });

  it('guesses what a link points at', () => {
    expect(urlKind('https://x.dev/photo.JPG?w=2')).toBe('image');
    expect(urlKind('https://x.dev/clip.mp4')).toBe('video');
    expect(urlKind('https://x.dev/roar.mp3')).toBe('audio');
    expect(urlKind('https://x.dev/files/report.pdf')).toBe('pdf');
    expect(urlKind('https://x.dev/u/9919?v=4')).toBe('unknown');
    expect(urlKind('https://x.dev/page.html')).toBe('other');
  });

  it('copies containers as JSON exactly as sent and strings without quotes', () => {
    expect(copyTextFor(rowFor('{"a":1.0,"b":[]}'))).toBe('{\n  "a": 1.0,\n  "b": []\n}');
    expect(copyTextFor(rowFor('"a\\nb"'))).toBe('a\nb');
    expect(copyTextFor(rowFor('12345678901234567890'))).toBe('12345678901234567890');
  });

  it('names downloaded files from the link', () => {
    expect(fileNameFromUrl('https://x.dev/files/my%20report.pdf')).toBe('my report.pdf');
    expect(fileNameFromUrl('https://x.dev/u/9919?v=4', 'image/png')).toBe('9919.png');
    expect(fileNameFromUrl('https://x.dev/', 'image/jpeg')).toBe('download.jpg');
  });
});

describe('json view search', () => {
  it('finds keys and values, ignoring case, with the path to open', () => {
    const root = parseTree('{"Name":"Ada","list":[{"x":"name tag"}],"n":10}');
    expect(searchTree(root, 'name')).toEqual([
      { id: '0/0', ancestors: [{ id: '0', index: 0 }] },
      {
        id: '0/1/0/0',
        ancestors: [
          { id: '0', index: 1 },
          { id: '0/1', index: 0 },
          { id: '0/1/0', index: 0 },
        ],
      },
    ]);
    expect(searchTree(root, '10').map((m) => m.id)).toEqual(['0/2']);
    expect(searchTree(root, '')).toEqual([]);
  });

  it('splits text around matches', () => {
    expect(splitMatches('"Aba ab"', 'AB')).toEqual([
      { text: '"', hit: false },
      { text: 'Ab', hit: true },
      { text: 'a ', hit: false },
      { text: 'ab', hit: true },
      { text: '"', hit: false },
    ]);
  });
});
