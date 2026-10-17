import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit, snakeCase } from '../names';

export interface DartOptions {
  /** Hand-written fromJson/toJson, or annotations for the json_serializable code generator. */
  style: 'plain' | 'json_serializable';
  /** final fields and a const-friendly constructor. */
  finalFields: boolean;
}

export const DART_DEFAULTS: DartOptions = { style: 'plain', finalFields: true };

const KEYWORDS = new Set(
  ('abstract as assert async await break case catch class const continue covariant default deferred do dynamic else ' +
    'enum export extends extension external factory false final finally for Function get hide if implements import in ' +
    'interface is late library mixin new null on operator part required rethrow return set show static super switch ' +
    'sync this throw true try typedef var void while with yield')
    .split(' '),
);

const PRIMITIVES = { string: 'String', int: 'int', long: 'int', double: 'double', boolean: 'bool' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `List<${typeName(type.item)}${type.itemNullable && type.item.kind !== 'any' ? '?' : ''}>`;
    case 'any':
      return 'dynamic';
  }
}

const nullableType = (type: FieldType, nullable: boolean) =>
  typeName(type) + (nullable && type.kind !== 'any' ? '?' : '');

/** Expression that turns the JSON value `value` (not null) into `type`. */
function fromJson(value: string, type: FieldType, depth = 0): string {
  switch (type.kind) {
    case 'primitive':
      // JSON numbers like 1 arrive as int even for double fields.
      return type.name === 'double' ? `(${value} as num).toDouble()` : `${value} as ${typeName(type)}`;
    case 'object':
      return `${type.className}.fromJson(${value} as Map<String, dynamic>)`;
    case 'array': {
      if (type.item.kind === 'any') return `${value} as List<dynamic>`;
      const e = depth ? `e${depth}` : 'e';
      const item = fromJson(e, type.item, depth + 1);
      const mapped = type.itemNullable ? `${e} == null ? null : ${item}` : item;
      return `(${value} as List<dynamic>).map((${e}) => ${mapped}).toList()`;
    }
    case 'any':
      return value;
  }
}

/** Expression that turns the field value `value` back into JSON; `?.` when it may be null. */
function toJson(value: string, type: FieldType, nullable: boolean, depth = 0): string {
  const access = nullable ? '?.' : '.';
  if (type.kind === 'object') return `${value}${access}toJson()`;
  if (type.kind === 'array' && containsObject(type.item)) {
    const e = depth ? `e${depth}` : 'e';
    return `${value}${access}map((${e}) => ${toJson(e, type.item, type.itemNullable, depth + 1)}).toList()`;
  }
  return value;
}

const containsObject = (type: FieldType): boolean =>
  type.kind === 'object' || (type.kind === 'array' && containsObject(type.item));

function fieldNames(model: ClassModel): string[] {
  return makeUnique(model.fields.map((f) => noLeadingDigit(camelCase(f.key), 'v'))).map((name) =>
    KEYWORDS.has(name) ? name + '_' : name,
  );
}

function writePlain(model: ClassModel, options: DartOptions): string {
  const names = fieldNames(model);
  const nullable = model.fields.map((f) => f.nullable || f.optional);
  const lines = [`class ${model.name} {`];
  model.fields.forEach((field, i) => {
    lines.push(`  ${options.finalFields ? 'final ' : ''}${nullableType(field.type, nullable[i])} ${names[i]};`);
  });
  if (model.fields.length) lines.push('');
  const params = model.fields.map((f, i) => `${nullable[i] || f.type.kind === 'any' ? '' : 'required '}this.${names[i]}`);
  lines.push(params.length ? `  ${model.name}({\n${params.map((p) => `    ${p},`).join('\n')}\n  });` : `  ${model.name}();`);
  lines.push('');
  lines.push(`  factory ${model.name}.fromJson(Map<String, dynamic> json) => ${model.name}(`);
  model.fields.forEach((field, i) => {
    const value = `json[${dartString(field.key)}]`;
    const convert = fromJson(value, field.type);
    const expression = nullable[i] && convert !== value ? `${value} == null ? null : ${convert}` : convert;
    lines.push(`        ${names[i]}: ${expression},`);
  });
  lines.push('      );');
  lines.push('');
  lines.push('  Map<String, dynamic> toJson() => {');
  model.fields.forEach((field, i) => {
    lines.push(`        ${dartString(field.key)}: ${toJson(names[i], field.type, nullable[i])},`);
  });
  lines.push('      };');
  lines.push('}');
  return lines.join('\n');
}

function writeGenerated(model: ClassModel, options: DartOptions): string {
  const names = fieldNames(model);
  const lines = ['@JsonSerializable()', `class ${model.name} {`];
  model.fields.forEach((field, i) => {
    const nullable = field.nullable || field.optional;
    if (names[i] !== field.key) lines.push(`  @JsonKey(name: ${dartString(field.key)})`);
    lines.push(`  ${options.finalFields ? 'final ' : ''}${nullableType(field.type, nullable)} ${names[i]};`);
  });
  if (model.fields.length) lines.push('');
  const params = model.fields.map(
    (f, i) => `${f.nullable || f.optional || f.type.kind === 'any' ? '' : 'required '}this.${names[i]}`,
  );
  lines.push(params.length ? `  ${model.name}({\n${params.map((p) => `    ${p},`).join('\n')}\n  });` : `  ${model.name}();`);
  lines.push('');
  lines.push(`  factory ${model.name}.fromJson(Map<String, dynamic> json) => _$${model.name}FromJson(json);`);
  lines.push('');
  lines.push(`  Map<String, dynamic> toJson() => _$${model.name}ToJson(this);`);
  lines.push('}');
  return lines.join('\n');
}

/** Single-quoted Dart string; $ starts interpolation in Dart, so it is escaped too. */
const dartString = (text: string) => `'${text.replace(/[\\'$]/g, (c) => '\\' + c)}'`;

export function toDart(model: CodeModel, options: DartOptions = DART_DEFAULTS): string {
  const parts: string[] = [];
  if (options.style === 'json_serializable') {
    const file = snakeCase(model.classes[0].name);
    parts.push(`import 'package:json_annotation/json_annotation.dart';\n\npart '${file}.g.dart';`);
  }
  if (model.root.kind === 'array') {
    parts.push(`// The JSON is a list. Read it as ${typeName(model.root)}.`);
  }
  const write = options.style === 'plain' ? writePlain : writeGenerated;
  parts.push(...model.classes.map((c) => write(c, options)));
  return parts.join('\n\n') + '\n';
}
