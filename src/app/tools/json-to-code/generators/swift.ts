import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit, quote } from '../names';

export interface SwiftOptions {
  declaration: 'struct' | 'class';
  /** var instead of let. */
  mutable: boolean;
  protocol: 'Codable' | 'Decodable';
}

export const SWIFT_DEFAULTS: SwiftOptions = { declaration: 'struct', mutable: false, protocol: 'Codable' };

const KEYWORDS = new Set(
  ('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private ' +
    'protocol public rethrows static struct subscript typealias var break case continue default defer do else ' +
    'fallthrough for guard if in repeat return switch where while as Any catch false is nil super self Self throw ' +
    'throws true try')
    .split(' '),
);

// Swift's Int is 64-bit on every current Apple device, so it also holds JSON "long" numbers.
const PRIMITIVES = { string: 'String', int: 'Int', long: 'Int', double: 'Double', boolean: 'Bool' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `[${typeName(type.item)}${type.itemNullable ? '?' : ''}]`;
    case 'any':
      return 'JSONValue';
  }
}

const usesAny = (type: FieldType): boolean => type.kind === 'any' || (type.kind === 'array' && usesAny(type.item));

/** Codable has no type for "any JSON value", so one is added when needed. */
const JSON_VALUE = `/// Any JSON value, for fields whose type changes between objects.
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}`;

const escape = (name: string) => (KEYWORDS.has(name) ? `\`${name}\`` : name);

function writeType(model: ClassModel, options: SwiftOptions): string {
  const names = makeUnique(model.fields.map((f) => noLeadingDigit(camelCase(f.key))));
  // A class needs `final` so the compiler can make its Codable code.
  const head = options.declaration === 'class' ? 'final class' : 'struct';
  const lines = [`${head} ${model.name}: ${options.protocol} {`];
  model.fields.forEach((field, i) => {
    const optional = field.nullable || field.optional ? '?' : '';
    lines.push(`    ${options.mutable ? 'var' : 'let'} ${escape(names[i])}: ${typeName(field.type)}${optional}`);
  });
  if (model.fields.some((f, i) => f.key !== names[i])) {
    lines.push('', '    enum CodingKeys: String, CodingKey {');
    model.fields.forEach((field, i) => {
      lines.push(`        case ${escape(names[i])}${field.key === names[i] ? '' : ` = ${quote(field.key)}`}`);
    });
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

export function toSwift(model: CodeModel, options: SwiftOptions = SWIFT_DEFAULTS): string {
  const parts = ['import Foundation'];
  if (model.root.kind === 'array') {
    parts.push(`// The JSON is a list. Decode it as ${typeName(model.root)}.self.`);
  }
  parts.push(...model.classes.map((c) => writeType(c, options)));
  if (model.classes.some((c) => c.fields.some((f) => usesAny(f.type)))) parts.push(JSON_VALUE);
  return parts.join('\n\n') + '\n';
}
