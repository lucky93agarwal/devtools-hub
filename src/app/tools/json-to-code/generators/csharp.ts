import { ClassModel, CodeModel, FieldType } from '../infer';
import { makeUnique, noLeadingDigit, pascalCase, quote } from '../names';

export interface CSharpOptions {
  library: 'system-text-json' | 'newtonsoft' | 'none';
  declaration: 'class' | 'record';
  /** Nullable reference types (C# 8 and later): `string?` for values that may be missing. */
  nullableReferences: boolean;
}

export const CSHARP_DEFAULTS: CSharpOptions = {
  library: 'system-text-json',
  declaration: 'class',
  nullableReferences: true,
};

const KEYWORDS = new Set(
  ('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double ' +
    'else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal ' +
    'is lock long namespace new null object operator out override params private protected public readonly ref return ' +
    'sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked ' +
    'unsafe ushort using virtual void volatile while')
    .split(' '),
);

const PRIMITIVES = { string: 'string', int: 'int', long: 'long', double: 'double', boolean: 'bool' };
const VALUE_TYPES = new Set(['int', 'long', 'double', 'bool']);

function typeName(type: FieldType, options: CSharpOptions): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array': {
      const item = typeName(type.item, options);
      const nullable = type.itemNullable && (VALUE_TYPES.has(item) || options.nullableReferences) ? '?' : '';
      return `List<${item}${nullable}>`;
    }
    case 'any':
      return options.library === 'newtonsoft' ? 'JToken' : options.library === 'system-text-json' ? 'JsonElement' : 'object';
  }
}

function attribute(options: CSharpOptions, key: string): string | null {
  if (options.library === 'system-text-json') return `[JsonPropertyName(${quote(key)})]`;
  if (options.library === 'newtonsoft') return `[JsonProperty(${quote(key)})]`;
  return null;
}

/** Starting value for a property that is never null, so nullable warnings stay quiet. */
function initialValue(type: FieldType, typeText: string): string {
  if (type.kind === 'primitive' && type.name === 'string') return ' = string.Empty;';
  if (type.kind === 'array' || type.kind === 'object') return ` = new ${typeText}();`;
  return '';
}

function writeType(model: ClassModel, options: CSharpOptions): string {
  const names = makeUnique(
    model.fields.map((f) => noLeadingDigit(pascalCase(f.key), 'Field')),
    [model.name], // a property cannot share its class's name
  ).map((name) => (KEYWORDS.has(name) ? '@' + name : name));

  const props = model.fields.map((field, i) => {
    let type = typeName(field.type, options);
    const valueType = VALUE_TYPES.has(type);
    // Value types (int, JsonElement…) always need ?; references only with nullable reference types.
    const nullable = field.nullable || field.optional;
    const isValue = valueType || (field.type.kind === 'any' && options.library === 'system-text-json');
    if (nullable && (isValue || options.nullableReferences)) type += '?';
    return { field, name: names[i], type };
  });

  if (options.declaration === 'record') {
    const params = props.map(({ field, name, type }) => {
      const note = attribute(options, field.key);
      return `    ${note ? note.replace('[', '[property: ') + ' ' : ''}${type} ${name}`;
    });
    return params.length ? `public record ${model.name}(\n${params.join(',\n')}\n);` : `public record ${model.name}();`;
  }

  const lines = [`public class ${model.name}`, '{'];
  props.forEach(({ field, name, type }, i) => {
    if (i) lines.push('');
    const note = attribute(options, field.key);
    if (note) lines.push(`    ${note}`);
    const init = !type.endsWith('?') && options.nullableReferences ? initialValue(field.type, type) : '';
    lines.push(`    public ${type} ${name} { get; set; }${init}`);
  });
  lines.push('}');
  return lines.join('\n');
}

export function toCSharp(model: CodeModel, options: CSharpOptions = CSHARP_DEFAULTS): string {
  const usings = ['System.Collections.Generic'];
  if (options.library === 'system-text-json') usings.push('System.Text.Json', 'System.Text.Json.Serialization');
  if (options.library === 'newtonsoft') usings.push('Newtonsoft.Json', 'Newtonsoft.Json.Linq');
  const parts = [usings.map((u) => `using ${u};`).join('\n')];
  if (options.nullableReferences) parts[0] += '\n\n#nullable enable';
  if (model.root.kind === 'array') parts.push(`// The JSON is a list. Read it as ${typeName(model.root, options)}.`);
  parts.push(...model.classes.map((c) => writeType(c, options)));
  return parts.join('\n\n') + '\n';
}
