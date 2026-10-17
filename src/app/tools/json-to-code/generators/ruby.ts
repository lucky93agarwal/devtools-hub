import { ClassModel, CodeModel, Field, FieldType } from '../infer';
import { makeUnique, noLeadingDigit, quote, snakeCase } from '../names';

export interface RubyOptions {
  /** attr_accessor instead of attr_reader. */
  writable: boolean;
  /** from_hash and to_h methods. */
  methods: boolean;
}

export const RUBY_DEFAULTS: RubyOptions = { writable: false, methods: true };

const KEYWORDS = new Set(
  ('BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil ' +
    'not or redo rescue retry return self super then true undef unless until when while yield')
    .split(' '),
);

const isOptional = (field: Field) => field.nullable || field.optional;

/** Expression reading the JSON value `value` as `type`; `safe` uses &. because it may be nil. */
function fromHash(value: string, type: FieldType, safe: boolean, depth = 0): string {
  if (type.kind === 'object') return safe ? `${value} && ${type.className}.from_hash(${value})` : `${type.className}.from_hash(${value})`;
  if (type.kind === 'array') {
    const item = depth ? `item${depth + 1}` : 'item';
    const inner = fromHash(item, type.item, type.itemNullable, depth + 1);
    if (inner === item) return value;
    return `${value}${safe ? '&.' : '.'}map { |${item}| ${inner} }`;
  }
  return value;
}

function toHash(value: string, type: FieldType, safe: boolean, depth = 0): string {
  const call = safe ? '&.' : '.';
  if (type.kind === 'object') return `${value}${call}to_h`;
  if (type.kind === 'array') {
    const item = depth ? `item${depth + 1}` : 'item';
    const inner = toHash(item, type.item, type.itemNullable, depth + 1);
    if (inner === item) return value;
    return `${value}${call}map { |${item}| ${inner} }`;
  }
  return value;
}

function writeClass(model: ClassModel, options: RubyOptions): string {
  const names = makeUnique(model.fields.map((f) => noLeadingDigit(snakeCase(f.key), 'field_'))).map((name) =>
    KEYWORDS.has(name) ? name + '_' : name,
  );
  const lines = [`class ${model.name}`];
  if (!model.fields.length) {
    lines.push('  def self.from_hash(_hash)', '    new', '  end', '', '  def to_h', '    {}', '  end', 'end');
    return lines.join('\n');
  }
  lines.push(`  ${options.writable ? 'attr_accessor' : 'attr_reader'} ${names.map((n) => ':' + n).join(', ')}`, '');
  const params = model.fields.map((field, i) => `${names[i]}:${isOptional(field) ? ' nil' : ''}`);
  lines.push(`  def initialize(${params.join(', ')})`);
  names.forEach((name) => lines.push(`    @${name} = ${name}`));
  lines.push('  end');
  if (options.methods) {
    lines.push('', '  def self.from_hash(hash)', '    new(');
    model.fields.forEach((field, i) => {
      lines.push(`      ${names[i]}: ${fromHash(`hash[${quote(field.key)}]`, field.type, isOptional(field))},`);
    });
    lines.push('    )', '  end', '', '  def to_h', '    {');
    model.fields.forEach((field, i) => {
      lines.push(`      ${quote(field.key)} => ${toHash(`@${names[i]}`, field.type, isOptional(field))},`);
    });
    lines.push('    }', '  end');
  }
  lines.push('end');
  return lines.join('\n');
}

export function toRuby(model: CodeModel, options: RubyOptions = RUBY_DEFAULTS): string {
  const parts = ['# frozen_string_literal: true'];
  if (model.root.kind === 'array') {
    parts.push(`# The JSON is a list: data.map { |item| ${model.classes[0].name}.from_hash(item) }`);
  }
  parts.push(...model.classes.map((c) => writeClass(c, options)));
  return parts.join('\n\n') + '\n';
}
