import { formatRecords, generate, looksLikeSchema, rng } from './mock';

const SAMPLE = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+91 9876543210',
  city: 'Pune',
  status: 'active',
  price: 249.5,
  isVerified: true,
  createdAt: '2026-01-02T10:00:00Z',
  tags: ['new'],
  address: { street: '12 MG Road', pincode: '411001' },
};

describe('mock', () => {
  it('is repeatable with the same seed', () => {
    expect(generate({ kind: 'sample', value: SAMPLE }, 3, 42)).toEqual(generate({ kind: 'sample', value: SAMPLE }, 3, 42));
    expect(generate({ kind: 'sample', value: SAMPLE }, 3, 42)).not.toEqual(generate({ kind: 'sample', value: SAMPLE }, 3, 43));
    const r = rng(1);
    expect(Array.from({ length: 1000 }, r).every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('follows the sample’s shape and the meaning of its field names', () => {
    const [first, second] = generate({ kind: 'sample', value: SAMPLE }, 2, 7) as (typeof SAMPLE)[];
    expect(Object.keys(first)).toEqual(Object.keys(SAMPLE));
    expect([first.id, second.id]).toEqual([1, 2]);
    expect(first.email).toMatch(/^[a-z.]+@[\w.]+$/);
    expect(first.email).toContain(first.name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    expect(first.phone).toMatch(/^\+91 [6-9]\d{9}$/);
    expect(first.status).toBe('active');
    expect(typeof first.price).toBe('number');
    expect(typeof first.isVerified).toBe('boolean');
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.address.pincode).toMatch(/^\d{6}$/);
    expect(Array.isArray(first.tags)).toBe(true);
  });

  it('follows a JSON Schema', () => {
    const schema = {
      type: 'object',
      required: ['id', 'role', 'email', 'age'],
      properties: {
        id: { type: 'integer' },
        role: { enum: ['admin', 'viewer'] },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 18, maximum: 30 },
        code: { type: 'string', minLength: 4, maxLength: 4 },
      },
    };
    expect(looksLikeSchema(schema)).toBe(true);
    expect(looksLikeSchema(SAMPLE)).toBe(false);
    for (const record of generate({ kind: 'schema', value: schema }, 20, 1) as Record<string, unknown>[]) {
      expect(['admin', 'viewer']).toContain(record['role']);
      expect(record['email']).toMatch(/@/);
      expect(record['age']).toBeGreaterThanOrEqual(18);
      expect(record['age']).toBeLessThanOrEqual(30);
      if (record['code'] !== undefined) expect(record['code']).toHaveLength(4);
    }
  });

  it('writes CSV, SQL and NDJSON', () => {
    const records = [{ id: 1, name: "O'Brien, Pat", address: { city: 'Pune' }, tags: ['a'] }];
    expect(formatRecords(records, 'csv')).toBe('id,name,address.city,tags\n1,"O\'Brien, Pat",Pune,"[""a""]"\n');
    expect(formatRecords(records, 'sql', 'users')).toBe(
      `INSERT INTO "users" ("id", "name", "address.city", "tags") VALUES (1, 'O''Brien, Pat', 'Pune', '["a"]');\n`,
    );
    expect(formatRecords(records, 'ndjson')).toBe(JSON.stringify(records[0]) + '\n');
  });
});
