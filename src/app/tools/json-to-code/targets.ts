import { CodeModel } from './infer';
import { JAVA_DEFAULTS, JavaOptions, toJava } from './generators/java';
import { KOTLIN_DEFAULTS, KotlinOptions, toKotlin } from './generators/kotlin';
import { TYPESCRIPT_DEFAULTS, TypeScriptOptions, toTypeScript } from './generators/typescript';

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
];

/** Targets grouped for the list, in order. */
export const TARGET_GROUPS = [...new Set(TARGETS.map((t) => t.group))].map((group) => ({
  group,
  targets: TARGETS.filter((t) => t.group === group),
}));

export const targetById = (id: string) => TARGETS.find((t) => t.id === id) ?? TARGETS[0];

/** Starting settings for a target. */
export const optionsFor = (target: Target): OptionValues => ({ ...target.language.defaults, ...target.preset });
