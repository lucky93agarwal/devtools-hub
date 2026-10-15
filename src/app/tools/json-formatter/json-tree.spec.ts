import { formatJson, minifyJson } from './json-tools';
import { parseTree, printTree, sortTree } from './json-tree';

const output = (result: ReturnType<typeof formatJson>) => (result.ok ? result.output : `ERROR: ${result.error.message}`);

describe('lossless formatting', () => {
  it('keeps keys in their written order, including keys that look like numbers', () => {
    expect(output(minifyJson('{"b": 1, "10": 2, "2": 3}'))).toBe('{"b":1,"10":2,"2":3}');
  });

  it('keeps numbers exactly as written', () => {
    expect(output(minifyJson('[1.0, 12345678901234567890, 1e5, -0.50]'))).toBe('[1.0,12345678901234567890,1e5,-0.50]');
  });

  it('keeps escape sequences in strings', () => {
    expect(output(minifyJson('["\\u00e9", "a\\/b", "tab\\there"]'))).toBe('["\\u00e9","a\\/b","tab\\there"]');
  });

  it('keeps repeated keys', () => {
    expect(output(minifyJson('{"a": 1, "a": 2}'))).toBe('{"a":1,"a":2}');
  });

  it('keeps whitespace inside strings and handles escaped quotes', () => {
    expect(output(minifyJson('{ "say": "he said \\"hi  there\\"" }'))).toBe('{"say":"he said \\"hi  there\\""}');
  });

  it('prints empty containers compactly', () => {
    expect(output(formatJson('{"a": {}, "b": [ ]}'))).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it('matches JSON.stringify layout for ordinary JSON', () => {
    const text = '{"name":"Ada","tags":["x","y"],"nested":{"deep":[1,{"z":null}]},"ok":true}';
    for (const indent of [2, 4, '\t'] as const) {
      expect(output(formatJson(text, indent))).toBe(JSON.stringify(JSON.parse(text), null, indent));
    }
  });
});

describe('sortKeys', () => {
  it('sorts keys at every level and keeps array order', () => {
    const result = minifyJson('{"b": {"y": 1, "x": 2}, "a": [{"d": 1, "c": 2}, 3, 1]}', { sortKeys: true });
    expect(output(result)).toBe('{"a":[{"c":2,"d":1},3,1],"b":{"x":2,"y":1}}');
  });

  it('sorts by the decoded key, not the escaped text', () => {
    // "a" is "a", so it sorts before "b".
    expect(output(minifyJson('{"b": 1, "\\u0061": 2}', { sortKeys: true }))).toBe('{"\\u0061":2,"b":1}');
  });

  it('makes documents with different key order print the same', () => {
    const one = formatJson('{"id": 1, "name": "Ada", "meta": {"x": 1, "y": 2}}', 2, { sortKeys: true });
    const two = formatJson('{"meta": {"y": 2, "x": 1}, "name": "Ada", "id": 1}', 2, { sortKeys: true });
    expect(output(one)).toBe(output(two));
  });
});

describe('parseTree and printTree', () => {
  it('round-trips minified JSON exactly', () => {
    const text = '{"a":[1,2,{"b":"c"}],"d":{},"e":[],"f":-1.5e-3}';
    expect(printTree(parseTree(text), null)).toBe(text);
  });

  it('leaves primitives alone when sorting', () => {
    expect(sortTree({ kind: 'raw', text: '42' })).toEqual({ kind: 'raw', text: '42' });
  });
});
