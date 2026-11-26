/** Expression recipes for JasperReports, and a checker for hand-written expressions. */

export interface Recipe {
  id: string;
  title: string;
  /** What the inputs mean. */
  inputs: { key: string; label: string; value: string }[];
  /** The expression (Java) or XML snippet. */
  build(v: Record<string, string>): { code: string; xml?: boolean; note?: string };
}

const f = (name: string) => `$F{${name || 'field'}}`;

export const RECIPES: readonly Recipe[] = [
  {
    id: 'date',
    title: 'Format a date',
    inputs: [
      { key: 'field', label: 'Date field', value: 'orderDate' },
      { key: 'pattern', label: 'Pattern', value: 'dd MMM yyyy' },
    ],
    build: (v) => ({
      code: `${f(v['field'])} == null ? "" : new java.text.SimpleDateFormat("${v['pattern']}").format(${f(v['field'])})`,
      note: `Simpler: keep $F{${v['field']}} as the expression and set pattern="${v['pattern']}" on the textField.`,
    }),
  },
  {
    id: 'currency',
    title: 'Indian rupee amount (₹ 1,23,456.00)',
    inputs: [{ key: 'field', label: 'Amount field', value: 'amount' }],
    build: (v) => ({
      code: `${f(v['field'])} == null ? "-" : java.text.NumberFormat.getCurrencyInstance(new java.util.Locale("en", "IN")).format(${f(v['field'])})`,
      note: 'With pattern="¤ #,##0.00" and REPORT_LOCALE set to en_IN you get the same without code.',
    }),
  },
  {
    id: 'decimals',
    title: 'Number with 2 decimals',
    inputs: [{ key: 'field', label: 'Number field', value: 'price' }],
    build: (v) => ({ code: `String.format("%.2f", ${f(v['field'])})`, note: 'Or: expression $F{..} with pattern="#,##0.00" (adds thousands separators too).' }),
  },
  {
    id: 'nullsafe',
    title: 'Show "-" when empty (null-safe)',
    inputs: [
      { key: 'field', label: 'Field', value: 'remarks' },
      { key: 'fallback', label: 'Show instead', value: '-' },
    ],
    build: (v) => ({ code: `${f(v['field'])} == null || ${f(v['field'])}.toString().trim().isEmpty() ? "${v['fallback']}" : ${f(v['field'])}.toString()` }),
  },
  {
    id: 'concat',
    title: 'Join fields (full name, address)',
    inputs: [
      { key: 'a', label: 'First field', value: 'firstName' },
      { key: 'b', label: 'Second field', value: 'lastName' },
      { key: 'sep', label: 'Between them', value: ' ' },
    ],
    build: (v) => ({ code: `(${f(v['a'])} == null ? "" : ${f(v['a'])}) + "${v['sep']}" + (${f(v['b'])} == null ? "" : ${f(v['b'])})` }),
  },
  {
    id: 'condition',
    title: 'Value depending on a condition',
    inputs: [
      { key: 'field', label: 'Field', value: 'status' },
      { key: 'equals', label: 'When it equals', value: 'PAID' },
      { key: 'yes', label: 'Show', value: 'Paid' },
      { key: 'no', label: 'Otherwise show', value: 'Due' },
    ],
    build: (v) => ({ code: `"${v['equals']}".equals(${f(v['field'])}) ? "${v['yes']}" : "${v['no']}"`, note: 'Putting the constant first ("PAID".equals(...)) avoids a NullPointerException when the field is null.' }),
  },
  {
    id: 'boolean',
    title: 'Boolean as Yes / No',
    inputs: [{ key: 'field', label: 'Boolean field', value: 'active' }],
    build: (v) => ({ code: `Boolean.TRUE.equals(${f(v['field'])}) ? "Yes" : "No"` }),
  },
  {
    id: 'pages',
    title: 'Page X of Y (page footer)',
    inputs: [],
    build: () => ({
      xml: true,
      code: `<textField>\n\t<reportElement x="355" y="0" width="150" height="20"/>\n\t<textElement textAlignment="Right"/>\n\t<textFieldExpression><![CDATA["Page " + $V{PAGE_NUMBER} + " of"]]></textFieldExpression>\n</textField>\n<textField evaluationTime="Report">\n\t<reportElement x="505" y="0" width="50" height="20"/>\n\t<textFieldExpression><![CDATA[" " + $V{PAGE_NUMBER}]]></textFieldExpression>\n</textField>`,
      note: 'Two text fields: the second has evaluationTime="Report", so it shows the last page number, which is the total.',
    }),
  },
  {
    id: 'conditional-style',
    title: 'Red text when a value is negative (conditional style)',
    inputs: [{ key: 'field', label: 'Number field', value: 'balance' }],
    build: (v) => ({
      xml: true,
      code: `<style name="NegativeRed">\n\t<conditionalStyle>\n\t\t<conditionExpression><![CDATA[${f(v['field'])} != null && ${f(v['field'])}.doubleValue() < 0]]></conditionExpression>\n\t\t<style forecolor="#DC2626" isBold="true"/>\n\t</conditionalStyle>\n</style>`,
      note: 'Put the <style> near the top of the report, then add style="NegativeRed" to the textField.',
    }),
  },
  {
    id: 'zebra',
    title: 'Striped rows (alternate background)',
    inputs: [],
    build: () => ({
      xml: true,
      code: `<style name="Zebra" mode="Transparent">\n\t<conditionalStyle>\n\t\t<conditionExpression><![CDATA[$V{REPORT_COUNT} % 2 == 0]]></conditionExpression>\n\t\t<style mode="Opaque" backcolor="#F3F4F6"/>\n\t</conditionalStyle>\n</style>\n<!-- In the detail band, behind the row: -->\n<frame>\n\t<reportElement style="Zebra" x="0" y="0" width="555" height="20"/>\n</frame>`,
    }),
  },
  {
    id: 'printwhen',
    title: 'Print an element only when a field has a value',
    inputs: [{ key: 'field', label: 'Field', value: 'discount' }],
    build: (v) => ({ xml: true, code: `<reportElement x="0" y="0" width="200" height="20">\n\t<printWhenExpression><![CDATA[${f(v['field'])} != null]]></printWhenExpression>\n</reportElement>` }),
  },
  {
    id: 'rownumber',
    title: 'Row number (1, 2, 3…)',
    inputs: [],
    build: () => ({ code: '$V{REPORT_COUNT}', note: 'Use $V{<group>_COUNT} to restart numbering for each group.' }),
  },
];

export interface Hint {
  level: 'error' | 'warning' | 'tip';
  message: string;
}

/** Common mistakes in hand-written expressions. */
export function checkExpression(expression: string, language: 'java' | 'groovy'): Hint[] {
  const hints: Hint[] = [];
  const e = expression.trim();
  if (!e) return hints;
  const noStrings = e.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if ((e.replace(/\\"/g, '').match(/"/g) ?? []).length % 2) hints.push({ level: 'error', message: 'A text quote (") is not closed.' });
  const open = (noStrings.match(/\(/g) ?? []).length;
  const close = (noStrings.match(/\)/g) ?? []).length;
  if (open !== close) hints.push({ level: 'error', message: `Brackets do not match: ${open} "(" and ${close} ")".` });
  if (/\$[FPV]\{[^}]*$/.test(e) || /\$[FPV]\{\s*\}/.test(e)) hints.push({ level: 'error', message: 'A $F{…}, $P{…} or $V{…} reference is not closed or is empty.' });
  if (/\$[A-EG-OQ-UW-Z]\{/.test(e)) hints.push({ level: 'error', message: 'Only $F{field}, $P{parameter}, $V{variable} and $R{key} are valid references.' });
  if (language === 'java' && /'[^']{2,}'/.test(noStrings)) hints.push({ level: 'error', message: "Java text uses double quotes. 'abc' is only valid in Groovy." });
  if (language === 'java' && /\$F\{[^}]+\}\s*==\s*"|"\s*==\s*\$F\{/.test(e)) hints.push({ level: 'warning', message: 'In Java, == compares objects, not text. Use "TEXT".equals($F{field}) instead.' });
  const unsafe = /\$F\{([^}]+)\}\.(?!equals)\w+\(/.exec(e);
  if (unsafe && !new RegExp(`\\$F\\{${unsafe[1]}\\}\\s*(!=|==)\\s*null`).test(e)) hints.push({ level: 'warning', message: `$F{${unsafe[1]}}.${unsafe[0].split('.').pop()} fails with a NullPointerException when the field is empty. Check $F{${unsafe[1]}} != null first.` });
  if (/\$V\{PAGE_NUMBER\}/.test(e) && /\bof\b/i.test(e) && !/evaluationTime/.test(e)) hints.push({ level: 'tip', message: 'For "Page X of Y", the total needs a second text field with evaluationTime="Report" (see the Page X of Y recipe).' });
  if (/\/\s*\d+\b/.test(noStrings) && !/\.\d|double|BigDecimal|doubleValue/.test(noStrings)) hints.push({ level: 'tip', message: 'Dividing two whole numbers in Java drops the decimals (7 / 2 = 3). Use .doubleValue() or 2.0.' });
  if (language === 'groovy' && /\.equals\(/.test(e)) hints.push({ level: 'tip', message: 'In Groovy, == already compares text, so .equals() is optional.' });
  if (/new Date\(\)/.test(e) && !/java\.util\.Date/.test(e)) hints.push({ level: 'tip', message: 'Write new java.util.Date() unless java.util is imported in the report.' });
  return hints;
}
