/**
 * AI JRXML generator: a description, an HTML/CSS layout or a picture of a sample report becomes a
 * JasperReports template. Public; limited per network (more for logged-in users).
 */
import { AI_MODEL, generate } from './ai';
import type { Env } from './env';
import { ApiError, clientIp, json, readJson } from './http';
import { currentUser, limit } from './services';

const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const MAX_IMAGE_BYTES = 1_500_000;

export const JRXML_RULES = `You write JasperReports 6.x JRXML templates. Output ONLY the XML, starting with <?xml version="1.0" encoding="UTF-8"?>, nothing before or after.
Rules:
- Root: <jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd" name="..." pageWidth pageHeight columnWidth leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">.
- Order inside the root: <style>, <parameter>, <queryString> (only if SQL is given), <field>, <variable>, then bands in this order: title, pageHeader, columnHeader, detail, columnFooter, pageFooter, summary. Each band section contains one <band height="N">.
- Declare every $F{name}, $P{name} and $V{name} you use, with a Java class (java.lang.String, java.lang.Integer, java.math.BigDecimal for money, java.util.Date for dates, java.lang.Boolean).
- Use only staticText, textField, line, rectangle and frame. Every element has <reportElement x y width height/>; x + width must not exceed columnWidth, and y + height must not exceed its band height.
- Text: <staticText><reportElement .../><textElement textAlignment="Left|Center|Right"><font size="10" isBold="true"/></textElement><text><![CDATA[...]]></text></staticText>.
- Values: <textField pattern="#,##0.00"><reportElement .../><textFieldExpression><![CDATA[$F{amount}]]></textFieldExpression></textField>. Use pattern="dd/MM/yyyy" for dates. Put isBlankWhenNull="true" on text fields.
- Repeating rows go in the detail band (one record per row, about 20px tall); column titles go in columnHeader.
- Totals: a <variable name="TOTAL_X" class="java.math.BigDecimal" calculation="Sum"><variableExpression><![CDATA[$F{x}]]></variableExpression></variable>, shown in the summary band.
- Page footer: "Page " + $V{PAGE_NUMBER} + " of" and a second textField with evaluationTime="Report" showing " " + $V{PAGE_NUMBER}.
- <style> elements take attributes only (name, forecolor, backcolor, mode, fontSize, isBold); never put <textElement>, <background> or <font> inside <style>.
- Do not add a <queryString> unless the request contains an SQL query.
- Use camelCase field names. Keep it clean and professional: header colours like #4F46E5, light rectangle backgrounds behind the column header.`;

/** The template from the model's answer (drops any text around it). */
export function extractJrxml(answer: string, keepQuery = false): string {
  const start = answer.search(/<\?xml|<jasperReport\b/);
  const end = answer.lastIndexOf('</jasperReport>');
  if (start < 0 || end < 0) throw new ApiError(502, 'The AI did not return a JRXML template. Please try again or add more detail.');
  let xml = answer.slice(start, end + '</jasperReport>'.length);
  // Elements JasperReports does not allow inside <style> (the model sometimes adds them).
  xml = xml.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_m, open: string, body: string, close: string) =>
    open + body.replace(/<textElement\b[\s\S]*?<\/textElement>|<textElement\b[^>]*\/>|<background\b[^>]*\/>|<font\b[^>]*\/>/g, '').replace(/\n\s*\n/g, '\n') + close,
  );
  if (!keepQuery) xml = xml.replace(/\s*<queryString>[\s\S]*?<\/queryString>/, '');
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

const FAKE_JRXML = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" name="generated" pageWidth="595" pageHeight="842" columnWidth="555" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
\t<field name="name" class="java.lang.String"/>
\t<title><band height="30"><staticText><reportElement x="0" y="0" width="555" height="30"/><text><![CDATA[Generated report]]></text></staticText></band></title>
\t<detail><band height="20"><textField><reportElement x="0" y="0" width="555" height="20"/><textFieldExpression><![CDATA[$F{name}]]></textFieldExpression></textField></band></detail>
</jasperReport>`;

export async function generateJrxml(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ mode?: string; text?: string; image?: string; page?: string; landscape?: boolean }>(request);
  const user = await currentUser(env, request);
  const key = user ? `jrxml-user:${user.user.id}` : `jrxml-ip:${clientIp(request)}`;
  await limit(env, key, user ? 40 : 10, 86_400_000, user ? 'You have used today\'s 40 AI generations. Please try again tomorrow.' : 'You have used today\'s 10 free AI generations. Log in for more, or try again tomorrow.');

  const mode = body.mode === 'html' || body.mode === 'image' ? body.mode : 'text';
  const text = typeof body.text === 'string' ? body.text.slice(0, 12_000).trim() : '';
  const [w, h] = body.page === 'Letter' ? [612, 792] : body.page === 'A5' ? [420, 595] : [595, 842];
  const [pageWidth, pageHeight] = body.landscape ? [h, w] : [w, h];
  const page = `Page: pageWidth="${pageWidth}" pageHeight="${pageHeight}" columnWidth="${pageWidth - 40}"${body.landscape ? ' orientation="Landscape"' : ''}.`;

  let request_: string;
  if (mode === 'image') {
    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? '');
    if (!match) throw new ApiError(400, 'Upload a PNG, JPG or WebP picture of the report.');
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'The picture is too big. Use one under 1.5 MB.');
    let description = '';
    if (env.AI_FAKE === '1') description = 'An invoice with a title, a table of items and a total.';
    else {
      if (!env.AI) throw new ApiError(503, 'AI is not available right now.');
      try {
        const seen = (await (env.AI as unknown as { run(m: string, i: unknown): Promise<{ description?: string; response?: string }> }).run(VISION_MODEL, {
          image: [...bytes],
          prompt: 'Describe this report or invoice layout in detail for rebuilding it: the title and header text, every column heading of the table from left to right, the kind of data in each column (text, number, money, date), and any totals, footers or logos. Be precise and complete.',
          max_tokens: 600,
        })) as { description?: string; response?: string };
        description = (seen.description ?? seen.response ?? '').trim();
      } catch (e) {
        console.error('vision', e);
        throw new ApiError(502, 'The picture could not be read right now. Please describe the report in words instead.');
      }
    }
    request_ = `Build a JRXML template that reproduces this report layout (described from a picture):\n${description}\n${text ? `Extra notes: ${text}\n` : ''}${page}`;
  } else {
    if (!text) throw new ApiError(400, mode === 'html' ? 'Paste the HTML and CSS of the layout.' : 'Describe the report you need.');
    request_ =
      mode === 'html'
        ? `Convert this HTML/CSS layout into an equivalent JRXML template. Repeating table rows become the detail band with fields; fixed headings become static text. ${page}\n\n${text}`
        : `Create a JRXML template for this report: ${text}\n${page}`;
  }

  if (env.AI_FAKE === '1') return json({ jrxml: FAKE_JRXML, model: 'fake' });
  const answer = await generate(env, JRXML_RULES, request_, 3500);
  return json({ jrxml: extractJrxml(answer, /\bselect\b[\s\S]+\bfrom\b/i.test(text)), model: AI_MODEL });
}
