import { CodeModel, inferModel } from './infer';
import { toJsonSchema } from './generators/json-schema';
import { toProtobuf } from './generators/protobuf';
import { toGraphQL } from './generators/graphql';
import { toSql } from './generators/sql';

const model = (json: unknown): CodeModel => {
  const result = inferModel(JSON.stringify(json));
  if (!result.ok) throw new Error(result.message);
  return result.model;
};

const SAMPLE = model({
  id: 1,
  user_name: 'Ada',
  address: { city: 'Pune' },
  tags: ['a', null],
  orders: [{ total: 1 }, { total: 2.5, coupon: null }],
  big: 9999999999,
});

describe('toJsonSchema', () => {
  const schema = JSON.parse(toJsonSchema(SAMPLE));

  it('describes the root object with required keys and $defs', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toEqual(['id', 'user_name', 'address', 'tags', 'orders', 'big']);
    expect(schema.properties.address).toEqual({ $ref: '#/$defs/Address' });
    expect(schema.properties.tags).toEqual({ type: 'array', items: { type: ['string', 'null'] } });
    expect(schema.$defs.Order.required).toEqual(['total']);
    expect(schema.$defs.Order.properties.coupon).toEqual({});
  });

  it('supports draft 7 and strict objects', () => {
    const draft7 = JSON.parse(toJsonSchema(SAMPLE, { draft: '07', strict: true }));
    expect(draft7.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(draft7.properties.address).toEqual({ $ref: '#/definitions/Address' });
    expect(draft7.additionalProperties).toBe(false);
    expect(draft7.definitions.Address.additionalProperties).toBe(false);
  });

  it('describes a top-level list', () => {
    const list = JSON.parse(toJsonSchema(model([{ a: 1 }])));
    expect(list.type).toBe('array');
    expect(list.items).toEqual({ $ref: '#/$defs/Root' });
    expect(list.$defs.Root.required).toEqual(['a']);
  });

  it('allows null on nested objects with anyOf', () => {
    const nullable = JSON.parse(toJsonSchema(model([{ a: { x: 1 } }, { a: null }])));
    expect(nullable.$defs.Root.properties.a).toEqual({ anyOf: [{ $ref: '#/$defs/A' }, { type: 'null' }] });
  });
});

describe('toProtobuf', () => {
  const proto = toProtobuf(SAMPLE);

  it('writes proto3 messages numbered in order', () => {
    expect(proto.startsWith('syntax = "proto3";')).toBe(true);
    expect(proto).toContain('message Root {\n  int32 id = 1;\n  string user_name = 2 [json_name = "user_name"];');
    expect(proto).toContain('  Address address = 3;');
    expect(proto).toContain('  repeated string tags = 4;');
    expect(proto).toContain('  repeated Order orders = 5;');
    expect(proto).toContain('  int64 big = 6;');
  });

  it('uses Value for mixed types and optional for scalars that may be missing', () => {
    expect(proto).toContain('import "google/protobuf/struct.proto";');
    expect(proto).toContain('  google.protobuf.Value coupon = 2;');
    const optional = toProtobuf(model([{ a: 1 }, { b: 'x' }]), { packageName: 'shop.v1', jsonNames: true });
    expect(optional).toContain('package shop.v1;');
    expect(optional).toContain('  optional int32 a = 1;');
  });
});

describe('toGraphQL', () => {
  it('writes types with non-null markers and custom scalars', () => {
    const graphql = toGraphQL(SAMPLE);
    expect(graphql).toContain('scalar JSON\nscalar Long');
    expect(graphql).toContain('type Root {\n  id: Int!\n  user_name: String!\n  address: Address!\n  tags: [String]!');
    expect(graphql).toContain('  orders: [Order!]!\n  big: Long!');
    expect(graphql).toContain('  coupon: JSON\n');
  });

  it('writes input types and renames keys that are not GraphQL names', () => {
    const graphql = toGraphQL(model({ 'first-name': 'a' }), { kind: 'input', nonNull: false });
    expect(graphql).toBe('input Root {\n  # JSON key: "first-name"\n  firstName: String\n}\n');
  });
});

describe('toSql', () => {
  it('creates tables in an order where every foreign key target exists', () => {
    const sql = toSql(SAMPLE);
    const position = (table: string) => sql.indexOf(`CREATE TABLE ${table} (`);
    expect(position('address')).toBeLessThan(position('root'));
    expect(position('root')).toBeLessThan(position('"order"'));
  });

  it('uses the JSON id as the primary key and links nested rows', () => {
    const sql = toSql(SAMPLE);
    expect(sql).toContain('CREATE TABLE root (\n  id BIGINT PRIMARY KEY,\n  user_name TEXT NOT NULL,');
    expect(sql).toContain('  address_id BIGINT NOT NULL,');
    expect(sql).toContain('  tags TEXT[] NOT NULL,');
    expect(sql).toContain('  FOREIGN KEY (address_id) REFERENCES address (id)');
    expect(sql).toContain(
      'CREATE TABLE "order" (\n  id BIGSERIAL PRIMARY KEY,\n  total DOUBLE PRECISION NOT NULL,\n  coupon JSONB,\n  root_id BIGINT NOT NULL,',
    );
  });

  it('writes MySQL and SQLite types', () => {
    const mysql = toSql(SAMPLE, { dialect: 'mysql' });
    expect(mysql).toContain('CREATE TABLE `order` (\n  id BIGINT AUTO_INCREMENT PRIMARY KEY,');
    expect(mysql).toContain('  tags JSON NOT NULL,');
    expect(mysql).toContain('  user_name VARCHAR(255) NOT NULL,');
    const sqlite = toSql(SAMPLE, { dialect: 'sqlite' });
    expect(sqlite).toContain('  id INTEGER PRIMARY KEY AUTOINCREMENT,');
    expect(sqlite).toContain('  total REAL NOT NULL,');
  });
});
