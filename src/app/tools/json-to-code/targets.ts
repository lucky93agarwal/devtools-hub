import { CodeModel } from './infer';
import { JAVA_DEFAULTS, JavaOptions, toJava } from './generators/java';
import { KOTLIN_DEFAULTS, KotlinOptions, toKotlin } from './generators/kotlin';
import { TYPESCRIPT_DEFAULTS, TypeScriptOptions, toTypeScript } from './generators/typescript';
import { DART_DEFAULTS, DartOptions, toDart } from './generators/dart';
import { SWIFT_DEFAULTS, SwiftOptions, toSwift } from './generators/swift';
import { CSHARP_DEFAULTS, CSharpOptions, toCSharp } from './generators/csharp';
import { GO_DEFAULTS, GoOptions, toGo } from './generators/go';
import { RUST_DEFAULTS, RustOptions, toRust } from './generators/rust';
import {
  PYDANTIC_DEFAULTS,
  PYTHON_DEFAULTS,
  PydanticOptions,
  PythonOptions,
  toPydantic,
  toPython,
} from './generators/python';
import { PHP_DEFAULTS, PhpOptions, toPhp } from './generators/php';
import { RUBY_DEFAULTS, RubyOptions, toRuby } from './generators/ruby';
import { JSON_SCHEMA_DEFAULTS, JsonSchemaOptions, toJsonSchema } from './generators/json-schema';
import { PROTOBUF_DEFAULTS, ProtobufOptions, toProtobuf } from './generators/protobuf';
import { GRAPHQL_DEFAULTS, GraphQLOptions, toGraphQL } from './generators/graphql';
import { SQL_DEFAULTS, SqlOptions, toSql } from './generators/sql';

/**
 * Every output the page offers. A language has settings; a target is one entry in
 * the "Convert to" list, often a language with some settings already chosen
 * (for example "Gson model" is Java with Gson annotations). New languages only
 * need an entry here and a generator.
 */

export type OptionValues = Record<string, string | boolean>;

export interface LanguageSetting {
  id: string;
  label: string;
  /** A list of choices, or a checkbox when missing. */
  choices?: { value: string; label: string }[];
}

export interface Language {
  id: string;
  /** Monaco language id, for colours. */
  monaco: string;
  extension: string;
  defaults: OptionValues;
  settings: LanguageSetting[];
  generate(model: CodeModel, options: OptionValues): string;
}

export interface Target {
  id: string;
  label: string;
  group: string;
  language: Language;
  /** Settings this entry starts with, on top of the language defaults. */
  preset?: OptionValues;
}

const KOTLIN: Language = {
  id: 'kotlin',
  monaco: 'kotlin',
  extension: 'kt',
  defaults: { ...KOTLIN_DEFAULTS },
  settings: [
    {
      id: 'library',
      label: 'Library',
      choices: [
        { value: 'none', label: 'None' },
        { value: 'kotlinx', label: 'kotlinx.serialization' },
        { value: 'gson', label: 'Gson' },
        { value: 'moshi', label: 'Moshi' },
        { value: 'jackson', label: 'Jackson' },
      ],
    },
    { id: 'mutable', label: 'Use var instead of val' },
    { id: 'allNullable', label: 'Make every property nullable' },
    { id: 'nullDefaults', label: 'Default nullable properties to null' },
  ],
  generate: (model, options) => toKotlin(model, options as unknown as KotlinOptions),
};

const JAVA: Language = {
  id: 'java',
  monaco: 'java',
  extension: 'java',
  defaults: { ...JAVA_DEFAULTS },
  settings: [
    {
      id: 'library',
      label: 'Library',
      choices: [
        { value: 'none', label: 'None' },
        { value: 'jackson', label: 'Jackson' },
        { value: 'gson', label: 'Gson' },
      ],
    },
    {
      id: 'style',
      label: 'Style',
      choices: [
        { value: 'getters', label: 'Getters and setters' },
        { value: 'fields', label: 'Public fields' },
        { value: 'record', label: 'Records (Java 16+)' },
      ],
    },
  ],
  generate: (model, options) => toJava(model, options as unknown as JavaOptions),
};

const TYPESCRIPT: Language = {
  id: 'typescript',
  monaco: 'typescript',
  extension: 'ts',
  defaults: { ...TYPESCRIPT_DEFAULTS },
  settings: [
    {
      id: 'declaration',
      label: 'Declare as',
      choices: [
        { value: 'interface', label: 'interface' },
        { value: 'type', label: 'type' },
      ],
    },
    { id: 'optionalKeys', label: 'Mark keys missing from some objects with ?' },
    { id: 'readonly', label: 'Make properties readonly' },
    { id: 'exported', label: 'Export the types' },
  ],
  generate: (model, options) => toTypeScript(model, options as unknown as TypeScriptOptions),
};

const DART: Language = {
  id: 'dart',
  monaco: 'dart',
  extension: 'dart',
  defaults: { ...DART_DEFAULTS },
  settings: [
    {
      id: 'style',
      label: 'Style',
      choices: [
        { value: 'plain', label: 'fromJson and toJson' },
        { value: 'json_serializable', label: 'json_serializable' },
      ],
    },
    { id: 'finalFields', label: 'final fields' },
  ],
  generate: (model, options) => toDart(model, options as unknown as DartOptions),
};

const SWIFT: Language = {
  id: 'swift',
  monaco: 'swift',
  extension: 'swift',
  defaults: { ...SWIFT_DEFAULTS },
  settings: [
    {
      id: 'declaration',
      label: 'Declare as',
      choices: [
        { value: 'struct', label: 'struct' },
        { value: 'class', label: 'class' },
      ],
    },
    {
      id: 'protocol',
      label: 'Protocol',
      choices: [
        { value: 'Codable', label: 'Codable' },
        { value: 'Decodable', label: 'Decodable' },
      ],
    },
    { id: 'mutable', label: 'Use var instead of let' },
  ],
  generate: (model, options) => toSwift(model, options as unknown as SwiftOptions),
};

const CSHARP: Language = {
  id: 'csharp',
  monaco: 'csharp',
  extension: 'cs',
  defaults: { ...CSHARP_DEFAULTS },
  settings: [
    {
      id: 'library',
      label: 'Library',
      choices: [
        { value: 'system-text-json', label: 'System.Text.Json' },
        { value: 'newtonsoft', label: 'Newtonsoft.Json' },
        { value: 'none', label: 'None' },
      ],
    },
    {
      id: 'declaration',
      label: 'Declare as',
      choices: [
        { value: 'class', label: 'class' },
        { value: 'record', label: 'record' },
      ],
    },
    { id: 'nullableReferences', label: 'Nullable reference types' },
  ],
  generate: (model, options) => toCSharp(model, options as unknown as CSharpOptions),
};

const GO: Language = {
  id: 'go',
  monaco: 'go',
  extension: 'go',
  defaults: { ...GO_DEFAULTS },
  settings: [
    { id: 'pointers', label: 'Pointers for values that may be missing' },
    { id: 'omitEmpty', label: 'omitempty on optional fields' },
  ],
  generate: (model, options) => toGo(model, options as unknown as GoOptions),
};

const RUST: Language = {
  id: 'rust',
  monaco: 'rust',
  extension: 'rs',
  defaults: { ...RUST_DEFAULTS },
  settings: [
    {
      id: 'derives',
      label: 'Derive',
      choices: [
        { value: 'debug-clone', label: 'Debug, Clone' },
        { value: 'debug-clone-partialeq', label: 'Debug, Clone, PartialEq' },
        { value: 'none', label: 'Serde only' },
      ],
    },
    { id: 'public', label: 'Public structs and fields' },
  ],
  generate: (model, options) => toRust(model, options as unknown as RustOptions),
};

const PYTHON: Language = {
  id: 'python',
  monaco: 'python',
  extension: 'py',
  defaults: { ...PYTHON_DEFAULTS },
  settings: [
    { id: 'methods', label: 'from_dict and to_dict methods' },
    { id: 'frozen', label: 'Frozen (cannot be changed)' },
  ],
  generate: (model, options) => toPython(model, options as unknown as PythonOptions),
};

const PYDANTIC: Language = {
  id: 'pydantic',
  monaco: 'python',
  extension: 'py',
  defaults: { ...PYDANTIC_DEFAULTS },
  settings: [{ id: 'frozen', label: 'Frozen (cannot be changed)' }],
  generate: (model, options) => toPydantic(model, options as unknown as PydanticOptions),
};

const PHP: Language = {
  id: 'php',
  monaco: 'php',
  extension: 'php',
  defaults: { ...PHP_DEFAULTS },
  settings: [
    { id: 'readonly', label: 'readonly properties (PHP 8.1+)' },
    { id: 'methods', label: 'fromArray and toArray methods' },
  ],
  generate: (model, options) => toPhp(model, options as unknown as PhpOptions),
};

const RUBY: Language = {
  id: 'ruby',
  monaco: 'ruby',
  extension: 'rb',
  defaults: { ...RUBY_DEFAULTS },
  settings: [
    { id: 'writable', label: 'attr_accessor instead of attr_reader' },
    { id: 'methods', label: 'from_hash and to_h methods' },
  ],
  generate: (model, options) => toRuby(model, options as unknown as RubyOptions),
};

const JSON_SCHEMA: Language = {
  id: 'json-schema',
  monaco: 'json',
  extension: 'schema.json',
  defaults: { ...JSON_SCHEMA_DEFAULTS },
  settings: [
    {
      id: 'draft',
      label: 'Draft',
      choices: [
        { value: '2020-12', label: '2020-12' },
        { value: '07', label: 'Draft 7' },
      ],
    },
    { id: 'strict', label: 'Reject unknown keys (additionalProperties: false)' },
  ],
  generate: (model, options) => toJsonSchema(model, options as unknown as JsonSchemaOptions),
};

const PROTOBUF: Language = {
  id: 'protobuf',
  monaco: 'protobuf',
  extension: 'proto',
  defaults: { ...PROTOBUF_DEFAULTS },
  settings: [{ id: 'jsonNames', label: 'Keep JSON key names (json_name)' }],
  generate: (model, options) => toProtobuf(model, options as unknown as ProtobufOptions),
};

const GRAPHQL: Language = {
  id: 'graphql',
  monaco: 'graphql',
  extension: 'graphql',
  defaults: { ...GRAPHQL_DEFAULTS },
  settings: [
    {
      id: 'kind',
      label: 'Declare as',
      choices: [
        { value: 'type', label: 'type' },
        { value: 'input', label: 'input' },
      ],
    },
    { id: 'nonNull', label: 'Non-null (!) for values that are always there' },
  ],
  generate: (model, options) => toGraphQL(model, options as unknown as GraphQLOptions),
};

const SQL: Language = {
  id: 'sql',
  monaco: 'sql',
  extension: 'sql',
  defaults: { ...SQL_DEFAULTS },
  settings: [
    {
      id: 'dialect',
      label: 'Database',
      choices: [
        { value: 'postgres', label: 'PostgreSQL' },
        { value: 'mysql', label: 'MySQL' },
        { value: 'sqlite', label: 'SQLite' },
      ],
    },
  ],
  generate: (model, options) => toSql(model, options as unknown as SqlOptions),
};

export const TARGETS: Target[] = [
  { id: 'kotlin', label: 'Kotlin data class', group: 'Kotlin', language: KOTLIN, preset: { library: 'none' } },
  { id: 'kotlin-serialization', label: 'Kotlin Serialization', group: 'Kotlin', language: KOTLIN, preset: { library: 'kotlinx' } },
  { id: 'moshi', label: 'Moshi model (Kotlin)', group: 'Kotlin', language: KOTLIN, preset: { library: 'moshi' } },
  { id: 'java', label: 'Java POJO', group: 'Java', language: JAVA },
  { id: 'gson', label: 'Gson model (Java)', group: 'Java', language: JAVA, preset: { library: 'gson' } },
  { id: 'jackson', label: 'Jackson model (Java)', group: 'Java', language: JAVA, preset: { library: 'jackson' } },
  { id: 'typescript-interface', label: 'TypeScript interface', group: 'TypeScript', language: TYPESCRIPT },
  {
    id: 'typescript-type',
    label: 'TypeScript type',
    group: 'TypeScript',
    language: TYPESCRIPT,
    preset: { declaration: 'type' },
  },
  { id: 'dart', label: 'Dart model class', group: 'Dart and Swift', language: DART },
  { id: 'swift', label: 'Swift Codable model', group: 'Dart and Swift', language: SWIFT },
  { id: 'csharp', label: 'C# class', group: 'C#', language: CSHARP },
  { id: 'python', label: 'Python dataclass', group: 'Python', language: PYTHON },
  { id: 'pydantic', label: 'Pydantic model', group: 'Python', language: PYDANTIC },
  { id: 'go', label: 'Go struct', group: 'Go and Rust', language: GO },
  { id: 'rust', label: 'Rust struct (serde)', group: 'Go and Rust', language: RUST },
  { id: 'php', label: 'PHP class', group: 'PHP and Ruby', language: PHP },
  { id: 'ruby', label: 'Ruby class', group: 'PHP and Ruby', language: RUBY },
  { id: 'json-schema', label: 'JSON Schema', group: 'Schemas and databases', language: JSON_SCHEMA },
  { id: 'protobuf', label: 'Protocol Buffers', group: 'Schemas and databases', language: PROTOBUF },
  { id: 'graphql', label: 'GraphQL types', group: 'Schemas and databases', language: GRAPHQL },
  { id: 'sql', label: 'SQL tables', group: 'Schemas and databases', language: SQL },
];

/** Targets grouped for the list, in order. */
export const TARGET_GROUPS = [...new Set(TARGETS.map((t) => t.group))].map((group) => ({
  group,
  targets: TARGETS.filter((t) => t.group === group),
}));

export const targetById = (id: string) => TARGETS.find((t) => t.id === id) ?? TARGETS[0];

/** Starting settings for a target. */
export const optionsFor = (target: Target): OptionValues => ({ ...target.language.defaults, ...target.preset });
