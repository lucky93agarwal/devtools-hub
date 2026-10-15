import { findJsonError, formatJson, minifyJson, position } from './json-tools';

function errorOf(text: string) {
  const result = formatJson(text);
  if (result.ok) throw new Error(`Expected an error for: ${text}`);
  return result.error;
}

describe('formatJson', () => {
  it('pretty-prints with 2 spaces by default', () => {
    expect(formatJson('{"a":1,"b":[true,null]}')).toEqual({
      ok: true,
      output: '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}',
    });
  });

  it('supports 4 spaces and tabs', () => {
    expect(formatJson('{"a":1}', 4)).toEqual({ ok: true, output: '{\n    "a": 1\n}' });
    expect(formatJson('{"a":1}', '\t')).toEqual({ ok: true, output: '{\n\t"a": 1\n}' });
  });

  it('accepts top-level primitives', () => {
    expect(formatJson(' "hi" ')).toEqual({ ok: true, output: '"hi"' });
    expect(formatJson('42')).toEqual({ ok: true, output: '42' });
  });

  it('asks for input when empty', () => {
    expect(errorOf('   ').message).toBe('Paste some JSON first.');
  });
});

describe('minifyJson', () => {
  it('removes whitespace', () => {
    expect(minifyJson('{\n  "a": [1, 2],\n  "b": "x y"\n}')).toEqual({ ok: true, output: '{"a":[1,2],"b":"x y"}' });
  });

  it('reports errors the same way as formatJson', () => {
    const result = minifyJson('[1,]');
    expect(result.ok).toBe(false);
  });
});

describe('error positions', () => {
  it('points at a trailing comma in an object', () => {
    expect(errorOf('{\n  "a": 1,\n}')).toMatchObject({
      message: 'Trailing comma is not allowed before }.',
      line: 3,
      column: 1,
    });
  });

  it('points at a trailing comma in an array', () => {
    expect(errorOf('[1, 2, ]')).toMatchObject({ message: 'Trailing comma is not allowed before ].', line: 1, column: 8 });
  });

  it('points at a missing comma', () => {
    expect(errorOf('{\n  "a": 1\n  "b": 2\n}')).toMatchObject({
      message: `Expected ',' or '}' after the value, found '"'.`,
      line: 3,
      column: 3,
    });
  });

  it('explains single quotes', () => {
    expect(errorOf("{'a': 1}")).toMatchObject({ line: 1, column: 2 });
    expect(errorOf("{'a': 1}").message).toContain('double quotes');
    expect(errorOf("{\"a\": 'x'}").message).toContain('double quotes');
  });

  it('reports a missing colon', () => {
    expect(errorOf('{"a" 1}')).toMatchObject({ message: `Expected ':' after the property name, found '1'.`, column: 6 });
  });

  it('reports unclosed containers and strings', () => {
    expect(errorOf('[1, 2').message).toContain('Missing ]');
    expect(errorOf('{"a": 1').message).toContain('Missing }');
    expect(errorOf('{"a": "x}')).toMatchObject({ message: expect.stringContaining('Unterminated string'), column: 7 });
  });

  it('rejects bad literals, numbers and escapes', () => {
    expect(errorOf('[tru]').message).toBe(`Unexpected 't'. Expected a value.`);
    expect(errorOf('[undefined]').message).toBe(`Unexpected 'u'. Expected a value.`);
    expect(errorOf('[01]').message).toBe('Numbers cannot have leading zeros.');
    expect(errorOf('[1.]').message).toBe('Invalid number.');
    expect(errorOf('["\\x"]').message).toContain('Invalid escape');
    expect(errorOf('["a\nb"]').message).toContain('Line break inside a string');
  });

  it('rejects content after the value', () => {
    expect(errorOf('{} {}')).toMatchObject({ message: `Unexpected '{' after the end of the JSON value.`, column: 4 });
  });

  it('finds no error in valid JSON', () => {
    const valid = '{"a":[1,-2.5e10,0,true,false,null,"\\u00e9\\n"],"b":{}, "c": []}';
    expect(findJsonError(valid)).toBeNull();
  });
});

describe('position', () => {
  it('converts offsets to 1-based line and column', () => {
    expect(position('ab\ncd', 0)).toEqual({ line: 1, column: 1, offset: 0 });
    expect(position('ab\ncd', 4)).toEqual({ line: 2, column: 2, offset: 4 });
  });
});
