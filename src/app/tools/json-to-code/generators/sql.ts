import { CodeModel, Field, FieldType, innerClass } from '../infer';
import { makeUnique, snakeCase } from '../names';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

export interface SqlOptions {
  dialect: SqlDialect;
}

export const SQL_DEFAULTS: SqlOptions = { dialect: 'postgres' };

/** Common reserved words that need quoting as table or column names. */
const RESERVED = new Set(
  ('add all alter and any as asc between by case check column constraint create cross current date default delete ' +
    'desc distinct drop else end exists foreign from full grant group having in index inner insert into is join key ' +
    'left like limit not null offset on or order outer primary references right select set table then time timestamp ' +
    'to union unique update user using value values when where with')
    .split(' '),
);

interface Dialect {
  quote: (name: string) => string;
  id: string;
  /** Column type for a foreign key to an id. */
  ref: string;
  types: Record<'string' | 'int' | 'long' | 'double' | 'boolean' | 'json', string>;
  /** Type for a list of plain values, if the database has array columns. */
  array?: (item: string) => string;
}

const DIALECTS: Record<SqlDialect, Dialect> = {
  postgres: {
    quote: (n) => `"${n}"`,
    id: 'BIGSERIAL PRIMARY KEY',
    ref: 'BIGINT',
    types: { string: 'TEXT', int: 'INTEGER', long: 'BIGINT', double: 'DOUBLE PRECISION', boolean: 'BOOLEAN', json: 'JSONB' },
    array: (item) => `${item}[]`,
  },
  mysql: {
    quote: (n) => `\`${n}\``,
    id: 'BIGINT AUTO_INCREMENT PRIMARY KEY',
    ref: 'BIGINT',
    types: { string: 'VARCHAR(255)', int: 'INT', long: 'BIGINT', double: 'DOUBLE', boolean: 'BOOLEAN', json: 'JSON' },
  },
  sqlite: {
    quote: (n) => `"${n}"`,
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
    ref: 'INTEGER',
    types: { string: 'TEXT', int: 'INTEGER', long: 'INTEGER', double: 'REAL', boolean: 'INTEGER', json: 'TEXT' },
  },
};

interface Column {
  name: string;
  type: string;
  notNull: boolean;
  references?: string;
  primary?: boolean;
}

interface Table {
  name: string;
  columns: Column[];
  /** Tables this one points at, which must be created first. */
  dependsOn: string[];
}

const isIdField = (field: Field) =>
  field.key.toLowerCase() === 'id' && field.type.kind === 'primitive' && ['int', 'long'].includes(field.type.name);

/**
 * One table per class. A nested object becomes a foreign key on the parent
 * (address_id), and a list of objects becomes a child table pointing back at the
 * parent (order.root_id). Lists of plain values become an array column in
 * PostgreSQL and a JSON column elsewhere.
 */
function buildTables(model: CodeModel, dialect: Dialect): Table[] {
  const tableNames = new Map<string, string>();
  makeUnique(model.classes.map((c) => snakeCase(c.name))).forEach((name, i) => tableNames.set(model.classes[i].name, name));
  const tables = new Map<string, Table>();
  for (const model_ of model.classes) tables.set(model_.name, { name: tableNames.get(model_.name)!, columns: [], dependsOn: [] });

  for (const model_ of model.classes) {
    const table = tables.get(model_.name)!;
    const idField = model_.fields.find(isIdField);
    const columns: Column[] = [];
    if (!idField) columns.push({ name: 'id', type: dialect.id, notNull: false, primary: true });

    for (const field of model_.fields) {
      const notNull = !field.nullable && !field.optional;
      if (field === idField) {
        columns.push({ name: snakeCase(field.key), type: dialect.ref + ' PRIMARY KEY', notNull: false, primary: true });
        continue;
      }
      const child = innerClass(field.type);
      if (field.type.kind === 'object') {
        // One-to-one: the parent stores the id of the nested row.
        const target = tables.get(field.type.className)!;
        columns.push({ name: `${snakeCase(field.key)}_id`, type: dialect.ref, notNull, references: target.name });
        table.dependsOn.push(field.type.className);
      } else if (child && field.type.kind === 'array' && field.type.item.kind === 'object') {
        // One-to-many: each child row points at its parent.
        const childTable = tables.get(child)!;
        childTable.columns.push({ name: `${table.name}_id`, type: dialect.ref, notNull: true, references: table.name });
        childTable.dependsOn.push(model_.name);
      } else {
        columns.push({ name: snakeCase(field.key), type: columnType(field.type, dialect), notNull });
      }
    }
    table.columns.unshift(...columns);
  }

  // Create every table after the ones it points at.
  const ordered: Table[] = [];
  const visit = (name: string, path: Set<string>) => {
    const table = tables.get(name)!;
    if (ordered.includes(table) || path.has(name)) return;
    path.add(name);
    table.dependsOn.forEach((dep) => visit(dep, path));
    ordered.push(table);
  };
  model.classes.forEach((c) => visit(c.name, new Set()));
  return ordered;
}

function columnType(type: FieldType, dialect: Dialect): string {
  if (type.kind === 'primitive') return dialect.types[type.name];
  if (type.kind === 'array' && type.item.kind === 'primitive' && dialect.array) {
    return dialect.array(dialect.types[type.item.name]);
  }
  // Mixed values, lists of lists and lists in databases without array columns.
  return dialect.types.json;
}

export function toSql(model: CodeModel, options: SqlOptions = SQL_DEFAULTS): string {
  const dialect = DIALECTS[options.dialect];
  const name = (n: string) => (RESERVED.has(n) || !/^[a-z_][a-z0-9_]*$/.test(n) ? dialect.quote(n) : n);
  const statements = buildTables(model, dialect).map((table) => {
    const columns = makeUnique(table.columns.map((c) => c.name));
    const lines = table.columns.map((column, i) => {
      const notNull = column.notNull ? ' NOT NULL' : '';
      return `  ${name(columns[i])} ${column.type}${notNull}`;
    });
    for (const [i, column] of table.columns.entries()) {
      if (column.references) lines.push(`  FOREIGN KEY (${name(columns[i])}) REFERENCES ${name(column.references)} (id)`);
    }
    return `CREATE TABLE ${name(table.name)} (\n${lines.join(',\n')}\n);`;
  });
  const header =
    model.root.kind === 'array' ? `-- The JSON is a list: one row in ${name(snakeCase(model.classes[0].name))} per item.\n\n` : '';
  return header + statements.join('\n\n') + '\n';
}

