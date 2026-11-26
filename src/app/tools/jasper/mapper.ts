/** Builds JRXML <field>, <parameter>, <variable> and <queryString> tags from a JSON payload or an SQL query. */

export interface Mapped {
  name: string;
  className: string;
  description?: string;
  note?: string;
}

export interface MapResult {
  parameters: Mapped[];
  fields: Mapped[];
  variables: { name: string; className: string; calculation: string; expression: string }[];
  query?: string;
  notes: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** The Java class JasperReports should use for a sample value. */
export function javaClass(value: unknown, name = ''): string {
  if (typeof value === 'boolean') return 'java.lang.Boolean';
  if (typeof value === 'number') {
    // Money is BigDecimal even when the sample happens to be whole (JSON turns 25000.0 into 25000).
    if (/amount|price|total|cost|tax|balance|salary|fee/i.test(name)) return 'java.math.BigDecimal';
    if (Number.isInteger(value)) return Math.abs(value) > 2_147_483_647 ? 'java.lang.Long' : 'java.lang.Integer';
    return /amount|price|total|cost|tax|balance|salary|fee|rate/i.test(name) ? 'java.math.BigDecimal' : 'java.lang.Double';
  }
  if (typeof value === 'string' && ISO_DATE.test(value)) return value.length > 10 ? 'java.sql.Timestamp' : 'java.util.Date';
  if (Array.isArray(value)) return 'java.util.List';
  return 'java.lang.String';
}

/** "customer.address.city" → "customerAddressCity". */
const fieldName = (path: string) => path.replace(/[^\w.]/g, '_').replace(/\.(\w)/g, (_m, c: string) => c.toUpperCase());

export function mapJson(text: string): MapResult {
  const value: unknown = JSON.parse(text);
  const notes: string[] = [];
  const parameters: Mapped[] = [];
  let sample: unknown = value;
  let recordsPath = '';
  if (Array.isArray(value)) {
    sample = value[0] ?? {};
    notes.push(`The JSON is an array of ${value.length} record${value.length === 1 ? '' : 's'}; each becomes one detail row.`);
  } else if (value && typeof value === 'object') {
    // An envelope like {"invoiceNo": 1, "items": [...]}: scalars become parameters, the first array of objects the records.
    const entries = Object.entries(value as Record<string, unknown>);
    const list = entries.find(([, v]) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    if (list) {
      recordsPath = list[0];
      sample = (list[1] as unknown[])[0];
      for (const [k, v] of entries) if (k !== recordsPath && (v === null || typeof v !== 'object')) parameters.push({ name: fieldName(k), className: javaClass(v, k) });
      notes.push(`Records come from "${recordsPath}" (use it as the JSON data source select expression). Other top-level values became parameters.`);
    }
  }
  if (!sample || typeof sample !== 'object') throw new Error('Paste a JSON object or an array of objects.');

  const fields: Mapped[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [key, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) walk(v as Record<string, unknown>, path, depth + 1);
      else {
        const className = javaClass(v, key);
        fields.push({
          name: fieldName(path),
          className,
          description: path,
          note: Array.isArray(v) ? 'List: show it with a subreport or a table component (see the Snippet Builder).' : v === null ? 'Sample value is null; String assumed.' : undefined,
        });
      }
    }
  };
  walk(sample as Record<string, unknown>, '', 0);
  const variables = fields
    .filter((f) => /Integer|Long|Double|BigDecimal/.test(f.className) && !/(^|\.)(id|.*Id)$/i.test(f.description ?? f.name))
    .map((f) => ({ name: `TOTAL_${f.name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`, className: f.className === 'java.lang.Integer' ? 'java.lang.Long' : f.className, calculation: 'Sum', expression: `$F{${f.name}}` }));
  return { parameters, fields, variables, notes };
}

/** Splits on commas that are not inside brackets or quotes. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

function guessSqlClass(name: string, expression: string): string {
  const n = name.toLowerCase();
  const e = expression.toLowerCase();
  if (/^count\(/.test(e)) return 'java.lang.Long';
  if (/^(sum|avg)\(/.test(e) || /amount|price|total|cost|tax|balance|salary|fee|rate/.test(n)) return 'java.math.BigDecimal';
  if (/^(is|has)_|^(is|has)[A-Z]|active|enabled|flag/.test(name)) return 'java.lang.Boolean';
  if (/(_at|_on|date|time|created|updated)$/.test(n) || /^(now|current_date|current_timestamp)/.test(e)) return 'java.sql.Timestamp';
  if (/(^id$|_id$|Id$|count|qty|quantity|number|no$)/.test(name)) return 'java.lang.Integer';
  return 'java.lang.String';
}

export function mapSql(sql: string): MapResult {
  const clean = sql.trim().replace(/;\s*$/, '');
  const select = /^\s*select\s+(distinct\s+)?([\s\S]+?)\s+from\s+/i.exec(clean);
  if (!select) throw new Error('Paste a SELECT … FROM … query.');
  const notes: string[] = [];
  const fields: Mapped[] = [];
  for (const item of splitTop(select[2])) {
    if (item === '*' || /\.\*$/.test(item)) {
      notes.push(`"${item}" cannot be mapped: list the columns you need instead of *.`);
      continue;
    }
    const alias = /\s+(?:as\s+)?["`[]?([A-Za-z_]\w*)["`\]]?\s*$/i.exec(item);
    const plain = /(?:^|\.)["`[]?([A-Za-z_]\w*)["`\]]?$/.exec(item);
    const name = alias && /\s/.test(item.trim()) ? alias[1] : plain?.[1];
    if (!name) {
      notes.push(`Give "${item}" an alias (… AS name) so it can be a field.`);
      continue;
    }
    fields.push({ name, className: guessSqlClass(name, item) });
  }
  // Parameters: $P{x}, :name and ? placeholders.
  const parameters: Mapped[] = [];
  const add = (name: string, context: string) => {
    if (!parameters.some((p) => p.name === name)) parameters.push({ name, className: guessSqlClass(name, context) });
  };
  for (const m of clean.matchAll(/\$P!?\{(\w+)\}/g)) add(m[1], '');
  let query = clean.replace(/(?<![:\w]):([A-Za-z_]\w*)/g, (_m, name: string) => {
    add(name, '');
    return `$P{${name}}`;
  });
  let index = 0;
  query = query.replace(/\?/g, () => {
    const name = `PARAM_${++index}`;
    add(name, '');
    return `$P{${name}}`;
  });
  if (index) notes.push(`${index} "?" placeholder${index === 1 ? ' was' : 's were'} named PARAM_1… Rename them to something meaningful.`);
  return { parameters, fields, variables: [], query, notes };
}

const attr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function toXml(result: MapResult, withDetailBand: boolean, columnWidth = 555): string {
  const lines: string[] = [];
  for (const p of result.parameters) lines.push(`<parameter name="${attr(p.name)}" class="${p.className}"/>`);
  if (result.query) lines.push(`<queryString>\n\t<![CDATA[${result.query}]]>\n</queryString>`);
  for (const f of result.fields) {
    const comment = f.note ? `<!-- ${f.note.replace(/--/g, '-')} -->\n` : '';
    lines.push(f.description && f.description !== f.name ? `${comment}<field name="${attr(f.name)}" class="${f.className}">\n\t<fieldDescription><![CDATA[${f.description}]]></fieldDescription>\n</field>` : `${comment}<field name="${attr(f.name)}" class="${f.className}"/>`);
  }
  for (const v of result.variables) lines.push(`<variable name="${attr(v.name)}" class="${v.className}" calculation="${v.calculation}">\n\t<variableExpression><![CDATA[${v.expression}]]></variableExpression>\n</variable>`);
  if (withDetailBand && result.fields.length) {
    const shown = result.fields.filter((f) => f.className !== 'java.util.List').slice(0, 8);
    const width = Math.floor(columnWidth / shown.length);
    const header = shown.map((f, i) => `\t\t<staticText>\n\t\t\t<reportElement x="${i * width}" y="0" width="${width}" height="20"/>\n\t\t\t<textElement><font isBold="true"/></textElement>\n\t\t\t<text><![CDATA[${f.description ?? f.name}]]></text>\n\t\t</staticText>`);
    const cells = shown.map((f, i) => {
      const pattern = /BigDecimal|Double/.test(f.className) ? ' pattern="#,##0.00"' : /Date|Timestamp/.test(f.className) ? ' pattern="dd/MM/yyyy"' : '';
      const align = /Integer|Long|Double|BigDecimal/.test(f.className) ? '\n\t\t\t<textElement textAlignment="Right"/>' : '';
      return `\t\t<textField isBlankWhenNull="true"${pattern}>\n\t\t\t<reportElement x="${i * width}" y="0" width="${width}" height="20"/>${align}\n\t\t\t<textFieldExpression><![CDATA[$F{${f.name}}]]></textFieldExpression>\n\t\t</textField>`;
    });
    lines.push(`<columnHeader>\n\t<band height="20">\n${header.join('\n')}\n\t</band>\n</columnHeader>`);
    lines.push(`<detail>\n\t<band height="20">\n${cells.join('\n')}\n\t</band>\n</detail>`);
  }
  return lines.join('\n');
}
