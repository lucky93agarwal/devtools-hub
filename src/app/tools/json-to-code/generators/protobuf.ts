import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit, snakeCase, words } from '../names';

export interface ProtobufOptions {
  packageName: string;
  /** json_name on fields whose JSON key differs from the protobuf JSON default (lowerCamelCase). */
  jsonNames: boolean;
}

export const PROTOBUF_DEFAULTS: ProtobufOptions = { packageName: '', jsonNames: true };

const SCALARS = { string: 'string', int: 'int32', long: 'int64', double: 'double', boolean: 'bool' };

/** Type of one value (not the repeated part). */
function valueType(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return SCALARS[type.name];
    case 'object':
      return type.className;
    // Protobuf has no list of lists; ListValue holds any JSON list.
    case 'array':
      return 'google.protobuf.ListValue';
    case 'any':
      return 'google.protobuf.Value';
  }
}

const usesWellKnown = (type: FieldType): boolean =>
  type.kind === 'any' || (type.kind === 'array' && (type.item.kind === 'array' || type.item.kind === 'any'));

function writeMessage(model: ClassModel, options: ProtobufOptions): string {
  const names = makeUnique(model.fields.map((f) => noLeadingDigit(snakeCase(f.key), 'f_')));
  const lines = [`message ${model.name} {`];
  model.fields.forEach((field, i) => {
    const repeated = field.type.kind === 'array';
    const type = repeated ? valueType(field.type.kind === 'array' ? field.type.item : field.type) : valueType(field.type);
    // proto3 `optional` tracks whether a scalar was set; messages already do.
    const optional = !repeated && field.type.kind === 'primitive' && (field.nullable || field.optional);
    const label = repeated ? 'repeated ' : optional ? 'optional ' : '';
    const jsonName = options.jsonNames && camelCase(names[i]) !== field.key ? ` [json_name = ${JSON.stringify(field.key)}]` : '';
    lines.push(`  ${label}${type} ${names[i]} = ${i + 1}${jsonName};`);
  });
  lines.push('}');
  return lines.join('\n');
}

export function toProtobuf(model: CodeModel, options: ProtobufOptions = PROTOBUF_DEFAULTS): string {
  const parts = ['syntax = "proto3";'];
  const packageName = words(options.packageName).join('.');
  if (packageName) parts[0] += `\n\npackage ${packageName};`;
  if (model.classes.some((c) => c.fields.some((f) => usesWellKnown(f.type)))) {
    parts.push('import "google/protobuf/struct.proto";');
  }
  if (model.root.kind === 'array') {
    parts.push(`// The JSON is a list. Protobuf messages are objects, so wrap it:\n// message ${model.classes[0].name}List { repeated ${model.classes[0].name} items = 1; }`);
  }
  parts.push(...model.classes.map((c) => writeMessage(c, options)));
  return parts.join('\n\n') + '\n';
}
