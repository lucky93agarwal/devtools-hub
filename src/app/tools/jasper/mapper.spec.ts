import { describe, expect, it } from 'vitest';
import { javaClass, mapJson, mapSql, toXml } from './mapper';
import { parseJrxml } from './jrxml';
import { checkExpression, RECIPES } from './recipes';
import { evaluate as run } from './expression';

describe('field mapper', () => {
  it('picks Java classes from sample values', () => {
    expect(javaClass(5)).toBe('java.lang.Integer');
    expect(javaClass(9_000_000_000)).toBe('java.lang.Long');
    expect(javaClass(2.5, 'amount')).toBe('java.math.BigDecimal');
    expect(javaClass(2.5, 'ratio')).toBe('java.lang.Double');
    expect(javaClass('2026-11-26')).toBe('java.util.Date');
    expect(javaClass('2026-11-26T10:00:00Z')).toBe('java.sql.Timestamp');
    expect(javaClass(true)).toBe('java.lang.Boolean');
    expect(javaClass(25000, 'unitPrice')).toBe('java.math.BigDecimal');
    expect(javaClass([1])).toBe('java.util.List');
  });

  it('maps an envelope: scalars to parameters, records to fields with paths, numbers to totals', () => {
    const r = mapJson('{"invoiceNo": "INV-1", "items": [{"id": 1, "name": "Pen", "price": 10.5, "customer": {"city": "Pune"}, "tags": ["a"]}]}');
    expect(r.parameters).toEqual([{ name: 'invoiceNo', className: 'java.lang.String' }]);
    expect(r.fields.map((f) => [f.name, f.className, f.description])).toEqual([
      ['id', 'java.lang.Integer', 'id'],
      ['name', 'java.lang.String', 'name'],
      ['price', 'java.math.BigDecimal', 'price'],
      ['customerCity', 'java.lang.String', 'customer.city'],
      ['tags', 'java.util.List', 'tags'],
    ]);
    expect(r.variables).toEqual([{ name: 'TOTAL_PRICE', className: 'java.math.BigDecimal', calculation: 'Sum', expression: '$F{price}' }]);
    expect(r.notes.join(' ')).toContain('"items"');
  });

  it('maps an SQL query with aliases and parameters', () => {
    const r = mapSql("SELECT o.id, c.name AS customer_name, SUM(o.amount) total, o.created_at FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = :status AND o.created_at > ? GROUP BY o.id");
    expect(r.fields).toEqual([
      { name: 'id', className: 'java.lang.Integer' },
      { name: 'customer_name', className: 'java.lang.String' },
      { name: 'total', className: 'java.math.BigDecimal' },
      { name: 'created_at', className: 'java.sql.Timestamp' },
    ]);
    expect(r.parameters.map((p) => p.name)).toEqual(['status', 'PARAM_1']);
    expect(r.query).toContain('o.status = $P{status} AND o.created_at > $P{PARAM_1}');
    expect(() => mapSql('UPDATE x SET a = 1')).toThrow('SELECT');
  });

  it('writes XML that a report can use', () => {
    const xml = toXml(mapJson('[{"orderId": 1, "amount": 99.5, "placedOn": "2026-01-02"}]'), true);
    expect(xml).toContain('<field name="orderId" class="java.lang.Integer"/>');
    expect(xml).toContain('<textField isBlankWhenNull="true" pattern="dd/MM/yyyy">');
    const report = parseJrxml(`<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" name="t" pageWidth="595" pageHeight="842" columnWidth="555" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">${xml}</jasperReport>`);
    expect(report.fields).toHaveLength(3);
    expect(report.bands.find((b) => b.name === 'detail')?.elements).toHaveLength(3);
  });
});


describe('expression helper', () => {
  it('flags common mistakes', () => {
    const msgs = (e: string, l: 'java' | 'groovy' = 'java') => checkExpression(e, l).map((h) => h.message).join('\n');
    expect(msgs('$F{a} == "X" ? "y" : $F{a}.trim()')).toMatch(/equals[\s\S]*NullPointerException/);
    expect(msgs('"abc + $F{x}')).toContain('not closed');
    expect(msgs('($F{a} + 1')).toContain('Brackets do not match');
    expect(msgs("$F{a} + 'xy'")).toContain('double quotes');
    expect(msgs("$F{a} + 'xy'", 'groovy')).not.toContain('double quotes');
    expect(checkExpression('$F{a} != null ? $F{a}.trim() : ""', 'java')).toEqual([]);
  });

  it('builds recipes that the previewer can run', () => {
    const scope = { field: (n: string) => ({ orderDate: new Date(2026, 10, 26), status: null, firstName: 'Asha', lastName: null })[n], parameter: () => null, variable: () => null };
    const code = (id: string) => RECIPES.find((r) => r.id === id)!.build(Object.fromEntries(RECIPES.find((r) => r.id === id)!.inputs.map((i) => [i.key, i.value]))).code;
    expect(run(code('date'), scope)).toBe('26 Nov 2026');
    expect(run(code('condition'), scope)).toBe('Due');
    expect(run(code('concat'), scope)).toBe('Asha ');
  });
});

describe('snippet builder', () => {
  it('parses columns and fills the remaining width', async () => {
    const { fitWidths, parseColumns } = await import('./snippets');
    const cols = fitWidths(parseColumns('Item : product : 200\nUnit Price : : : java.math.BigDecimal\nQty'), 500);
    expect(cols.map((c) => [c.field, c.width, c.className])).toEqual([
      ['product', 200, 'java.lang.String'],
      ['unitPrice', 150, 'java.math.BigDecimal'],
      ['qty', 150, 'java.lang.String'],
    ]);
  });

  it('makes a table whose XML is well-formed', async () => {
    const { parseColumns, tableSnippet } = await import('./snippets');
    const t = tableSnippet({ dataset: 'items', source: 'json', listField: 'items', columns: parseColumns('A : a\nB : b : : java.lang.Double'), width: 400, zebra: true });
    const doc = new DOMParser().parseFromString(`<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${t.declarations}${t.element.replace(/<!--[\s\S]*?-->/g, '')}</root>`, 'application/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    expect(t.element).toContain('subDataSource("items")');
    expect(t.element).toContain('pattern="#,##0.00"');
  });
});

describe('export', () => {
  it('writes HTML whose style attributes stay intact', async () => {
    const { pagesToHtml } = await import('./export');
    const html = pagesToHtml([{ items: [{ kind: 'textField', x: 1, y: 2, width: 50, height: 10, text: '<b>', bold: true, italic: false, fontSize: 10, align: 'Right', color: '#FF0000', background: null }] }], { pageWidth: 595, pageHeight: 842 } as never);
    const div = new DOMParser().parseFromString(html, 'text/html').querySelector('.jr-page div') as HTMLElement;
    expect(div.style.color).toBe('rgb(255, 0, 0)');
    expect(div.style.textAlign).toBe('right');
    expect(div.textContent).toBe('<b>');
  });
});

describe('AI output clean-up', () => {
  it('removes elements not allowed in <style> and an unrequested query', async () => {
    const { extractJrxml } = await import('../../../../worker/jasper');
    const out = extractJrxml('Here you go:\n<jasperReport name="x"><style name="h"><box><pen lineWidth="1"/></box><background color="#fff"/><textElement><font isBold="true"/></textElement></style><queryString>SELECT a FROM t</queryString><field name="a" class="java.lang.String"/></jasperReport> thanks');
    expect(out.startsWith('<?xml')).toBe(true);
    expect(out).toContain('<style name="h"><box><pen lineWidth="1"/></box></style>');
    expect(out).not.toContain('queryString');
    expect(out.endsWith('</jasperReport>')).toBe(true);
  });
});
