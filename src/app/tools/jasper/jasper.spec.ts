import { describe, expect, it } from 'vitest';
import { display, evaluate, formatDate, formatNumber } from './expression';
import { fill, parseData, recordTable } from './fill';
import { addMissingDeclarations, analyze, parseJrxml, references } from './jrxml';
import { SAMPLE_DATA, SAMPLE_JRXML } from './sample';

const scope = (fields: Record<string, unknown> = {}, vars: Record<string, unknown> = {}) => ({
  field: (n: string) => fields[n],
  parameter: () => null,
  variable: (n: string) => vars[n],
});

describe('expressions', () => {
  it('joins text, numbers and references', () => {
    expect(evaluate('"Page " + $V{PAGE_NUMBER} + " of " + 3', scope({}, { PAGE_NUMBER: 2 }))).toBe('Page 2 of 3');
    expect(evaluate('$F{qty} * $F{price}', scope({ qty: 3, price: 2.5 }))).toBe(7.5);
  });
  it('handles null checks, ternaries and string methods', () => {
    expect(evaluate('$F{s} == null ? "-" : $F{s}.toUpperCase()', scope({ s: null }))).toBe('-');
    expect(evaluate('$F{s} != null && $F{s}.length() > 2 ? $F{s}.substring(0, 2) : "x"', scope({ s: 'hello' }))).toBe('he');
    expect(evaluate('((String) $F{s}).trim()', scope({ s: '  a ' }))).toBe('a');
  });
  it('formats dates and numbers like Java', () => {
    const d = new Date(2026, 10, 5, 14, 7);
    expect(evaluate('new java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a").format($F{d})', scope({ d }))).toBe('05 Nov 2026, 02:07 PM');
    expect(formatDate(d, "EEEE, d MMMM yy 'at' HH:mm")).toBe('Thursday, 05 November 26 at 14:07'.replace(' 05 ', ' 5 '));
    expect(formatNumber(1234567.5, '#,##0.00')).toBe('1,234,567.50');
    expect(formatNumber(0.256, '0.0%')).toBe('25.6%');
    expect(formatNumber(2499, '₹ #,##0')).toBe('₹ 2,499');
    expect(display('2026-11-02', 'dd/MM/yyyy')).toBe('02/11/2026');
    expect(evaluate('String.format("%.2f", $F{a})', scope({ a: 3.14159 }))).toBe('3.14');
  });
  it('throws on things it cannot read', () => {
    expect(() => evaluate('$F{a}.unknownMethod()', scope({ a: 'x' }))).toThrow();
    expect(() => evaluate('"unclosed', scope())).toThrow();
  });
});

describe('JRXML', () => {
  it('reads the sample', () => {
    const r = parseJrxml(SAMPLE_JRXML);
    expect(r.name).toBe('orders_report');
    expect(r.fields.map((f) => f.name)).toEqual(['orderId', 'customer', 'orderDate', 'amount', 'status']);
    expect(r.bands.map((b) => b.name)).toEqual(['title', 'columnHeader', 'detail', 'pageFooter', 'summary']);
    expect(r.bands[2].elements[0]).toMatchObject({ kind: 'textField', x: 5, y: 2, width: 70, expression: '$F{orderId}' });
    expect(analyze(r).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('reports bad XML with its line', () => {
    expect(() => parseJrxml('<jasperReport>\n<title>\n</jasperReport>')).toThrow(/not valid XML/);
    expect(() => parseJrxml('<html/>')).toThrow('not <jasperReport>');
  });

  it('finds missing fields, overflow, overlaps and oversized bands', () => {
    const bad = SAMPLE_JRXML.replace('$F{customer}]]', '$F{customerName}]]')
      .replace('<reportElement x="470" y="2" width="80" height="16"/>', '<reportElement x="470" y="2" width="120" height="30"/>')
      .replace('<reportElement x="80" y="2" width="200" height="16"/>', '<reportElement x="60" y="2" width="200" height="16"/>')
      .replace('<band height="30">', '<band height="900">');
    const issues = analyze(parseJrxml(bad));
    const text = issues.map((i) => i.message).join('\n');
    expect(text).toContain('$F{customerName} is used');
    expect(text).toContain('goes below the band');
    expect(text).toContain('goes past the right edge');
    expect(text).toContain('overlap');
    expect(text).toContain('more than the page can hold');
    expect(issues.every((i) => i.fix)).toBe(true);
  });

  it('adds missing declarations', () => {
    const bad = SAMPLE_JRXML.replace('$F{customer}]]', '$F{customerName}]]');
    const fixed = addMissingDeclarations(bad, parseJrxml(bad));
    expect(fixed).toContain('<field name="customerName" class="java.lang.String"/>');
    expect(analyze(parseJrxml(fixed)).some((i) => i.message.includes('customerName is used'))).toBe(false);
  });

  it('lists references', () => {
    expect(references('$F{a} + $P{b} + $V{PAGE_NUMBER}')).toEqual([
      { type: 'F', name: 'a' },
      { type: 'P', name: 'b' },
      { type: 'V', name: 'PAGE_NUMBER' },
    ]);
  });
});

describe('fill', () => {
  it('fills the sample: rows, formats, totals and page count', async () => {
    const report = parseJrxml(SAMPLE_JRXML);
    const { pages, warnings } = fill(report, await parseData(SAMPLE_DATA, 'json'));
    expect(warnings).toEqual([]);
    expect(pages).toHaveLength(1);
    const texts = pages[0].items.map((i) => i.text);
    expect(texts).toContain('Acme Pvt Ltd - Orders');
    expect(texts).toContain('02/11/2026');
    expect(texts).toContain('2,499.00');
    expect(texts).toContain('PENDING');
    expect(texts).toContain('-');
    expect(texts).toContain('₹ 15,648.50');
    expect(texts).toContain('Page 1 of');
    expect(texts).toContain(' 1');
  });

  it('breaks pages and repeats the column header', () => {
    const report = parseJrxml(SAMPLE_JRXML);
    const many = Array.from({ length: 90 }, (_, i) => ({ orderId: i + 1, customer: `C${i}`, orderDate: '2026-01-01', amount: 10, status: 'paid' }));
    const { pages } = fill(report, many);
    expect(pages.length).toBe(3);
    expect(pages[1].items.some((i) => i.text === 'Order #')).toBe(true);
    expect(pages[2].items.some((i) => i.text === ' 3')).toBe(true);
    expect(pages.at(-1)!.items.some((i) => i.text === '₹ 900.00')).toBe(true);
  });

  it('reads CSV and XML data, and builds export rows', async () => {
    expect(await parseData('a,b\n1,x\n2,y', 'csv')).toEqual([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(await parseData('<orders><order id="1"><customer>Asha</customer></order></orders>', 'xml')).toEqual([{ id: '1', customer: 'Asha' }]);
    const rows = recordTable(parseJrxml(SAMPLE_JRXML), [{ orderId: 1, customer: 'A' }]);
    expect(rows).toEqual([['orderId', 'customer', 'orderDate', 'amount', 'status'], ['1', 'A', '', '', '']]);
  });
});
