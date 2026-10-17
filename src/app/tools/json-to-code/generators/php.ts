import { ClassModel, CodeModel, Field, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit } from '../names';

export interface PhpOptions {
  /** readonly properties (PHP 8.1 and later). */
  readonly: boolean;
  /** fromArray() and toArray() methods. */
  methods: boolean;
}

export const PHP_DEFAULTS: PhpOptions = { readonly: true, methods: true };

/** Names PHP does not allow for a class. */
const RESERVED_CLASS_NAMES = new Set(
  ('array bool callable class false float int iterable list mixed never null object parent self static string true ' +
    'void enum match fn')
    .split(' '),
);

const PRIMITIVES = { string: 'string', int: 'int', long: 'int', double: 'float', boolean: 'bool' };

/** Class names, renamed where PHP reserves the word ("List" becomes "ListItem"). */
export function phpClassNames(model: CodeModel): Map<string, string> {
  return new Map(
    model.classes.map((c) => [c.name, RESERVED_CLASS_NAMES.has(c.name.toLowerCase()) ? c.name + 'Item' : c.name]),
  );
}

function typeName(type: FieldType, names: Map<string, string>): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return names.get(type.className)!;
    case 'array':
      return 'array';
    case 'any':
      return 'mixed';
  }
}

/** PHPDoc type, which can say what an array holds. */
function docType(type: FieldType, names: Map<string, string>): string {
  if (type.kind === 'array') {
    const item = docType(type.item, names) + (type.itemNullable && type.item.kind !== 'any' ? '|null' : '');
    return `list<${item}>`;
  }
  return typeName(type, names);
}

const isOptional = (field: Field) => field.nullable || field.optional;
const phpString = (text: string) => `'${text.replace(/[\\']/g, (c) => '\\' + c)}'`;

function fromArray(value: string, type: FieldType, names: Map<string, string>, depth = 0): string {
  if (type.kind === 'object') return `${names.get(type.className)}::fromArray(${value})`;
  if (type.kind === 'primitive' && type.name === 'double') return `(float) ${value}`;
  if (type.kind === 'array') {
    const item = `$item${depth || ''}`;
    const inner = fromArray(item, type.item, names, depth + 1);
    if (inner === item) return value;
    const mapped = type.itemNullable ? `${item} === null ? null : ${inner}` : inner;
    return `array_map(fn ($${item.slice(1)}) => ${mapped}, ${value})`;
  }
  return value;
}

function toArray(value: string, type: FieldType, depth = 0): string {
  if (type.kind === 'object') return `${value}->toArray()`;
  if (type.kind === 'array') {
    const item = `$item${depth || ''}`;
    const inner = toArray(item, type.item, depth + 1);
    if (inner === item) return value;
    const mapped = type.itemNullable ? `${item} === null ? null : ${inner}` : inner;
    return `array_map(fn ($${item.slice(1)}) => ${mapped}, ${value})`;
  }
  return value;
}

function writeClass(model: ClassModel, options: PhpOptions, classNames: Map<string, string>): string {
  const name = classNames.get(model.name)!;
  const props = makeUnique(model.fields.map((f) => noLeadingDigit(camelCase(f.key))));
  const lines = [`final class ${name}`, '{'];

  const docs = model.fields
    .map((field, i) => (field.type.kind === 'array' ? `     * @param ${docType(field.type, classNames)}${isOptional(field) ? '|null' : ''} $${props[i]}` : ''))
    .filter(Boolean);
  if (docs.length) lines.push('    /**', ...docs, '     */');

  const modifier = options.readonly ? 'public readonly' : 'public';
  if (model.fields.length) {
    lines.push('    public function __construct(');
    // Optional parameters go last; fromArray passes them by name, so the order does not matter there.
    const order = model.fields.map((field, i) => ({ field, i }));
    order.sort((a, b) => Number(isOptional(a.field)) - Number(isOptional(b.field)));
    order.forEach(({ field, i }) => {
      const type = typeName(field.type, classNames);
      const nullable = isOptional(field) && type !== 'mixed' ? '?' : '';
      const fallback = isOptional(field) ? ' = null' : '';
      lines.push(`        ${modifier} ${nullable}${type} $${props[i]}${fallback},`);
    });
    lines.push('    ) {', '    }');
  }
  if (options.methods) {
    lines.push('', '    public static function fromArray(array $data): self', '    {');
    lines.push(`        return new self(${model.fields.length ? '' : ');'}`);
    model.fields.forEach((field, i) => {
      const key = `$data[${phpString(field.key)}]`;
      const convert = fromArray(key, field.type, classNames);
      let value: string;
      if (!isOptional(field)) value = convert;
      else if (convert === key) value = `${key} ?? null`;
      else value = `isset(${key}) ? ${convert} : null`;
      lines.push(`            ${props[i]}: ${value},`);
    });
    if (model.fields.length) lines.push('        );');
    lines.push('    }', '', '    public function toArray(): array', '    {', '        return [');
    model.fields.forEach((field, i) => {
      const value = toArray(`$this->${props[i]}`, field.type);
      const guarded =
        isOptional(field) && value !== `$this->${props[i]}` ? `$this->${props[i]} === null ? null : ${value}` : value;
      lines.push(`            ${phpString(field.key)} => ${guarded},`);
    });
    lines.push('        ];', '    }');
  }
  lines.push('}');
  return lines.join('\n');
}

export function toPhp(model: CodeModel, options: PhpOptions = PHP_DEFAULTS): string {
  const names = phpClassNames(model);
  const parts = ['<?php\n\ndeclare(strict_types=1);'];
  if (model.root.kind === 'array') {
    parts.push(`// The JSON is a list: array_map(fn ($item) => ${names.get(model.classes[0].name)}::fromArray($item), $data)`);
  }
  parts.push(...model.classes.map((c) => writeClass(c, options, names)));
  return parts.join('\n\n') + '\n';
}
