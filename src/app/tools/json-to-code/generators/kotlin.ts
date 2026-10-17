import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit, quote } from '../names';

export type KotlinLibrary = 'none' | 'kotlinx' | 'gson' | 'moshi' | 'jackson';

export interface KotlinOptions {
  library: KotlinLibrary;
  /** var instead of val. */
  mutable: boolean;
  /** Make every property nullable, for APIs that may leave anything out. */
  allNullable: boolean;
  /** `= null` on nullable properties, so they can be left out when creating an object. */
  nullDefaults: boolean;
}

export const KOTLIN_DEFAULTS: KotlinOptions = { library: 'kotlinx', mutable: false, allNullable: false, nullDefaults: true };

/** Hard keywords, which need backticks as names. */
const KEYWORDS = new Set(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(
    ' ',
  ),
);

const PRIMITIVES = { string: 'String', int: 'Int', long: 'Long', double: 'Double', boolean: 'Boolean' };

function typeName(type: FieldType, library: KotlinLibrary): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `List<${typeName(type.item, library)}${type.itemNullable ? '?' : ''}>`;
    case 'any':
      // kotlinx.serialization cannot read Any; JsonElement holds any JSON value.
      return library === 'kotlinx' ? 'JsonElement' : 'Any';
  }
}

const usesAny = (type: FieldType): boolean => type.kind === 'any' || (type.kind === 'array' && usesAny(type.item));

/** Annotation that maps a property to its JSON key. */
function keyAnnotation(library: KotlinLibrary, key: string, renamed: boolean): string | null {
  switch (library) {
    case 'kotlinx':
      return renamed ? `@SerialName(${quote(key)})` : null;
    case 'moshi':
      return renamed ? `@Json(name = ${quote(key)})` : null;
    // Always written for Gson and Jackson: R8 and ProGuard rename properties in release builds.
    case 'gson':
      return `@SerializedName(${quote(key)})`;
    case 'jackson':
      return `@JsonProperty(${quote(key)})`;
    case 'none':
      return null;
  }
}

const IMPORTS: Record<KotlinLibrary, string[]> = {
  none: [],
  kotlinx: ['kotlinx.serialization.SerialName', 'kotlinx.serialization.Serializable'],
  gson: ['com.google.gson.annotations.SerializedName'],
  moshi: ['com.squareup.moshi.Json', 'com.squareup.moshi.JsonClass'],
  jackson: ['com.fasterxml.jackson.annotation.JsonProperty'],
};

const CLASS_ANNOTATION: Record<KotlinLibrary, string | null> = {
  none: null,
  kotlinx: '@Serializable',
  gson: null,
  moshi: '@JsonClass(generateAdapter = true)',
  jackson: null,
};

function writeClass(model: ClassModel, options: KotlinOptions): string {
  const head = CLASS_ANNOTATION[options.library];
  const lines = head ? [head] : [];
  // A data class needs at least one property.
  if (!model.fields.length) return [...lines, `class ${model.name}`].join('\n');

  const names = makeUnique(model.fields.map((f) => noLeadingDigit(camelCase(f.key))));
  lines.push(`data class ${model.name}(`);
  model.fields.forEach((field, i) => {
    const name = KEYWORDS.has(names[i]) ? `\`${names[i]}\`` : names[i];
    const nullable = options.allNullable || field.nullable || field.optional;
    const annotation = keyAnnotation(options.library, field.key, names[i] !== field.key);
    const type = typeName(field.type, options.library) + (nullable ? '?' : '');
    const value = nullable && options.nullDefaults ? ' = null' : '';
    lines.push(`    ${annotation ? annotation + ' ' : ''}${options.mutable ? 'var' : 'val'} ${name}: ${type}${value},`);
  });
  lines.push(')');
  return lines.join('\n');
}

export function toKotlin(model: CodeModel, options: KotlinOptions = KOTLIN_DEFAULTS): string {
  const imports = [...IMPORTS[options.library]];
  const fields = model.classes.flatMap((c) => c.fields);
  if (options.library === 'kotlinx' && fields.some((f) => usesAny(f.type))) {
    imports.push('kotlinx.serialization.json.JsonElement');
  }
  const parts: string[] = [];
  if (imports.length) parts.push(imports.sort().map((name) => `import ${name}`).join('\n'));
  if (model.root.kind === 'array') {
    parts.push(`// The JSON is a list. Read it as ${typeName(model.root, options.library)}.`);
  }
  parts.push(...model.classes.map((c) => writeClass(c, options)));
  return parts.join('\n\n') + '\n';
}
