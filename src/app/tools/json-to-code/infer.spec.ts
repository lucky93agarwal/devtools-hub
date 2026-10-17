import { CodeModel, inferModel, numberType } from './infer';
import { camelCase, makeUnique, pascalCase, singular, snakeCase, words } from './names';

const model = (json: unknown, root?: string): CodeModel => {
  const result = inferModel(JSON.stringify(json), root);
  if (!result.ok) throw new Error(result.message);
  return result.model;
};

describe('names', () => {
  it('splits keys written in any style', () => {
    expect(words('user_id')).toEqual(['user', 'id']);
    expect(words('userID')).toEqual(['user', 'id']);
    expect(words('HTTPResponseCode')).toEqual(['http', 'response', 'code']);
    expect(words('first-name 2')).toEqual(['first', 'name', '2']);
  });

  it('builds Pascal, camel and snake case', () => {
    expect(pascalCase('user_address')).toBe('UserAddress');
    expect(camelCase('User-Name')).toBe('userName');
    expect(snakeCase('createdAt')).toBe('created_at');
    expect(pascalCase('$$')).toBe('Field');
  });

  it('names list items in the singular', () => {
    expect(singular('users')).toBe('user');
    expect(singular('Categories')).toBe('Category');
    expect(singular('boxes')).toBe('box');
    expect(singular('status')).toBe('status');
    expect(singular('address')).toBe('address');
    expect(singular('data')).toBe('data');
  });

  it('makes names unique without caring about case', () => {
    expect(makeUnique(['userId', 'userId', 'UserID'])).toEqual(['userId', 'userId2', 'UserID3']);
  });
});

describe('numberType', () => {
  it('picks the smallest type that holds the number exactly', () => {
    expect(numberType('42')).toBe('int');
    expect(numberType('-2147483648')).toBe('int');
    expect(numberType('2147483648')).toBe('long');
    expect(numberType('9223372036854775807')).toBe('long');
    expect(numberType('9223372036854775808')).toBe('double');
    expect(numberType('1.0')).toBe('double');
    expect(numberType('1e3')).toBe('double');
  });
});

describe('inferModel', () => {
  it('makes a class per object, named after its key', () => {
    const { classes } = model({ id: 1, user_address: { city: 'Pune' } });
    expect(classes.map((c) => c.name)).toEqual(['Root', 'UserAddress']);
    expect(classes[0].fields[1]).toEqual({
      key: 'user_address',
      type: { kind: 'object', className: 'UserAddress' },
      nullable: false,
      optional: false,
    });
  });

  it('merges every item of a list into one class', () => {
    const { classes } = model({
      users: [
        { id: 1, name: 'Ada', score: 1 },
        { id: 2, nickname: null, score: 2.5 },
      ],
    });
    expect(classes[1].name).toBe('User');
    const field = (key: string) => classes[1].fields.find((f) => f.key === key)!;
    expect(field('id')).toMatchObject({ optional: false, nullable: false, type: { kind: 'primitive', name: 'int' } });
    expect(field('name')).toMatchObject({ optional: true, nullable: false });
    expect(field('nickname')).toMatchObject({ optional: true, nullable: true, type: { kind: 'any' } });
    // 1 and 2.5 widen to double.
    expect(field('score').type).toEqual({ kind: 'primitive', name: 'double' });
  });

  it('uses any for values of different kinds', () => {
    const { classes } = model({ items: [{ v: 'a' }, { v: 1 }] });
    expect(classes[1].fields[0].type).toEqual({ kind: 'any' });
  });

  it('keeps lists of values, empty lists and nulls inside lists', () => {
    const { classes } = model({ tags: ['a', null], empty: [] });
    expect(classes[0].fields[0].type).toEqual({
      kind: 'array',
      item: { kind: 'primitive', name: 'string' },
      itemNullable: true,
    });
    expect(classes[0].fields[1].type).toEqual({ kind: 'array', item: { kind: 'any' }, itemNullable: false });
  });

  it('names the items of a top-level list after the root name', () => {
    const result = model([{ id: 1 }], 'Address');
    expect(result.root).toEqual({ kind: 'array', item: { kind: 'object', className: 'Address' }, itemNullable: false });
  });

  it('gives two different classes with the same key different names', () => {
    const { classes } = model({ a: { data: { x: 1 } }, b: { data: { y: 2 } } });
    expect(classes.map((c) => c.name)).toEqual(['Root', 'A', 'Data', 'B', 'Data2']);
  });

  it('counts a key repeated in one object once', () => {
    const result = inferModel('[{"a": 1, "a": 2}, {"b": 1}]');
    if (!result.ok) throw new Error();
    expect(result.model.classes[0].fields[0]).toMatchObject({ key: 'a', optional: true });
  });

  it('explains JSON without any object', () => {
    expect(inferModel('[1, 2]')).toEqual({
      ok: false,
      message: 'Classes are made from objects. Paste a JSON object, or a list of objects.',
    });
  });
});
