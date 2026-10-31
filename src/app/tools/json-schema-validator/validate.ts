/** Validates JSON against a JSON Schema with Ajv (draft-07, 2019-09 and 2020-12), loaded only when needed. */
import { inferModel } from '../json-to-code/infer';
import { toJsonSchema } from '../json-to-code/generators/json-schema';

export interface SchemaError {
  /** JSON Pointer to the wrong value, "" for the whole document. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; errors: SchemaError[] }
  | { kind: 'bad-input'; error: string };

type AjvLike = { compile(schema: object): ((data: unknown) => boolean) & { errors?: AjvError[] | null } };
interface AjvError {
  instancePath: string;
  message?: string;
  keyword: string;
  params: Record<string, unknown>;
}

const cache = new Map<string, Promise<AjvLike>>();

async function ajvFor(draft: string): Promise<AjvLike> {
  const key = draft.includes('2020-12') ? '2020' : draft.includes('2019-09') ? '2019' : '07';
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const mod =
          key === '2020' ? await import('ajv/dist/2020') : key === '2019' ? await import('ajv/dist/2019') : await import('ajv');
        const formats = await import('ajv-formats');
        // Both packages are CommonJS: the class and function sit on the default export.
        const Ajv = ((mod as { default: unknown }).default ?? mod) as new (options: object) => AjvLike;
        const addFormats = ((formats as { default: unknown }).default ?? formats) as (ajv: AjvLike) => void;
        const ajv = new Ajv({ allErrors: true, strict: false });
        addFormats(ajv);
        return ajv;
      })(),
    );
  }
  return cache.get(key)!;
}

function parse(text: string, what: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `The ${what} is not valid JSON: ${(error as Error).message}` };
  }
}

/** Plain-English message for one Ajv error, e.g. "must be a number" or "is missing the required field email". */
function describe(e: AjvError): SchemaError {
  const p = e.params;
  let message = e.message ?? e.keyword;
  if (e.keyword === 'required') return { path: `${e.instancePath}/${p['missingProperty']}`, message: 'is required but missing' };
  if (e.keyword === 'additionalProperties') return { path: `${e.instancePath}/${p['additionalProperty']}`, message: 'is not allowed by the schema' };
  if (e.keyword === 'enum') message = `must be one of ${(p['allowedValues'] as unknown[]).map((v) => JSON.stringify(v)).join(', ')}`;
  if (e.keyword === 'type') message = `must be ${p['type']}`;
  return { path: e.instancePath, message };
}

export async function validateJson(schemaText: string, dataText: string): Promise<ValidationResult> {
  const schema = parse(schemaText, 'schema');
  if (!schema.ok) return { kind: 'bad-input', error: schema.error };
  const data = parse(dataText, 'JSON to check');
  if (!data.ok) return { kind: 'bad-input', error: data.error };
  if (!schema.value || typeof schema.value !== 'object') return { kind: 'bad-input', error: 'The schema must be a JSON object.' };
  const draft = String((schema.value as Record<string, unknown>)['$schema'] ?? '');
  let check: ReturnType<AjvLike['compile']>;
  try {
    check = (await ajvFor(draft)).compile(schema.value as object);
  } catch (error) {
    return { kind: 'bad-input', error: `The schema itself has a mistake: ${(error as Error).message}` };
  }
  if (check(data.value)) return { kind: 'valid' };
  // Ajv repeats the same complaint for each branch of anyOf/oneOf; keep each path and message once.
  const seen = new Set<string>();
  const errors = (check.errors ?? []).map(describe).filter((e) => !seen.has(e.path + e.message) && !!seen.add(e.path + e.message));
  return { kind: 'invalid', errors };
}

/** A starting schema for a JSON sample, made by the JSON to Code tool's generator. */
export function schemaFromSample(dataText: string): string | null {
  const model = inferModel(dataText, 'Root');
  return model.ok ? toJsonSchema(model.model) : null;
}
