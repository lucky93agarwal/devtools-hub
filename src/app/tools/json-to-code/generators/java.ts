import { ClassModel, CodeModel, FieldType } from '../infer';
import { camelCase, makeUnique, noLeadingDigit, pascalCase, quote } from '../names';

export type JavaLibrary = 'none' | 'jackson' | 'gson';
/** Private fields with getters and setters, public fields, or records (Java 16 and later). */
export type JavaStyle = 'getters' | 'fields' | 'record';

export interface JavaOptions {
  library: JavaLibrary;
  style: JavaStyle;
}

export const JAVA_DEFAULTS: JavaOptions = { library: 'none', style: 'getters' };

const KEYWORDS = new Set(
  ('abstract assert boolean break byte case catch char class const continue default do double else enum extends ' +
    'final finally float for goto if implements import instanceof int interface long native new package private ' +
    'protected public return short static strictfp super switch synchronized this throw throws transient try void ' +
    'volatile while true false null record var yield')
    .split(' '),
);

// Boxed types, because any JSON value may be missing or null.
const PRIMITIVES = { string: 'String', int: 'Integer', long: 'Long', double: 'Double', boolean: 'Boolean' };

function typeName(type: FieldType): string {
  switch (type.kind) {
    case 'primitive':
      return PRIMITIVES[type.name];
    case 'object':
      return type.className;
    case 'array':
      return `List<${typeName(type.item)}>`;
    case 'any':
      return 'Object';
  }
}

const usesList = (type: FieldType) => type.kind === 'array';

function annotation(library: JavaLibrary, key: string): string | null {
  // Written on every field: obfuscation in release builds renames fields.
  if (library === 'jackson') return `@JsonProperty(${quote(key)})`;
  if (library === 'gson') return `@SerializedName(${quote(key)})`;
  return null;
}

function indent(text: string, by: string): string {
  return text
    .split('\n')
    .map((line) => (line ? by + line : line))
    .join('\n');
}

function writeClass(model: ClassModel, options: JavaOptions, nested: string[], isRoot: boolean): string {
  const modifiers = isRoot ? 'public' : 'public static';
  const names = makeUnique(model.fields.map((f) => noLeadingDigit(camelCase(f.key))));
  const safe = names.map((name) => (KEYWORDS.has(name) ? name + '_' : name));
  const inner = nested.length ? '\n\n' + nested.map((c) => indent(c, '    ')).join('\n\n') : '';

  if (options.style === 'record') {
    const components = model.fields.map((field, i) => {
      const note = annotation(options.library, field.key);
      return `${note ? note + ' ' : ''}${typeName(field.type)} ${safe[i]}`;
    });
    // Nested records are static already.
    const body = inner ? ` {${inner}\n}` : ' {\n}';
    if (!components.length) return `public record ${model.name}()${body}`;
    return `public record ${model.name}(\n${components.map((c) => '    ' + c).join(',\n')}\n)${body}`;
  }

  const lines = [`${modifiers} class ${model.name} {`];
  const access = options.style === 'fields' ? 'public' : 'private';
  model.fields.forEach((field, i) => {
    const note = annotation(options.library, field.key);
    if (note) lines.push(`    ${note}`);
    lines.push(`    ${access} ${typeName(field.type)} ${safe[i]};`);
  });
  if (options.style === 'getters') {
    model.fields.forEach((field, i) => {
      const type = typeName(field.type);
      const accessor = pascalCase(names[i]);
      lines.push('');
      lines.push(`    public ${type} get${accessor}() {`, `        return ${safe[i]};`, '    }');
      lines.push('');
      lines.push(`    public void set${accessor}(${type} ${safe[i]}) {`, `        this.${safe[i]} = ${safe[i]};`, '    }');
    });
  }
  return lines.join('\n') + inner + '\n}';
}

/**
 * Java allows one public top-level class per file, so nested classes go inside the
 * root class as static classes (or nested records), and the result is one file.
 */
export function toJava(model: CodeModel, options: JavaOptions = JAVA_DEFAULTS): string {
  const [root, ...others] = model.classes;
  const nested = others.map((c) => writeClass(c, options, [], false));
  const imports: string[] = [];
  if (model.classes.some((c) => c.fields.some((f) => usesList(f.type))) || model.root.kind === 'array') {
    imports.push('java.util.List');
  }
  if (options.library === 'jackson') imports.push('com.fasterxml.jackson.annotation.JsonProperty');
  if (options.library === 'gson') imports.push('com.google.gson.annotations.SerializedName');

  const parts: string[] = [];
  if (imports.length) parts.push(imports.sort().map((name) => `import ${name};`).join('\n'));
  if (model.root.kind === 'array') parts.push(`// The JSON is a list. Read it as ${typeName(model.root)}.`);
  parts.push(writeClass(root, options, nested, true));
  return parts.join('\n\n') + '\n';
}
