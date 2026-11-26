/** XML snippets for JasperReports tables, lists, barcodes, QR codes and subreports. */

export interface Column {
  header: string;
  field: string;
  width: number;
  className: string;
}

/** "Header : field : width : class" lines → columns (width and class optional). */
export function parseColumns(text: string): Column[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [header, field, width, className] = line.split(':').map((p) => p.trim());
      const name = field || header.replace(/\W+(\w)/g, (_m, c: string) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase()).replace(/\W/g, '');
      return { header, field: name, width: Number(width) || 0, className: className || 'java.lang.String' };
    });
}

/** Spreads the space left over between columns that have no width. */
export function fitWidths(columns: Column[], total: number): Column[] {
  const fixed = columns.reduce((s, c) => s + c.width, 0);
  const free = columns.filter((c) => !c.width).length;
  const each = free ? Math.max(20, Math.floor((total - fixed) / free)) : 0;
  return columns.map((c) => ({ ...c, width: c.width || each }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const COMPONENTS_NS = 'xmlns:jr="http://jasperreports.sourceforge.net/jasperreports/components" xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports/components http://jasperreports.sourceforge.net/xsd/components.xsd"';

export interface TableOptions {
  dataset: string;
  source: 'json' | 'beans';
  listField: string;
  columns: Column[];
  width: number;
  zebra: boolean;
}

export function tableSnippet(o: TableOptions): { declarations: string; element: string; note: string } {
  const cols = fitWidths(o.columns, o.width);
  const fields = cols.map((c) => `\t<field name="${esc(c.field)}" class="${c.className}"/>`).join('\n');
  const declarations = `<subDataset name="${esc(o.dataset)}">\n${fields}\n</subDataset>`;
  const dataSource =
    o.source === 'json'
      ? `((net.sf.jasperreports.engine.data.JsonDataSource) $P{REPORT_DATA_SOURCE}).subDataSource("${esc(o.listField)}")`
      : `new net.sf.jasperreports.engine.data.JRBeanCollectionDataSource($F{${esc(o.listField)}})`;
  const column = (c: Column) => {
    const numeric = /Integer|Long|Double|BigDecimal/.test(c.className);
    const pattern = /BigDecimal|Double/.test(c.className) ? ' pattern="#,##0.00"' : /Date|Timestamp/.test(c.className) ? ' pattern="dd/MM/yyyy"' : '';
    return `\t\t<jr:column width="${c.width}">
\t\t\t<jr:columnHeader height="24" rowSpan="1">
\t\t\t\t<staticText>
\t\t\t\t\t<reportElement mode="Opaque" x="0" y="0" width="${c.width}" height="24" backcolor="#EEF0FF"/>
\t\t\t\t\t<box leftPadding="4" rightPadding="4"><bottomPen lineWidth="1"/></box>
\t\t\t\t\t<textElement textAlignment="${numeric ? 'Right' : 'Left'}" verticalAlignment="Middle"><font isBold="true"/></textElement>
\t\t\t\t\t<text><![CDATA[${c.header}]]></text>
\t\t\t\t</staticText>
\t\t\t</jr:columnHeader>
\t\t\t<jr:detailCell height="20" rowSpan="1">
\t\t\t\t<textField isBlankWhenNull="true" isStretchWithOverflow="true"${pattern}>
\t\t\t\t\t<reportElement${o.zebra ? ' style="TableZebra"' : ''} x="0" y="0" width="${c.width}" height="20"/>
\t\t\t\t\t<box leftPadding="4" rightPadding="4"><bottomPen lineWidth="0.5" lineColor="#DDDDDD"/></box>
\t\t\t\t\t<textElement textAlignment="${numeric ? 'Right' : 'Left'}" verticalAlignment="Middle"/>
\t\t\t\t\t<textFieldExpression><![CDATA[$F{${c.field}}]]></textFieldExpression>
\t\t\t\t</textField>
\t\t\t</jr:detailCell>
\t\t</jr:column>`;
  };
  const zebraStyle = o.zebra ? `<!-- Put this style near the top of the report: -->\n<style name="TableZebra" mode="Transparent">\n\t<conditionalStyle>\n\t\t<conditionExpression><![CDATA[$V{REPORT_COUNT} % 2 == 0]]></conditionExpression>\n\t\t<style mode="Opaque" backcolor="#F7F7FB"/>\n\t</conditionalStyle>\n</style>\n\n` : '';
  const element = `${zebraStyle}<componentElement>
\t<reportElement x="0" y="0" width="${o.width}" height="44" isRemoveLineWhenBlank="true"/>
\t<jr:table ${COMPONENTS_NS}>
\t\t<datasetRun subDataset="${esc(o.dataset)}">
\t\t\t<dataSourceExpression><![CDATA[${dataSource}]]></dataSourceExpression>
\t\t</datasetRun>
${cols.map(column).join('\n')}
\t</jr:table>
</componentElement>`;
  return {
    declarations,
    element,
    note: 'The table header repeats on every page automatically. Put <subDataset> after <style> elements and before <parameter>; put the component in a band (often the summary or a group footer) that is at least 44px tall.',
  };
}

export function listSnippet(o: TableOptions): { declarations: string; element: string; note: string } {
  const cols = fitWidths(o.columns, o.width);
  const fields = cols.map((c) => `\t<field name="${esc(c.field)}" class="${c.className}"/>`).join('\n');
  let x = 0;
  const cells = cols
    .map((c) => {
      const cell = `\t\t\t<textField isBlankWhenNull="true">\n\t\t\t\t<reportElement x="${x}" y="0" width="${c.width}" height="20"/>\n\t\t\t\t<textFieldExpression><![CDATA[$F{${c.field}}]]></textFieldExpression>\n\t\t\t</textField>`;
      x += c.width;
      return cell;
    })
    .join('\n');
  const dataSource =
    o.source === 'json'
      ? `((net.sf.jasperreports.engine.data.JsonDataSource) $P{REPORT_DATA_SOURCE}).subDataSource("${esc(o.listField)}")`
      : `new net.sf.jasperreports.engine.data.JRBeanCollectionDataSource($F{${esc(o.listField)}})`;
  return {
    declarations: `<subDataset name="${esc(o.dataset)}">\n${fields}\n</subDataset>`,
    element: `<componentElement>\n\t<reportElement x="0" y="0" width="${o.width}" height="20"/>\n\t<jr:list ${COMPONENTS_NS} printOrder="Vertical">\n\t\t<datasetRun subDataset="${esc(o.dataset)}">\n\t\t\t<dataSourceExpression><![CDATA[${dataSource}]]></dataSourceExpression>\n\t\t</datasetRun>\n\t\t<jr:listContents height="20" width="${o.width}">\n${cells}\n\t\t</jr:listContents>\n\t</jr:list>\n</componentElement>`,
    note: 'A list repeats its contents once per record; unlike a table it has no header row.',
  };
}

export function barcodeSnippet(kind: 'qr' | 'code128' | 'ean13', expression: string, size: number): { element: string; note: string } {
  if (kind === 'qr')
    return {
      element: `<componentElement>\n\t<reportElement x="0" y="0" width="${size}" height="${size}"/>\n\t<jr:QRCode ${COMPONENTS_NS} errorCorrectionLevel="M" margin="0">\n\t\t<jr:codeExpression><![CDATA[${expression}]]></jr:codeExpression>\n\t</jr:QRCode>\n</componentElement>`,
      note: 'QR codes need the ZXing library (com.google.zxing:core) on the classpath.',
    };
  const type = kind === 'code128' ? 'Code128' : 'EAN13';
  return {
    element: `<componentElement>\n\t<reportElement x="0" y="0" width="${size * 2}" height="${Math.round(size / 1.5)}"/>\n\t<jr:${type} ${COMPONENTS_NS} textPosition="bottom" moduleWidth="1.2">\n\t\t<jr:codeExpression><![CDATA[${expression}]]></jr:codeExpression>\n\t</jr:${type}>\n</componentElement>`,
    note: `${type} barcodes use Barcode4J (net.sf.barcode4j:barcode4j). EAN-13 needs exactly 12 or 13 digits.`,
  };
}

export interface SubreportOptions {
  file: string;
  source: 'json' | 'beans' | 'connection';
  listField: string;
  parameters: string[];
  height: number;
  width: number;
}

export function subreportSnippet(o: SubreportOptions): { element: string; note: string } {
  const params = o.parameters
    .filter(Boolean)
    .map((p) => `\t<subreportParameter name="${esc(p)}">\n\t\t<subreportParameterExpression><![CDATA[$P{${esc(p)}}]]></subreportParameterExpression>\n\t</subreportParameter>`)
    .join('\n');
  const source =
    o.source === 'connection'
      ? '\t<connectionExpression><![CDATA[$P{REPORT_CONNECTION}]]></connectionExpression>'
      : o.source === 'json'
        ? `\t<dataSourceExpression><![CDATA[((net.sf.jasperreports.engine.data.JsonDataSource) $P{REPORT_DATA_SOURCE}).subDataSource("${esc(o.listField)}")]]></dataSourceExpression>`
        : `\t<dataSourceExpression><![CDATA[new net.sf.jasperreports.engine.data.JRBeanCollectionDataSource($F{${esc(o.listField)}})]]></dataSourceExpression>`;
  return {
    element: `<subreport isRunToBottom="false">\n\t<reportElement positionType="Float" x="0" y="0" width="${o.width}" height="${o.height}" isRemoveLineWhenBlank="true"/>\n${params ? params + '\n' : ''}${source}\n\t<subreportExpression><![CDATA["${esc(o.file.replace(/\.jrxml$/i, '.jasper'))}"]]></subreportExpression>\n</subreport>`,
    note: 'positionType="Float" lets elements below move down when the subreport grows. Compile the subreport to .jasper, or pass it as a parameter of type JasperReport. For a header that repeats on every page inside the subreport, put it in its columnHeader band, or in a group header with isReprintHeaderOnEachPage="true".',
  };
}
