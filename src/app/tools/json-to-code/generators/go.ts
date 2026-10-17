import { ClassModel, CodeModel, FieldType } from '../infer';
import { makeUnique, noLeadingDigit, pascalCase, words } from '../names';

export interface GoOptions {
  /** Pointers (*string) for values that may be null or missing, so they can be told apart from "". */
  pointers: boolean;
  /** ,omitempty on optional fields, so empty values are left out when encoding. */
  omitEmpty: boolean;
  packageName: string;
}

export const GO_DEFAULTS: GoOptions = { pointers: true, omitEmpty: true, packageName: 'main' };

/** Go style writes these words in capitals: UserID, not UserId. */
const INITIALISMS = new Set(
  'acl api ascii cpu css dns eof guid html http https id ip json lhs qps ram rhs rpc sla smtp sql ssh tcp tls ttl udp ui uid uri url utf8 uuid vm xml xmpp xsrf xss'.split(
    ' ',
  ),
);

/** Exported Go name: "user_id" to "UserID". */
export function goName(key: string): string {
  const name = words(key)
    .map((word) => (INITIALISMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
  return noLeadingDigit(name || pascalCase(key), 'F');
}

const PRIMITIVES = { string: 'string', int: 'int', long: 'int64', double: 'float64', boolean: 'bool' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `[]${type.itemNullable && type.item.kind !== 'any' ? '*' : ''}${typeName(type.item)}`;
    case 'any':
      return 'any';
  }
}

function writeStruct(model: ClassModel, options: GoOptions): string {
  const names = makeUnique(model.fields.map((f) => goName(f.key)));
  const rows = model.fields.map((field, i) => {
    const maybeMissing = field.nullable || field.optional;
    // Slices and any can already be nil.
    const pointer = options.pointers && maybeMissing && field.type.kind !== 'array' && field.type.kind !== 'any';
    const omit = options.omitEmpty && maybeMissing ? ',omitempty' : '';
    const tag = '`json:' + JSON.stringify(field.key + omit) + '`';
    return [names[i], (pointer ? '*' : '') + typeName(field.type), tag];
  });
  // gofmt lines up the field types and tags in columns.
  const width = (column: number) => Math.max(0, ...rows.map((row) => row[column].length));
  const lines = rows.map((row) => `\t${row[0].padEnd(width(0))} ${row[1].padEnd(width(1))} ${row[2]}`);
  return `type ${model.name} struct {\n${lines.join('\n')}${lines.length ? '\n' : ''}}`;
}

export function toGo(model: CodeModel, options: GoOptions = GO_DEFAULTS): string {
  const packageName = words(options.packageName).join('') || 'main';
  const parts = [`package ${packageName}`];
  if (model.root.kind === 'array') parts.push(`// The JSON is a list. Decode it into a ${typeName(model.root)}.`);
  parts.push(...model.classes.map((c) => writeStruct(c, options)));
  return parts.join('\n\n') + '\n';
}
