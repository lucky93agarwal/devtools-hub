import { buildSchema } from 'graphql';
import { fieldsAt, introspectionBody, queryProblems, rootTypes, schemaFromText, selection, toggleArgument, toggleField } from './graphql-tools';

const SDL = `
  type Query {
    "Find one country"
    country(code: ID!): Country
    countries(filter: String, limit: Int = 10): [Country!]!
    search(text: String!): [Result]
  }
  type Mutation { addNote(text: String!): Note }
  type Country { code: ID! name: String! capital: String languages: [Language!]! }
  type Language { code: ID! name: String }
  type Note { id: ID! }
  union Result = Country | Language
`;
const schema = buildSchema(SDL);

describe('GraphQL schema', () => {
  it('reads SDL, introspection results and their errors', () => {
    expect(rootTypes(schemaFromText(SDL)).map((r) => r.operation)).toEqual(['query', 'mutation']);
    const introspection = JSON.stringify({ data: { __schema: schemaFromText(SDL).toConfig() } });
    expect(() => schemaFromText(introspection)).toThrow();
    expect(() => schemaFromText('{"errors":[{"message":"introspection is disabled"}]}')).toThrow('introspection is disabled');
    expect(() => schemaFromText('{"a":1}')).toThrow('not a GraphQL introspection result');
    expect(JSON.parse(introspectionBody()).query).toContain('__schema');
  });

  it('lists fields with their types, arguments and descriptions', () => {
    const [country, countries] = fieldsAt(schema, 'query', []);
    expect(country).toMatchObject({ name: 'country', type: 'Country', leaf: false, description: 'Find one country' });
    expect(country.args).toEqual([{ name: 'code', type: 'ID!', required: true, description: '' }]);
    expect(countries.args.map((a) => [a.name, a.required])).toEqual([
      ['filter', false],
      ['limit', false],
    ]);
    expect(fieldsAt(schema, 'query', ['country']).map((f) => f.name)).toEqual(['code', 'name', 'capital', 'languages']);
    expect(fieldsAt(schema, 'query', ['search']).map((f) => f.name)).toEqual(['__typename']);
    expect(fieldsAt(schema, 'query', ['nope'])).toEqual([]);
  });
});

describe('GraphQL query editing', () => {
  it('ticks a field into an empty query, filling an object with its leaves', () => {
    expect(toggleField('', schema, 'query', ['countries'], true)).toBe(
      'query MyQuery {\n  countries {\n    code\n    name\n    capital\n  }\n}\n',
    );
  });

  it('adds and removes nested fields, dropping parents left empty', () => {
    let query = toggleField('query Q { countries { code } }', schema, 'query', ['countries', 'languages', 'name'], true)!;
    expect(query).toBe('query Q {\n  countries {\n    code\n    languages {\n      name\n    }\n  }\n}\n');
    query = toggleField(query, schema, 'query', ['countries', 'languages', 'name'], false)!;
    expect(query).toBe('query Q {\n  countries {\n    code\n  }\n}\n');
    expect(toggleField(query, schema, 'query', ['countries', 'code'], false)).toBe('');
  });

  it('turns ticked arguments into variables and back', () => {
    const added = toggleArgument('', '', schema, 'query', ['country'], 'code', true)!;
    expect(added.query).toBe('query MyQuery($code: ID!) {\n  country(code: $code) {\n    code\n    name\n    capital\n  }\n}\n');
    expect(JSON.parse(added.variables)).toEqual({ code: null });
    const filled = '{"code": "IN"}';
    const removed = toggleArgument(added.query, filled, schema, 'query', ['country'], 'code', false)!;
    expect(removed.query).toBe('query MyQuery {\n  country {\n    code\n    name\n    capital\n  }\n}\n');
    expect(removed.variables).toBe('');
    // Unticking the field also drops its variable.
    const field = toggleField(added.query, schema, 'query', ['country'], false);
    expect(field).toBe('');
  });

  it('starts a new operation when another root is ticked, and refuses a query it cannot read', () => {
    expect(toggleField('query Q { countries { code } }', schema, 'mutation', ['addNote'], true)).toBe(
      'mutation MyMutation {\n  addNote {\n    id\n  }\n}\n',
    );
    expect(toggleField('query {', schema, 'query', ['countries'], true)).toBeNull();
  });

  it('reports which fields and arguments are selected', () => {
    const picked = selection('query($c: ID!) { country(code: $c) { name languages { code } } }')!;
    expect(picked.operation).toBe('query');
    expect([...picked.fields]).toEqual(['country', 'country/name', 'country/languages', 'country/languages/code']);
    expect([...picked.args]).toEqual(['country(code']);
    expect(selection('query {')).toBeNull();
  });

  it('finds syntax errors and fields the schema does not have', () => {
    expect(queryProblems('query {', schema)[0]).toMatchObject({ line: 1, column: 8 });
    expect(queryProblems('{ countries { population } }', schema)[0].message).toBe(
      'Cannot query field "population" on type "Country".',
    );
    expect(queryProblems('{ countries { code } }', schema)).toEqual([]);
    expect(queryProblems('{ anything }', null)).toEqual([]);
  });
});
