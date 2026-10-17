import { CodeModel, Field, FieldType } from '../infer';
import { quote } from '../names';

export interface TypeScriptOptions {
  /** `interface Root { … }` or `type Root = { … }`. */
  declaration: 'interface' | 'type';
  /** Mark keys missing from some objects with `?`. */
  optionalKeys: boolean;
  readonly: boolean;
  exported: boolean;
}

export const TYPESCRIPT_DEFAULTS: TypeScriptOptions = {
  declaration: 'interface',
  optionalKeys: true,
  readonly: false,
  exported: true,
};

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      // TypeScript has one number type; integers above 2^53 lose digits in JSON.parse.
      return type.name === 'string' ? 'string' : type.name === 'boolean' ? 'boolean' : 'number';
    case 'object':
      return type.className;
    case 'array': {
      const item = typeName(type.item) + (type.itemNullable ? ' | null' : '');
      return type.itemNullable ? `(${item})[]` : `${item}[]`;
    }
    case 'any':
      return 'unknown';
  }
}

/** Keys stay exactly as in the JSON; ones that are not plain identifiers are quoted. */
const propertyName = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key));

function property(field: Field, options: TypeScriptOptions): string {
  const optional = options.optionalKeys && field.optional ? '?' : '';
  // unknown already includes null.
  const type = typeName(field.type) + (field.nullable && field.type.kind !== 'any' ? ' | null' : '');
  return `  ${options.readonly ? 'readonly ' : ''}${propertyName(field.key)}${optional}: ${type};`;
}

export function toTypeScript(model: CodeModel, options: TypeScriptOptions = TYPESCRIPT_DEFAULTS): string {
  const exported = options.exported ? 'export ' : '';
  const parts = model.classes.map((c) => {
    const body = c.fields.length ? `{\n${c.fields.map((f) => property(f, options)).join('\n')}\n}` : '{}';
    return options.declaration === 'interface'
      ? `${exported}interface ${c.name} ${body}`
      : `${exported}type ${c.name} = ${body};`;
  });
  if (model.root.kind === 'array') {
    parts.unshift(`${exported}type ${model.classes[0].name}List = ${typeName(model.root)};`);
  }
  return parts.join('\n\n') + '\n';
}
