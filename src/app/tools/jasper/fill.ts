/**
 * Fills a JRXML model with records and lays out pages, like JasperReports does for the common case:
 * title on the first page, page/column header on every page, one detail band per record, column
 * footer and page footer on every page, summary at the end, totals in variables.
 */
import { display, evaluate, type Scope, type Value } from './expression';
import type { JrBand, JrElement, JrReport } from './jrxml';

export type DataRecord = Record<string, unknown>;

export interface Item {
  kind: JrElement['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  align: JrElement['align'];
  color: string;
  background: string | null;
  /** Expression that could not be evaluated, shown to the user. */
  failed?: string;
}

export interface FilledPage {
  items: Item[];
}

export interface FillResult {
  pages: FilledPage[];
  warnings: string[];
}

/** Reads a dotted path like "customer.name" or "items[0].price". */
function pick(record: DataRecord, path: string): unknown {
  if (path in record) return record[path];
  let value: unknown = record;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export async function parseData(text: string, format: 'json' | 'csv' | 'xml'): Promise<DataRecord[]> {
  if (!text.trim()) return [];
  if (format === 'json') {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) return value.filter((v) => v && typeof v === 'object') as DataRecord[];
    if (value && typeof value === 'object') {
      const array = Object.values(value).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
      return (array as DataRecord[]) ?? [value as DataRecord];
    }
    throw new Error('The JSON must be an array of records (or an object holding one).');
  }
  if (format === 'csv') {
    const Papa = (await import('papaparse')).default;
    const result = Papa.parse<DataRecord>(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
    if (result.errors.length && !result.data.length) throw new Error(result.errors[0].message);
    return result.data;
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error('The XML data is not valid.');
  const root = doc.documentElement;
  // Records are the repeated child elements of the root (e.g. <orders><order>…</order>…</orders>).
  return [...root.children].map((el) => {
    const record: DataRecord = {};
    for (const attr of [...el.attributes]) record[attr.name] = attr.value;
    for (const c of [...el.children]) record[c.localName] = c.children.length ? c.innerHTML : (c.textContent ?? '');
    return record;
  });
}

function convert(value: unknown, className: string): unknown {
  if (value === null || value === undefined || value === '') return value === '' && /String/.test(className) ? '' : null;
  if (/Integer|Long|Short|Double|Float|BigDecimal|Number|BigInteger/.test(className)) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    return isNaN(n) ? value : n;
  }
  if (/Boolean/.test(className)) return value === true || value === 'true';
  if (/Date|Timestamp/.test(className) && typeof value === 'string') {
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

export function fill(report: JrReport, records: DataRecord[], parameters: Record<string, unknown> = {}): FillResult {
  const warnings = new Set<string>();
  const pages: FilledPage[] = [];
  const top = report.margins.top;
  const bottom = report.pageHeight - report.margins.bottom;
  const band = (name: string) => report.bands.filter((b) => b.name === name);
  const fieldClass = new Map(report.fields.map((f) => [f.name, f.className]));
  const fieldPath = new Map(report.fields.map((f) => [f.name, f.description || f.name]));
  const paramDefaults = new Map(report.parameters.map((p) => [p.name, p.expression]));

  let record: DataRecord = {};
  let count = 0;
  let pageNumber = 0;
  const totals = new Map<string, { sum: number; count: number; min: number; max: number; last: unknown }>(report.variables.map((v) => [v.name, { sum: 0, count: 0, min: Infinity, max: -Infinity, last: null }]));
  const deferred: { item: Item; element: JrElement }[] = [];

  const scope: Scope = {
    field: (name) => convert(pick(record, fieldPath.get(name) ?? name), fieldClass.get(name) ?? 'java.lang.String'),
    parameter: (name) => {
      if (name in parameters) return parameters[name];
      const def = paramDefaults.get(name);
      if (def) {
        try {
          return evaluate(def, scope);
        } catch {
          return null;
        }
      }
      return null;
    },
    variable: (name) => {
      if (name === 'PAGE_NUMBER') return pageNumber;
      if (name === 'REPORT_COUNT') return count;
      if (name === 'PAGE_COUNT' || name === 'COLUMN_COUNT') return count;
      const v = report.variables.find((x) => x.name === name);
      const t = totals.get(name);
      if (!v || !t) return null;
      switch ((v.calculation ?? 'Nothing').toLowerCase()) {
        case 'sum':
          return t.sum;
        case 'count':
        case 'distinctcount':
          return t.count;
        case 'average':
          return t.count ? t.sum / t.count : 0;
        case 'highest':
          return t.count ? t.max : null;
        case 'lowest':
          return t.count ? t.min : null;
        default:
          return t.last;
      }
    },
  };

  const accumulate = () => {
    for (const v of report.variables) {
      if (!v.expression) continue;
      const t = totals.get(v.name)!;
      try {
        const value = evaluate(v.expression, scope);
        const n = Number(value);
        t.last = value;
        if (value !== null && value !== undefined) {
          t.count++;
          if (!isNaN(n)) {
            t.sum += n;
            t.min = Math.min(t.min, n);
            t.max = Math.max(t.max, n);
          }
        }
      } catch {
        warnings.add(`Variable ${v.name}: could not evaluate ${v.expression}`);
      }
    }
  };

  const textOf = (element: JrElement): { text: string; failed?: string } => {
    if (element.kind === 'staticText') return { text: element.text };
    if (element.kind !== 'textField') return { text: '' };
    try {
      const value = evaluate(element.expression, scope) as Value;
      return { text: display(value, element.pattern) };
    } catch (e) {
      warnings.add(`Could not evaluate ${element.expression} (${(e as Error).message}); it is shown as written.`);
      return { text: element.expression, failed: element.expression };
    }
  };

  let page: FilledPage = { items: [] };
  let y = top;

  const place = (b: JrBand, at: number) => {
    if (b.printWhen) {
      try {
        if (!evaluate(b.printWhen, scope)) return;
      } catch {
        // Print it when the condition cannot be read.
      }
    }
    for (const element of b.elements) {
      if (element.printWhen) {
        try {
          if (!evaluate(element.printWhen, scope)) continue;
        } catch {
          // Print it.
        }
      }
      const { text, failed } = textOf(element);
      const item: Item = {
        kind: element.kind,
        x: report.margins.left + element.x,
        y: at + element.y,
        width: element.width,
        height: element.height,
        text,
        bold: element.bold,
        italic: element.italic,
        fontSize: element.fontSize,
        align: element.align,
        color: element.forecolor,
        background: element.mode === 'Opaque' || element.kind === 'rectangle' ? element.backcolor : null,
        failed,
      };
      page.items.push(item);
      if (element.evaluationTime === 'Report' && element.kind === 'textField') deferred.push({ item, element });
    }
  };

  const footerHeight = () => (band('columnFooter')[0]?.height ?? 0) + (band('pageFooter')[0]?.height ?? 0);

  const startPage = (first: boolean) => {
    page = { items: [] };
    pages.push(page);
    pageNumber++;
    y = top;
    if (first) for (const b of band('title')) (place(b, y), (y += b.height));
    for (const b of [...band('pageHeader'), ...band('columnHeader')]) (place(b, y), (y += b.height));
  };

  const endPage = (last: boolean) => {
    for (const b of band('columnFooter')) (place(b, y), (y += b.height));
    const footer = last && band('lastPageFooter').length ? band('lastPageFooter') : band('pageFooter');
    let fy = bottom - footer.reduce((h, b) => h + b.height, 0);
    for (const b of footer) (place(b, fy), (fy += b.height));
  };

  startPage(true);
  const details = band('detail');
  if (!records.length && band('noData').length) {
    for (const b of band('noData')) (place(b, y), (y += b.height));
  }
  for (const r of records) {
    record = r;
    count++;
    accumulate();
    const height = details.reduce((h, b) => h + b.height, 0);
    if (y + height > bottom - footerHeight() && y > top) {
      endPage(false);
      startPage(false);
    }
    for (const b of details) (place(b, y), (y += b.height));
  }
  const summary = band('summary');
  const summaryHeight = summary.reduce((h, b) => h + b.height, 0);
  if (summaryHeight && y + summaryHeight > bottom - footerHeight()) {
    endPage(false);
    startPage(false);
  }
  for (const b of summary) (place(b, y), (y += b.height));
  endPage(true);

  // "Report" time: totals and the page count are known now.
  const totalPages = pageNumber;
  for (const { item, element } of deferred) {
    const pageIndex = pages.findIndex((p) => p.items.includes(item));
    pageNumber = element.expression.includes('PAGE_NUMBER') ? totalPages : pageIndex + 1;
    const { text, failed } = textOf(element);
    item.text = text;
    item.failed = failed;
  }
  if (pages.length > 200) warnings.add('Only the first 200 pages are shown.');
  return { pages: pages.slice(0, 200), warnings: [...warnings] };
}

/** One row per record with every declared field, for CSV / Excel / Word table exports. */
export function recordTable(report: JrReport, records: DataRecord[]): string[][] {
  const names = report.fields.map((f) => f.name);
  const path = new Map(report.fields.map((f) => [f.name, f.description || f.name]));
  const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return [names, ...records.map((r) => names.map((n) => cell(pick(r, path.get(n) ?? n))))];
}
