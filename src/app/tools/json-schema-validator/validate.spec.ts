import { schemaFromSample, validateJson } from './validate';

const SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['id', 'email'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    email: { type: 'string', format: 'email' },
    role: { enum: ['admin', 'user'] },
    age: { type: 'integer', minimum: 0 },
  },
});

describe('validateJson', () => {
  it('accepts JSON that follows the schema', async () => {
    expect(await validateJson(SCHEMA, '{"id": 1, "email": "ada@example.com", "role": "admin"}')).toEqual({ kind: 'valid' });
  });

  it('lists every problem with its path', async () => {
    const result = await validateJson(SCHEMA, '{"id": "1", "email": "nope", "role": "boss", "age": -2, "extra": true}');
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: '/id', message: 'must be integer' },
        { path: '/email', message: 'must match format "email"' },
        { path: '/role', message: 'must be one of "admin", "user"' },
        { path: '/age', message: 'must be >= 0' },
        { path: '/extra', message: 'is not allowed by the schema' },
      ]),
    );
    const missing = await validateJson(SCHEMA, '{"id": 1}');
    expect(missing).toEqual({ kind: 'invalid', errors: [{ path: '/email', message: 'is required but missing' }] });
  });

  it('works with draft-07 schemas and reports broken input', async () => {
    const draft7 = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'array', items: { type: 'number' } });
    expect(await validateJson(draft7, '[1, 2, "3"]')).toEqual({ kind: 'invalid', errors: [{ path: '/2', message: 'must be number' }] });
    expect(await validateJson('{', '{}')).toMatchObject({ kind: 'bad-input', error: expect.stringContaining('schema is not valid JSON') });
    expect(await validateJson('{"type": "nonsense"}', '{}')).toMatchObject({ kind: 'bad-input', error: expect.stringContaining('schema itself') });
  });

  it('makes a starting schema from a sample', async () => {
    const schema = schemaFromSample('{"id": 1, "name": "Ada", "tags": ["a"]}');
    expect(schema).toContain('"type": "object"');
    expect(await validateJson(schema!, '{"id": 2, "name": "Bob", "tags": []}')).toEqual({ kind: 'valid' });
  });
});
