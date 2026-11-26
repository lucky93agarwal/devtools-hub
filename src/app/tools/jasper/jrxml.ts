/**
 * A small JRXML (JasperReports template) engine for the browser: reads the template into a model,
 * finds common mistakes, and fills it with JSON/CSV/XML data to draw an approximate preview.
 * It is not JasperReports: it handles the common elements (static text, text fields, lines,
 * rectangles, images) and simple Java/Groovy expressions.
 */

export interface JrElement {
  kind: 'staticText' | 'textField' | 'line' | 'rectangle' | 'ellipse' | 'image' | 'frame' | 'subreport' | 'componentElement' | 'other';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  expression: string;
  pattern: string;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  align: 'Left' | 'Center' | 'Right' | 'Justified';
  forecolor: string;
  backcolor: string;
  mode: 'Opaque' | 'Transparent';
  printWhen: string;
  key: string;
  /** "Now" (default) or "Report" (filled in after the last page, e.g. total pages). */
  evaluationTime: string;
  line: number;
}

export interface JrBand {
  name: string;
  height: number;
  elements: JrElement[];
  printWhen: string;
  line: number;
}

export interface JrDeclaration {
  name: string;
  className: string;
  expression?: string;
  calculation?: string;
  description?: string;
  line: number;
}

export interface JrReport {
  name: string;
  pageWidth: number;
  pageHeight: number;
  columnWidth: number;
  margins: { left: number; right: number; top: number; bottom: number };
  orientation: string;
  fields: JrDeclaration[];
  parameters: JrDeclaration[];
  variables: JrDeclaration[];
  query: string;
  bands: JrBand[];
  styles: string[];
}

/** sessionStorage key used to hand a template from the generator to the previewer or debugger. */
export const HANDOFF_KEY = 'dt-jrxml-handoff';

/** The template handed over by another Jasper tool, once (browser only). */
export function takeHandoff(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return value;
  } catch {
    return null;
  }
}

export const BAND_ORDER = ['background', 'title', 'pageHeader', 'columnHeader', 'detail', 'columnFooter', 'pageFooter', 'lastPageFooter', 'summary', 'noData'] as const;

export class JrxmlError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(message);
  }
}

/** Line numbers: the parser does not keep them, so they are looked up in the source text. */
function lineFinder(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  let from = 0;
  return (pattern: RegExp): number => {
    pattern.lastIndex = from;
    const match = pattern.exec(source);
    if (!match) return 0;
    from = match.index + 1;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= match.index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const num = (el: Element | null | undefined, name: string, fallback = 0) => {
  const v = el?.getAttribute(name);
  return v === null || v === undefined || v === '' ? fallback : Number(v);
};
const child = (el: Element, name: string): Element | undefined => [...el.children].find((c) => c.localName === name);
const children = (el: Element, name: string): Element[] => [...el.children].filter((c) => c.localName === name);
const textOf = (el: Element | undefined) => (el?.textContent ?? '').trim();

/** Reads JRXML. Throws JrxmlError with the line for invalid XML or a non-report document. */
export function parseJrxml(source: string): JrReport {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) {
    const message = error.textContent ?? 'Invalid XML';
    const line = /line\s*(?:number\s*)?(\d+)/i.exec(message);
    throw new JrxmlError(`This is not valid XML: ${message.replace(/\s+/g, ' ').replace(/^.*?error[^:]*:\s*/i, '').slice(0, 200)}`, line ? Number(line[1]) : null);
  }
  const root = doc.documentElement;
  if (root.localName !== 'jasperReport') throw new JrxmlError(`The root element is <${root.localName}>, not <jasperReport>.`, 1);
  const at = lineFinder(source);

  const declarations = (tag: string): JrDeclaration[] =>
    children(root, tag).map((el) => ({
      name: el.getAttribute('name') ?? '',
      className: el.getAttribute('class') ?? 'java.lang.String',
      calculation: el.getAttribute('calculation') ?? undefined,
      expression: textOf(child(el, 'variableExpression') ?? child(el, 'defaultValueExpression')) || undefined,
      description: textOf(child(el, 'fieldDescription')) || undefined,
      line: at(new RegExp(`<${tag}\\b[^>]*name="${(el.getAttribute('name') ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')),
    }));

  const readElements = (container: Element, offsetX = 0, offsetY = 0): JrElement[] => {
    const out: JrElement[] = [];
    for (const el of [...container.children]) {
      const name = el.localName;
      if (name === 'printWhenExpression' || name === 'property') continue;
      const reportElement = child(el, 'reportElement');
      if (!reportElement) continue;
      const textElement = child(el, 'textElement');
      const font = textElement ? child(textElement, 'font') : undefined;
      const style = (el.getAttribute('style') ?? reportElement.getAttribute('style') ?? '').toLowerCase();
      const kind = (['staticText', 'textField', 'line', 'rectangle', 'ellipse', 'image', 'frame', 'subreport', 'componentElement'].includes(name) ? name : 'other') as JrElement['kind'];
      const element: JrElement = {
        kind,
        x: num(reportElement, 'x') + offsetX,
        y: num(reportElement, 'y') + offsetY,
        width: num(reportElement, 'width'),
        height: num(reportElement, 'height'),
        text: kind === 'staticText' ? textOf(child(el, 'text')) : '',
        expression: textOf(child(el, 'textFieldExpression') ?? child(el, 'imageExpression') ?? child(el, 'subreportExpression')),
        pattern: el.getAttribute('pattern') ?? textOf(child(el, 'patternExpression')).replace(/^"|"$/g, ''),
        bold: font?.getAttribute('isBold') === 'true' || /bold|header|title/.test(style),
        italic: font?.getAttribute('isItalic') === 'true',
        fontSize: num(font, 'size', /title/.test(style) ? 18 : 10),
        align: (textElement?.getAttribute('textAlignment') ?? 'Left') as JrElement['align'],
        forecolor: reportElement.getAttribute('forecolor') ?? '#000000',
        backcolor: reportElement.getAttribute('backcolor') ?? '#FFFFFF',
        mode: (reportElement.getAttribute('mode') ?? (kind === 'rectangle' ? 'Opaque' : 'Transparent')) as JrElement['mode'],
        printWhen: textOf(child(reportElement, 'printWhenExpression')),
        key: reportElement.getAttribute('key') ?? '',
        evaluationTime: el.getAttribute('evaluationTime') ?? 'Now',
        line: at(new RegExp(`<${name}\\b`, 'g')),
      };
      out.push(element);
      if (kind === 'frame') out.push(...readElements(el, element.x, element.y));
    }
    return out;
  };

  const bands: JrBand[] = [];
  for (const name of BAND_ORDER) {
    const section = child(root, name);
    if (!section) continue;
    // JasperReports 6 wraps bands in <band>; detail may hold several.
    const list = children(section, 'band');
    for (const band of list.length ? list : [section]) {
      bands.push({
        name,
        height: num(band, 'height'),
        elements: readElements(band),
        printWhen: textOf(child(band, 'printWhenExpression')),
        line: at(new RegExp(`<${name}\\b`, 'g')),
      });
    }
  }

  return {
    name: root.getAttribute('name') ?? 'report',
    pageWidth: num(root, 'pageWidth', 595),
    pageHeight: num(root, 'pageHeight', 842),
    columnWidth: num(root, 'columnWidth', num(root, 'pageWidth', 595) - num(root, 'leftMargin', 20) - num(root, 'rightMargin', 20)),
    margins: { left: num(root, 'leftMargin', 20), right: num(root, 'rightMargin', 20), top: num(root, 'topMargin', 20), bottom: num(root, 'bottomMargin', 20) },
    orientation: root.getAttribute('orientation') ?? 'Portrait',
    fields: declarations('field'),
    parameters: declarations('parameter'),
    variables: declarations('variable'),
    query: textOf(child(root, 'queryString')),
    bands,
    styles: children(root, 'style').map((s) => s.getAttribute('name') ?? ''),
  };
}

// ---------- references in expressions ----------

const BUILT_IN_VARIABLES = ['PAGE_NUMBER', 'COLUMN_NUMBER', 'REPORT_COUNT', 'PAGE_COUNT', 'COLUMN_COUNT', 'MASTER_CURRENT_PAGE', 'MASTER_TOTAL_PAGES'];
const BUILT_IN_PARAMETERS = ['REPORT_PARAMETERS_MAP', 'REPORT_CONNECTION', 'REPORT_DATA_SOURCE', 'REPORT_SCRIPTLET', 'REPORT_LOCALE', 'REPORT_RESOURCE_BUNDLE', 'REPORT_TIME_ZONE', 'REPORT_FORMAT_FACTORY', 'REPORT_CLASS_LOADER', 'REPORT_VIRTUALIZER', 'IS_IGNORE_PAGINATION', 'REPORT_MAX_COUNT', 'REPORT_TEMPLATES', 'REPORT_CONTEXT', 'SORT_FIELDS', 'FILTER', 'JASPER_REPORT', 'JASPER_REPORTS_CONTEXT', 'REPORT_URL_HANDLER_FACTORY', 'REPORT_FILE_RESOLVER'];

/** Every $F{..}, $P{..}, $V{..} in an expression. */
export function references(expression: string): { type: 'F' | 'P' | 'V'; name: string }[] {
  return [...expression.matchAll(/\$([FPV])\{([^}]+)\}/g)].map((m) => ({ type: m[1] as 'F' | 'P' | 'V', name: m[2].trim() }));
}

// ---------- checks ----------

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix: string;
  line: number | null;
}

/** Common JRXML mistakes, with a suggested fix for each. */
export function analyze(report: JrReport): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], message: string, fix: string, line: number | null = null) => issues.push({ severity, message, fix, line });
  const fields = new Set(report.fields.map((f) => f.name));
  const params = new Set([...report.parameters.map((p) => p.name), ...BUILT_IN_PARAMETERS]);
  const vars = new Set([...report.variables.map((v) => v.name), ...BUILT_IN_VARIABLES]);
  const used = { F: new Set<string>(), P: new Set<string>(), V: new Set<string>() };

  const checkExpression = (expression: string, line: number | null, where: string) => {
    for (const ref of references(expression)) {
      used[ref.type].add(ref.name);
      const known = ref.type === 'F' ? fields : ref.type === 'P' ? params : vars;
      if (!known.has(ref.name)) {
        const tag = ref.type === 'F' ? 'field' : ref.type === 'P' ? 'parameter' : 'variable';
        add('error', `$${ref.type}{${ref.name}} is used in ${where} but no <${tag} name="${ref.name}"> is declared.`, `Add <${tag} name="${ref.name}" class="java.lang.String"/> near the top (use the Field Mapper to get the right class).`, line);
      }
    }
    const opens = (expression.match(/\(/g) ?? []).length;
    const closes = (expression.match(/\)/g) ?? []).length;
    if (opens !== closes) add('error', `Unbalanced brackets in ${where}: ${opens} "(" and ${closes} ")".`, 'Check the expression with the Expression Helper.', line);
    if ((expression.replace(/\\"/g, '').match(/"/g) ?? []).length % 2) add('error', `An unclosed text quote (") in ${where}.`, 'Close the string with a matching ".', line);
  };

  const usable = report.pageWidth - report.margins.left - report.margins.right;
  if (report.columnWidth > usable) add('error', `columnWidth ${report.columnWidth} is wider than the page minus margins (${usable}).`, `Set columnWidth="${usable}" or reduce the margins.`, 1);
  const vertical = report.pageHeight - report.margins.top - report.margins.bottom;

  let fixedHeight = 0;
  for (const band of report.bands) {
    const where = `the ${band.name} band`;
    if (band.printWhen) checkExpression(band.printWhen, band.line, `${where} (printWhenExpression)`);
    if (['pageHeader', 'columnHeader', 'columnFooter', 'pageFooter'].includes(band.name)) fixedHeight += band.height;
    if (band.height > vertical) add('error', `${where} is ${band.height}px tall, more than the page can hold (${vertical}px between margins).`, 'Make the band shorter, or split its content into several bands; otherwise JasperReports fails or prints blank pages.', band.line);
    if (band.name === 'detail' && band.height > vertical / 2) add('warning', `The detail band is ${band.height}px tall: each record takes over half a page.`, 'Usually the detail band is one row (15-30px). Move headings to the column header band.', band.line);
    if (!band.elements.length && band.height > 0 && band.name !== 'background') add('info', `${where} is ${band.height}px tall but empty, so it adds blank space.`, `Set height="0" or remove the band.`, band.line);
    for (const el of band.elements) {
      const label = `${el.kind}${el.key ? ` "${el.key}"` : ''} at x=${el.x}, y=${el.y} in ${where}`;
      if (el.y + el.height > band.height) add('error', `${label} goes below the band (y + height = ${el.y + el.height} > band height ${band.height}).`, `Make the band ${el.y + el.height}px tall or move the element up.`, el.line);
      if (el.x + el.width > report.columnWidth) add('warning', `${label} goes past the right edge (x + width = ${el.x + el.width} > column width ${report.columnWidth}).`, `Make it narrower: width="${Math.max(1, report.columnWidth - el.x)}".`, el.line);
      if (el.x < 0 || el.y < 0) add('error', `${label} has a negative position.`, 'Use x and y of 0 or more.', el.line);
      if (el.kind === 'textField' && !el.expression) add('error', `${label} has no textFieldExpression.`, 'Add <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>.', el.line);
      if (el.kind === 'textField' && el.expression) checkExpression(el.expression, el.line, label);
      if (el.printWhen) checkExpression(el.printWhen, el.line, `${label} (printWhenExpression)`);
      if ((el.kind === 'staticText' || el.kind === 'textField') && el.height > 0 && el.height < el.fontSize) add('warning', `${label} is ${el.height}px tall for a ${el.fontSize}pt font, so text is cut off.`, `Use height="${Math.ceil(el.fontSize * 1.3)}" or more.`, el.line);
    }
    // Overlaps between text elements in the same band (lines and boxes are often meant to overlap).
    const texts = band.elements.filter((e) => e.kind === 'staticText' || e.kind === 'textField');
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i];
        const b = texts[j];
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
          add('warning', `Two text elements overlap in ${where} (at x=${a.x}, y=${a.y} and x=${b.x}, y=${b.y}).`, 'Move or resize one of them; overlapping text prints on top of each other.', b.line);
      }
  }
  const detail = report.bands.find((b) => b.name === 'detail');
  if (!detail) add('warning', 'There is no detail band, so no records will be printed.', 'Add <detail><band height="20">...</band></detail>.', null);
  if (detail && fixedHeight + detail.height > vertical) add('error', `Page header + column header/footer + page footer + one detail row (${fixedHeight + detail.height}px) are taller than the page (${vertical}px).`, 'Reduce band heights; JasperReports cannot fit a single record on a page.', detail.line);
  for (const v of report.variables) if (v.expression) checkExpression(v.expression, v.line, `variable ${v.name}`);
  for (const f of report.fields) if (!used.F.has(f.name)) add('info', `Field "${f.name}" is declared but not used.`, 'Remove it or show it in the detail band.', f.line);
  if (report.query) for (const m of report.query.matchAll(/\$P!?\{([^}]+)\}/g)) if (!params.has(m[1])) add('error', `The query uses $P{${m[1]}} but no such parameter is declared.`, `Add <parameter name="${m[1]}" class="java.lang.String"/>.`, null);
  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0));
}

/** Adds declarations for fields, parameters and variables that are used but missing. */
export function addMissingDeclarations(source: string, report: JrReport): string {
  const known = {
    F: new Set(report.fields.map((f) => f.name)),
    P: new Set([...report.parameters.map((p) => p.name), ...BUILT_IN_PARAMETERS]),
    V: new Set([...report.variables.map((v) => v.name), ...BUILT_IN_VARIABLES]),
  };
  const expressions = [
    ...report.bands.flatMap((b) => [b.printWhen, ...b.elements.flatMap((e) => [e.expression, e.printWhen])]),
    ...report.variables.map((v) => v.expression ?? ''),
    report.query.replace(/\$P!\{/g, '$P{'),
  ];
  const missing = { F: new Set<string>(), P: new Set<string>() };
  for (const e of expressions) for (const r of references(e)) if (r.type !== 'V' && !known[r.type].has(r.name)) missing[r.type].add(r.name);
  if (!missing.F.size && !missing.P.size) return source;
  const lines = [...[...missing.P].map((n) => `\t<parameter name="${n}" class="java.lang.String"/>`), ...[...missing.F].map((n) => `\t<field name="${n}" class="java.lang.String"/>`)].join('\n');
  // Declarations go before the first band-level element, as the schema requires.
  const anchor = /<(?:sortField|variable|filterExpression|group|background|title|pageHeader|columnHeader|detail|columnFooter|pageFooter|lastPageFooter|summary|noData)\b/.exec(source);
  if (!anchor) return source.replace(/<\/jasperReport>/, `${lines}\n</jasperReport>`);
  return `${source.slice(0, anchor.index)}${lines.trimStart()}\n\t${source.slice(anchor.index)}`;
}
