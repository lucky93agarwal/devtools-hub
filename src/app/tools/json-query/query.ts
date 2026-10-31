/** JSONPath (jsonpath-plus) and jq (jq-wasm, jq 1.8) queries on JSON, both loaded only when used. */

export type QueryLanguage = 'jsonpath' | 'jq';

export type QueryResult = { ok: true; output: string; count: number | null } | { ok: false; error: string };

export interface JqOptions {
  /** One line per result (-c). */
  compact: boolean;
  /** Strings without quotes (-r). */
  raw: boolean;
}

/** Where the jq WebAssembly file is copied by the build (see angular.json). */
const JQ_WASM_URL = '/jq/jq.wasm';

let jsonPathLib: Promise<typeof import('jsonpath-plus')> | undefined;
let jqLib: Promise<import('jq-wasm').Jq> | undefined;

export async function runJsonPath(json: unknown, path: string): Promise<QueryResult> {
  const { JSONPath } = await (jsonPathLib ??= import('jsonpath-plus'));
  try {
    // The 'safe' evaluator runs filters such as ?(@.price < 10) without JavaScript eval.
    const results = JSONPath({ path, json: json as object, wrap: true, eval: 'safe' }) as unknown[];
    return { ok: true, output: JSON.stringify(results, null, 2), count: results.length };
  } catch (error) {
    return { ok: false, error: `This JSONPath cannot be read: ${(error as Error).message}` };
  }
}

/** For tests, which load jq from the file system rather than from the site. */
export function setJqLoader(load: () => Promise<import('jq-wasm').Jq>): void {
  jqLib = load();
}

export async function runJq(jsonText: string, query: string, options: JqOptions): Promise<QueryResult> {
  const jq = await (jqLib ??= import('jq-wasm').then((m) => m.loadJq({ wasmURL: JQ_WASM_URL })));
  const flags = [options.compact ? '-c' : '', options.raw ? '-r' : ''].filter(Boolean);
  const result = jq.raw(jsonText, query, flags);
  if (result.exitCode !== 0) {
    const message = result.stderr.replace(/^jq: error(?: \(at <[^>]+>\))?: /gm, '').replace(/\njq: \d+ compile errors?$/, '').trim();
    return { ok: false, error: message || `jq stopped with exit code ${result.exitCode}.` };
  }
  return { ok: true, output: result.stdout, count: null };
}

export const EXAMPLES: Record<QueryLanguage, { query: string; meaning: string }[]> = {
  jsonpath: [
    { query: '$.store.book[*].title', meaning: 'Every book title' },
    { query: '$..author', meaning: 'Every author, at any depth' },
    { query: '$.store.book[?(@.price < 10)]', meaning: 'Books cheaper than 10' },
    { query: '$.store.book[-1:]', meaning: 'The last book' },
    { query: '$.store.book[0,1].title', meaning: 'Titles of the first two books' },
    { query: '$..book[?(@.isbn)].title', meaning: 'Titles of books with an ISBN' },
    { query: '$.store.*', meaning: 'Everything in the store' },
  ],
  jq: [
    { query: '.store.book[].title', meaning: 'Every book title' },
    { query: '[.store.book[] | select(.price < 10)]', meaning: 'Books cheaper than 10' },
    { query: '.store.book | map({title, price})', meaning: 'Only title and price' },
    { query: '.store.book | sort_by(.price) | reverse | .[0].title', meaning: 'Title of the most expensive book' },
    { query: '[.store.book[].price] | add', meaning: 'Total of all prices' },
    { query: '.store.book | group_by(.category) | map({(.[0].category): length}) | add', meaning: 'Books per category' },
    { query: '.. | .author? // empty', meaning: 'Every author, at any depth' },
    { query: 'paths(scalars) | map(tostring) | join(".")', meaning: 'Every path to a value' },
  ],
};

export const SAMPLE_JSON = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99 },
      { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}
`;
