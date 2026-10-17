import { ClassModel, CodeModel, FieldType } from '../infer';
import { makeUnique, noLeadingDigit, quote, snakeCase } from '../names';

export interface RustOptions {
  /** Extra derives besides Serialize and Deserialize. */
  derives: 'debug-clone' | 'debug-clone-partialeq' | 'none';
  /** pub on structs and fields. */
  public: boolean;
}

export const RUST_DEFAULTS: RustOptions = { derives: 'debug-clone', public: true };

const KEYWORDS = new Set(
  ('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut ' +
    'pub ref return self Self static struct super trait true type unsafe use where while abstract become box do final ' +
    'macro override priv try typeof unsized virtual yield')
    .split(' '),
);

const PRIMITIVES = { string: 'String', int: 'i32', long: 'i64', double: 'f64', boolean: 'bool' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array': {
      const item = typeName(type.item);
      return `Vec<${type.itemNullable && type.item.kind !== 'any' ? `Option<${item}>` : item}>`;
    }
    case 'any':
      return 'serde_json::Value';
  }
}

const DERIVES = {
  'debug-clone': 'Debug, Clone, Serialize, Deserialize',
  'debug-clone-partialeq': 'Debug, Clone, PartialEq, Serialize, Deserialize',
  none: 'Serialize, Deserialize',
};

function writeStruct(model: ClassModel, options: RustOptions): string {
  const pub = options.public ? 'pub ' : '';
  const names = makeUnique(model.fields.map((f) => noLeadingDigit(snakeCase(f.key), 'f_')));
  const lines = [`#[derive(${DERIVES[options.derives]})]`, `${pub}struct ${model.name} {`];
  model.fields.forEach((field, i) => {
    if (names[i] !== field.key) lines.push(`    #[serde(rename = ${quote(field.key)})]`);
    // Option fields may be missing from the JSON; serde fills in None.
    const optional = field.nullable || field.optional;
    const type = optional ? `Option<${typeName(field.type)}>` : typeName(field.type);
    const name = KEYWORDS.has(names[i]) ? `r#${names[i]}` : names[i];
    lines.push(`    ${pub}${name}: ${type},`);
  });
  lines.push('}');
  return lines.join('\n');
}

export function toRust(model: CodeModel, options: RustOptions = RUST_DEFAULTS): string {
  const parts = ['use serde::{Deserialize, Serialize};'];
  if (model.root.kind === 'array') parts.push(`// The JSON is a list. Read it as ${typeName(model.root)}.`);
  parts.push(...model.classes.map((c) => writeStruct(c, options)));
  return parts.join('\n\n') + '\n';
}
