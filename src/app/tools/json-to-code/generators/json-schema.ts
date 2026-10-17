import { CodeModel, FieldType } from '../infer';

export interface JsonSchemaOptions {
  draft: '2020-12' | '07';
  /** additionalProperties: false, so unknown keys fail validation. */
  strict: boolean;
}

export const JSON_SCHEMA_DEFAULTS: JsonSchemaOptions = { draft: '2020-12', strict: false };

type Schema = Record<string, unknown>;

export function toJsonSchema(model: CodeModel, options: JsonSchemaOptions = JSON_SCHEMA_DEFAULTS): string {
  // Draft 2019-09 renamed "definitions" to "$defs".
  const defs = options.draft === '2020-12' ? '$defs' : 'definitions';
  const ref = (name: string): Schema => ({ $ref: `#/${defs}/${name}` });

  const schemaFor = (type: FieldType): Schema => {
    switch (type.kind) {
      case 'primitive':
        return {
          type: { string: 'string', int: 'integer', long: 'integer', double: 'number', boolean: 'boolean' }[type.name],
        };
      case 'object':
        return ref(type.className);
      case 'array': {
        const items = schemaFor(type.item);
        return { type: 'array', items: type.itemNullable ? nullable(items) : items };
      }
      case 'any':
        // Any value is valid.
        return {};
    }
  };

  const definitions: Record<string, Schema> = {};
  for (const model_ of model.classes) {
    const properties: Record<string, Schema> = {};
    for (const field of model_.fields) {
      const schema = schemaFor(field.type);
      properties[field.key] = field.nullable ? nullable(schema) : schema;
    }
    const definition: Schema = { type: 'object', properties };
    const required = model_.fields.filter((f) => !f.optional).map((f) => f.key);
    if (required.length) definition['required'] = required;
    if (options.strict) definition['additionalProperties'] = false;
    definitions[model_.name] = definition;
  }

  const [root, ...others] = model.classes;
  const schema: Schema = {
    $schema:
      options.draft === '2020-12' ? 'https://json-schema.org/draft/2020-12/schema' : 'http://json-schema.org/draft-07/schema#',
    title: root.name,
  };
  if (model.root.kind === 'array') {
    // The document is a list; every class goes into the definitions.
    Object.assign(schema, schemaFor(model.root), { [defs]: definitions });
  } else {
    Object.assign(schema, definitions[root.name]);
    if (others.length) schema[defs] = Object.fromEntries(others.map((c) => [c.name, definitions[c.name]]));
  }
  return JSON.stringify(schema, null, 2) + '\n';
}

/** Allows null as well. */
function nullable(schema: Schema): Schema {
  if (!Object.keys(schema).length) return schema; // already allows anything
  if (typeof schema['type'] === 'string' && Object.keys(schema).length === 1) return { type: [schema['type'], 'null'] };
  return { anyOf: [schema, { type: 'null' }] };
}
