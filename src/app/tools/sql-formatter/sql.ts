/** SQL formatting with sql-formatter, loaded only when first needed. */

export const DIALECTS = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'tsql', label: 'SQL Server (T-SQL)' },
  { value: 'plsql', label: 'Oracle PL/SQL' },
  { value: 'bigquery', label: 'Google BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'redshift', label: 'Amazon Redshift' },
  { value: 'spark', label: 'Spark SQL' },
  { value: 'trino', label: 'Trino / Presto' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'db2', label: 'IBM Db2' },
  { value: 'hive', label: 'Apache Hive' },
] as const;

export type Dialect = (typeof DIALECTS)[number]['value'];
export type KeywordCase = 'upper' | 'lower' | 'preserve';

export interface SqlOptions {
  dialect: Dialect;
  keywordCase: KeywordCase;
  /** Spaces, or 0 for tabs. */
  indent: number;
}

export type SqlResult = { ok: true; output: string } | { ok: false; error: string; line?: number; column?: number };

let lib: Promise<typeof import('sql-formatter')> | undefined;

export async function formatSql(sql: string, options: SqlOptions): Promise<SqlResult> {
  const { format } = await (lib ??= import('sql-formatter'));
  try {
    const output = format(sql, {
      language: options.dialect,
      keywordCase: options.keywordCase,
      dataTypeCase: options.keywordCase,
      functionCase: options.keywordCase,
      tabWidth: options.indent || 2,
      useTabs: options.indent === 0,
      linesBetweenQueries: 1,
    });
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const where = /line (\d+) column (\d+)/i.exec(message);
    // The library's message repeats the whole token stream; the first line says what is wrong.
    const first = message.split('\n')[0].replace(/^Parse error:\s*/i, '');
    return {
      ok: false,
      error: `${first}. Check the dialect: each database allows different syntax.`.replace(/\.\./g, '.'),
      line: where ? Number(where[1]) : undefined,
      column: where ? Number(where[2]) : undefined,
    };
  }
}

/** Collapses a query to one line, for logs and code strings. Comments are removed; quoted text is kept as it is. */
export function compactSql(sql: string): string {
  let out = '';
  let quote: string | null = null;
  const space = () => {
    if (out && !out.endsWith(' ') && !out.endsWith('(')) out += ' ';
  };
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      if (c === quote && sql[i + 1] === quote) out += sql[++i];
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      space();
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
      space();
    } else if (/\s/.test(c)) space();
    else {
      // No space before a comma, semicolon or closing bracket.
      if (/[,;)]/.test(c) && out.endsWith(' ')) out = out.slice(0, -1);
      out += c;
    }
  }
  return out.trim();
}
