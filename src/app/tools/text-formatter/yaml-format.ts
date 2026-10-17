import { YAMLError, parseAllDocuments } from 'yaml';

export interface YamlIssue {
  line: number;
  column: number;
  message: string;
}

export type YamlResult =
  | { ok: true; output: string; documents: number; warnings: YamlIssue[] }
  | { ok: false; error: YamlIssue };

const toIssue = (problem: YAMLError): YamlIssue => {
  const position = problem.linePos?.[0] ?? { line: 1, col: 1 };
  // The library adds the position and a copy of the line; the first sentence is enough here.
  const message = problem.message.split(/ at line \d+/)[0].replace(/\.?$/, '.');
  return { line: position.line, column: position.col, message };
};

/**
 * Checks YAML (every document in a file separated by ---) and prints it again
 * with consistent indentation. Comments are kept. Duplicate keys are against the
 * YAML spec but most tools silently keep the last one, so they are warnings.
 */
export function formatYaml(text: string, indent: number): YamlResult {
  const parsed = parseAllDocuments(text);
  // An empty file gives an empty list rather than documents.
  const documents = Array.isArray(parsed) ? parsed : [];
  const warnings: YamlIssue[] = [];
  for (const document of documents) {
    for (const error of document.errors) {
      if (error.code !== 'DUPLICATE_KEY') return { ok: false, error: toIssue(error) };
      warnings.push(toIssue(error));
    }
    // A document with errors cannot be printed; duplicate keys are only warnings here.
    document.errors = [];
    warnings.push(...document.warnings.map(toIssue));
  }
  const output = documents
    .map((document) => document.toString({ indent, lineWidth: 0 }))
    .join('')
    .replace(/\n*$/, '\n');
  return { ok: true, output, documents: documents.length, warnings };
}
