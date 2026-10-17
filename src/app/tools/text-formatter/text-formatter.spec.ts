import { formatXml, minifyXml } from './xml-format';
import { formatYaml } from './yaml-format';

describe('formatXml', () => {
  const ok = (text: string, indent = '  ') => {
    const result = formatXml(text, indent);
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };

  it('indents nested elements and keeps short text on one line', () => {
    expect(ok('<a><b>1</b><c><d x="1"/></c><e></e></a>')).toBe(
      '<a>\n  <b>1</b>\n  <c>\n    <d x="1"/>\n  </c>\n  <e></e>\n</a>\n',
    );
  });

  it('keeps the declaration, comments, CDATA, DOCTYPE and attribute quoting', () => {
    const xml =
      "<?xml version=\"1.0\"?><!DOCTYPE note><!-- hi --><note a='1' b=\"x > y\"><![CDATA[<raw>]]></note>";
    expect(ok(xml, '    ')).toBe(
      "<?xml version=\"1.0\"?>\n<!DOCTYPE note>\n<!-- hi -->\n<note a='1' b=\"x > y\">\n    <![CDATA[<raw>]]>\n</note>\n",
    );
  });

  it('re-indents already formatted XML the same way', () => {
    const once = ok('<a>\n      <b>\n  text\n</b>\n</a>');
    expect(ok(once)).toBe(once);
  });

  it('reports the line of a mismatched tag', () => {
    expect(formatXml('<a>\n<b></c>\n</a>', '  ')).toMatchObject({ ok: false, error: { line: 2 } });
  });

  it('minifies by removing whitespace between tags only', () => {
    expect(minifyXml('<a>\n  <b> keep  me </b>\n  <!-- c -->\n</a>\n')).toEqual({
      ok: true,
      output: '<a><b> keep  me </b><!-- c --></a>',
    });
  });
});

describe('formatYaml', () => {
  it('re-indents and keeps comments', () => {
    const result = formatYaml('# app\nservice:\n      name: shop   # main\n      ports: [80, 443]\n', 2);
    expect(result).toEqual({
      ok: true,
      output: '# app\nservice:\n  name: shop # main\n  ports: [ 80, 443 ]\n',
      documents: 1,
      warnings: [],
    });
  });

  it('handles several documents', () => {
    const result = formatYaml('a: 1\n---\nb: 2\n', 2);
    expect(result).toMatchObject({ ok: true, documents: 2, output: 'a: 1\n---\nb: 2\n' });
  });

  it('reports errors with their line', () => {
    expect(formatYaml('a: 1\nb: [1, 2\nc: 3\n', 2)).toMatchObject({ ok: false });
    const tabs = formatYaml('a:\n\tb: 1\n', 2);
    expect(tabs).toMatchObject({ ok: false, error: { line: 2 } });
  });

  it('warns about duplicate keys without failing', () => {
    const result = formatYaml('a: 1\nb: 2\na: 3\n', 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toMatchObject([{ line: 3 }]);
  });
});
