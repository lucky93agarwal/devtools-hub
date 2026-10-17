import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique } from '../names';

export interface GraphQLOptions {
  /** Output types, or input types for mutations. */
  kind: 'type' | 'input';
  /** Non-null (!) on values that are always present. */
  nonNull: boolean;
}

export const GRAPHQL_DEFAULTS: GraphQLOptions = { kind: 'type', nonNull: true };

/** Valid GraphQL name; JSON keys are kept when they already are one, so resolvers can return the JSON as it is. */
const isName = (key: string) => /^[_A-Za-z][_0-9A-Za-z]*$/.test(key) && !key.startsWith('__');

// GraphQL's Int is 32-bit, so bigger numbers need a custom scalar.
const SCALARS = { string: 'String', int: 'Int', long: 'Long', double: 'Float', boolean: 'Boolean' };

function typeName(type: FieldType, nonNull: boolean): string {
  switch (type.kind) {
    case 'primitive':
      return SCALARS[type.name];
    case 'object':
      return type.className;
    case 'array': {
      const item = typeName(type.item, nonNull) + (nonNull && !type.itemNullable && type.item.kind !== 'any' ? '!' : '');
      return `[${item}]`;
    }
    case 'any':
      return 'JSON';
  }
}

function scalarsUsed(type: FieldType, found: Set<string>): void {
  if (type.kind === 'any') found.add('JSON');
  if (type.kind === 'primitive' && type.name === 'long') found.add('Long');
  if (type.kind === 'array') scalarsUsed(type.item, found);
}

function writeType(model: ClassModel, options: GraphQLOptions): string {
  const names = makeUnique(model.fields.map((f) => (isName(f.key) ? f.key : camelCase(f.key) || 'field')));
  const lines = [`${options.kind} ${model.name} {`];
  model.fields.forEach((field, i) => {
    const required = options.nonNull && !field.nullable && !field.optional && field.type.kind !== 'any';
    const note = names[i] !== field.key ? `  # JSON key: ${JSON.stringify(field.key)}\n` : '';
    lines.push(`${note}  ${names[i]}: ${typeName(field.type, options.nonNull)}${required ? '!' : ''}`);
  });
  // A type needs at least one field.
  if (!model.fields.length) lines.push('  _empty: Boolean');
  lines.push('}');
  return lines.join('\n');
}

export function toGraphQL(model: CodeModel, options: GraphQLOptions = GRAPHQL_DEFAULTS): string {
  const scalars = new Set<string>();
  model.classes.forEach((c) => c.fields.forEach((f) => scalarsUsed(f.type, scalars)));
  const parts: string[] = [];
  if (scalars.size) {
    parts.push(
      [...scalars]
        .sort()
        .map((s) => `scalar ${s}`)
        .join('\n'),
    );
  }
  if (model.root.kind === 'array') parts.push(`# The JSON is a list: ${typeName(model.root, options.nonNull)}`);
  parts.push(...model.classes.map((c) => writeType(c, options)));
  return parts.join('\n\n') + '\n';
}
