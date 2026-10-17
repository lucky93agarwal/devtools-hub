import { DEFAULT_DATA_OPTIONS, DataFormat, flatten, parseData, unflatten, writeData } from './formats';

const read = (text: string, format: DataFormat, options = DEFAULT_DATA_OPTIONS) => {
  const result = parseData(text, format, options);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
const write = (value: unknown, format: DataFormat, options = DEFAULT_DATA_OPTIONS) => {
  const result = writeData(value, format, options);
  if (!result.ok) throw new Error(result.message);
  return result.text;
};

const DATA = { name: 'Ada', admin: true, age: 36, tags: ['math', 'code'], address: { city: 'London' } };

describe('YAML', () => {
  it('writes and reads back the same data', () => {
    const yaml = write(DATA, 'yaml');
    expect(yaml).toBe('name: Ada\nadmin: true\nage: 36\ntags:\n  - math\n  - code\naddress:\n  city: London\n');
    expect(read(yaml, 'yaml')).toEqual(DATA);
  });

  it('reports the line and column of a mistake', () => {
    const result = parseData('a: 1\nb: [1, 2\nc: 3\n', 'yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.line).toBeGreaterThanOrEqual(2);
      expect(result.error.message).not.toMatch(/at line/);
    }
  });

  it('uses the chosen indent', () => {
    expect(write({ a: { b: 1 } }, 'yaml', { ...DEFAULT_DATA_OPTIONS, indent: 4 })).toBe('a:\n    b: 1\n');
  });
});

describe('XML', () => {
  it('wraps data in a root element and repeats elements for lists', () => {
    const xml = write(DATA, 'xml');
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <name>Ada</name>\n  <admin>true</admin>\n  <age>36</age>\n' +
        '  <tags>math</tags>\n  <tags>code</tags>\n  <address>\n    <city>London</city>\n  </address>\n</root>\n',
    );
  });

  it('keeps a single top-level key as the root, and attributes', () => {
    const xml = write({ book: { '@id': 7, title: 'Notes' } }, 'xml');
    expect(xml).toContain('<book id="7">\n  <title>Notes</title>\n</book>');
  });

  it('makes keys valid element names', () => {
    expect(write({ 'first name': 'a', '2fa': true }, 'xml')).toContain('<first_name>a</first_name>\n  <_2fa>true</_2fa>');
  });

  it('reads elements, attributes and typed values', () => {
    expect(read('<?xml version="1.0"?><book id="7"><title>Notes</title><pages>120</pages></book>', 'xml')).toEqual({
      book: { '@id': 7, title: 'Notes', pages: 120 },
    });
    const text = read('<a><n>007</n></a>', 'xml', { ...DEFAULT_DATA_OPTIONS, typedValues: false });
    expect(text).toEqual({ a: { n: '007' } });
  });

  it('reports where the XML is broken', () => {
    const result = parseData('<a>\n  <b>1</c>\n</a>', 'xml');
    expect(result).toMatchObject({ ok: false, error: { line: 2 } });
  });
});

describe('CSV', () => {
  const rows = [
    { id: 1, name: 'Ada', address: { city: 'London' } },
    { id: 2, name: 'Alan, M.', address: { city: 'Wilmslow' }, note: 'says "hi"' },
  ];

  it('writes one row per object, with dot paths for nested keys and quotes where needed', () => {
    expect(write(rows, 'csv')).toBe(
      'id,name,address.city,note\n1,Ada,London,\n2,"Alan, M.",Wilmslow,"says ""hi"""\n',
    );
  });

  it('reads it back into nested objects with typed values', () => {
    const back = read('id,name,address.city,tags.0,tags.1\n1,Ada,London,x,y\n', 'csv');
    expect(back).toEqual([{ id: 1, name: 'Ada', address: { city: 'London' }, tags: ['x', 'y'] }]);
  });

  it('detects semicolons and tabs, and writes the chosen delimiter', () => {
    expect(read('a;b\n1;2\n', 'csv')).toEqual([{ a: 1, b: 2 }]);
    expect(read('a\tb\n1\t2\n', 'csv')).toEqual([{ a: 1, b: 2 }]);
    expect(write([{ a: 1, b: 2 }], 'csv', { ...DEFAULT_DATA_OPTIONS, csvDelimiter: ';' })).toBe('a;b\n1;2\n');
  });

  it('keeps text when typed values are off, and writes a single object as one row', () => {
    expect(read('zip\n00123\n', 'csv', { ...DEFAULT_DATA_OPTIONS, typedValues: false })).toEqual([{ zip: '00123' }]);
    expect(write({ a: 1 }, 'csv')).toBe('a\n1\n');
    expect(write([1, 2], 'csv')).toBe('value\n1\n2\n');
  });

  it('reports a quote that is never closed', () => {
    expect(parseData('a,b\n1,"oops\n', 'csv')).toMatchObject({ ok: false, error: { line: 2 } });
  });
});

describe('JSON', () => {
  it('reports the position of a mistake', () => {
    expect(parseData('{"a": 1,}', 'json')).toMatchObject({ ok: false, error: { line: 1, column: 9 } });
  });
});

describe('flatten and unflatten', () => {
  it('round-trip nested objects and lists', () => {
    const value = { a: { b: 1, c: [true, { d: 'x' }] }, e: null };
    const flat = flatten(value);
    expect(flat).toEqual({ 'a.b': 1, 'a.c.0': true, 'a.c.1.d': 'x', e: null });
    expect(unflatten(flat)).toEqual(value);
  });

  it('keeps empty objects and lists as JSON text', () => {
    expect(flatten({ a: [], b: {} })).toEqual({ a: '[]', b: '{}' });
  });
});
