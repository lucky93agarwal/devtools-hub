import { ClassModel, CodeModel, Field, FieldType } from '../infer';
import { makeUnique, noLeadingDigit, quote, snakeCase } from '../names';

export interface PythonOptions {
  /** from_dict and to_dict methods that map JSON keys and nested classes. */
  methods: boolean;
  /** @dataclass(frozen=True), so instances cannot be changed. */
  frozen: boolean;
}

export const PYTHON_DEFAULTS: PythonOptions = { methods: true, frozen: false };

export interface PydanticOptions {
  /** model_config frozen=True. */
  frozen: boolean;
}

export const PYDANTIC_DEFAULTS: PydanticOptions = { frozen: false };

const KEYWORDS = new Set(
  ('False None True and as assert async await break class continue def del elif else except finally for from global ' +
    'if import in is lambda nonlocal not or pass raise return try while with yield')
    .split(' '),
);

const PRIMITIVES = { string: 'str', int: 'int', long: 'int', double: 'float', boolean: 'bool' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `list[${typeName(type.item)}${type.itemNullable && type.item.kind !== 'any' ? ' | None' : ''}]`;
    case 'any':
      return 'Any';
  }
}

const fieldType = (field: Field) =>
  typeName(field.type) + ((field.nullable || field.optional) && field.type.kind !== 'any' ? ' | None' : '');

const isOptional = (field: Field) => field.nullable || field.optional;

function pythonNames(model: ClassModel): string[] {
  return makeUnique(model.fields.map((f) => noLeadingDigit(snakeCase(f.key), 'field_'))).map((name) =>
    KEYWORDS.has(name) ? name + '_' : name,
  );
}

/** Python needs a class defined before code at module level uses it, so nested classes come first. */
const leavesFirst = (model: CodeModel) => [...model.classes].reverse();

const usesAny = (model: CodeModel) =>
  model.classes.some((c) => c.fields.some((f) => typeName(f.type).includes('Any')));

/** Expression that reads the JSON value `value` (not None) as `type`. */
function fromJson(value: string, type: FieldType, depth = 0): string {
  if (type.kind === 'object') return `${type.className}.from_dict(${value})`;
  if (type.kind === 'primitive' && type.name === 'double') return `float(${value})`;
  if (type.kind === 'array') {
    const x = depth ? `x${depth}` : 'x';
    const item = fromJson(x, type.item, depth + 1);
    if (item === x) return value;
    return `[${type.itemNullable ? `${item} if ${x} is not None else None` : item} for ${x} in ${value}]`;
  }
  return value;
}

/** Expression that turns the attribute `value` (not None) back into JSON. */
function toJson(value: string, type: FieldType, depth = 0): string {
  if (type.kind === 'object') return `${value}.to_dict()`;
  if (type.kind === 'array') {
    const x = depth ? `x${depth}` : 'x';
    const item = toJson(x, type.item, depth + 1);
    if (item === x) return value;
    return `[${type.itemNullable ? `${item} if ${x} is not None else None` : item} for ${x} in ${value}]`;
  }
  return value;
}

function writeDataclass(model: ClassModel, options: PythonOptions): string {
  const names = pythonNames(model);
  // Fields with a default must come after fields without one.
  const order = model.fields.map((field, i) => ({ field, name: names[i] }));
  order.sort((a, b) => Number(isOptional(a.field)) - Number(isOptional(b.field)));

  const lines = [options.frozen ? '@dataclass(frozen=True)' : '@dataclass', `class ${model.name}:`];
  for (const { field, name } of order) {
    lines.push(`    ${name}: ${fieldType(field)}${isOptional(field) ? ' = None' : ''}`);
  }
  if (!model.fields.length) lines.push('    pass');
  if (!options.methods) return lines.join('\n');

  lines.push('', '    @classmethod', `    def from_dict(cls, data: dict[str, Any]) -> ${model.name}:`, '        return cls(');
  for (const { field, name } of order) {
    const key = quote(field.key);
    if (isOptional(field)) {
      const convert = fromJson(`data[${key}]`, field.type);
      const value = convert === `data[${key}]` ? `data.get(${key})` : `${convert} if data.get(${key}) is not None else None`;
      lines.push(`            ${name}=${value},`);
    } else {
      lines.push(`            ${name}=${fromJson(`data[${key}]`, field.type)},`);
    }
  }
  lines.push('        )');
  lines.push('', '    def to_dict(self) -> dict[str, Any]:', '        return {');
  for (const { field, name } of order) {
    const value = toJson(`self.${name}`, field.type);
    const guarded = isOptional(field) && value !== `self.${name}` ? `${value} if self.${name} is not None else None` : value;
    lines.push(`            ${quote(field.key)}: ${guarded},`);
  }
  lines.push('        }');
  return lines.join('\n');
}

export function toPython(model: CodeModel, options: PythonOptions = PYTHON_DEFAULTS): string {
  const imports = ['from __future__ import annotations', '', 'from dataclasses import dataclass'];
  if (options.methods || usesAny(model)) imports.push('from typing import Any');
  const parts = [imports.join('\n')];
  if (model.root.kind === 'array') {
    parts.push(`# The JSON is a list: [${model.classes[0].name}.from_dict(item) for item in data]`);
  }
  parts.push(...leavesFirst(model).map((c) => writeDataclass(c, options)));
  return parts.join('\n\n\n') + '\n';
}

function writePydantic(model: ClassModel, options: PydanticOptions): string {
  const names = pythonNames(model);
  const renamed = model.fields.some((f, i) => names[i] !== f.key);
  const lines = [`class ${model.name}(BaseModel):`];
  const config = [renamed ? 'populate_by_name=True' : '', options.frozen ? 'frozen=True' : ''].filter(Boolean);
  if (config.length) lines.push(`    model_config = ConfigDict(${config.join(', ')})`, '');
  model.fields.forEach((field, i) => {
    const alias = names[i] !== field.key ? `alias=${quote(field.key)}` : '';
    const optional = isOptional(field);
    let value = '';
    if (alias) value = ` = Field(${optional ? 'default=None, ' : ''}${alias})`;
    else if (optional) value = ' = None';
    lines.push(`    ${names[i]}: ${fieldType(field)}${value}`);
  });
  if (!model.fields.length) lines.push('    pass');
  return lines.join('\n');
}

export function toPydantic(model: CodeModel, options: PydanticOptions = PYDANTIC_DEFAULTS): string {
  const pydantic = ['BaseModel'];
  const anyRenamed = model.classes.some((c) => pythonNames(c).some((n, i) => n !== c.fields[i].key));
  if (anyRenamed || options.frozen) pydantic.push('ConfigDict');
  if (anyRenamed) pydantic.push('Field');
  const imports = ['from __future__ import annotations', ''];
  if (usesAny(model)) imports.push('from typing import Any', '');
  imports.push(`from pydantic import ${pydantic.join(', ')}`);
  const parts = [imports.join('\n')];
  if (model.root.kind === 'array') {
    parts.push(`# The JSON is a list: TypeAdapter(list[${model.classes[0].name}]).validate_json(text)`);
  }
  parts.push(...leavesFirst(model).map((c) => writePydantic(c, options)));
  return parts.join('\n\n\n') + '\n';
}
