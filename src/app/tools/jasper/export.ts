/** Turns filled pages into HTML or PDF, and record rows into CSV, Excel (.xlsx) or Word (.docx). */
import type { FilledPage, Item } from './fill';
import type { JrReport } from './jrxml';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const color = (c: string | null, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

function itemHtml(i: Item): string {
  const box = `left:${i.x}px;top:${i.y}px;width:${i.width}px;height:${i.height}px`;
  if (i.kind === 'line') {
    const horizontal = i.height <= 1 || i.width > i.height;
    return `<div style="position:absolute;${horizontal ? `left:${i.x}px;top:${i.y}px;width:${i.width}px;border-top:1px solid ${color(i.color, '#000')}` : `left:${i.x}px;top:${i.y}px;height:${i.height}px;border-left:1px solid ${color(i.color, '#000')}`}"></div>`;
  }
  if (i.kind === 'rectangle' || i.kind === 'ellipse' || i.kind === 'frame') {
    return `<div style="position:absolute;${box};background:${i.background ? color(i.background, 'transparent') : 'transparent'};${i.kind === 'ellipse' ? 'border-radius:50%;' : ''}${i.kind === 'frame' ? '' : 'border:1px solid ' + color(i.color, '#000') + ';'}box-sizing:border-box"></div>`;
  }
  if (i.kind === 'image' || i.kind === 'subreport' || i.kind === 'componentElement' || i.kind === 'other') {
    const label = i.kind === 'image' ? 'image' : i.kind === 'subreport' ? 'subreport' : 'component';
    return `<div style="position:absolute;${box};border:1px dashed #9ca3af;color:#6b7280;font:9px sans-serif;display:flex;align-items:center;justify-content:center;box-sizing:border-box">${label}</div>`;
  }
  const style = [
    'position:absolute',
    box,
    `font:${i.italic ? 'italic ' : ''}${i.bold ? 'bold ' : ''}${i.fontSize}px/1.2 'Helvetica Neue',Arial,sans-serif`,
    `color:${color(i.color, '#000')}`,
    `text-align:${i.align === 'Justified' ? 'justify' : i.align.toLowerCase()}`,
    'overflow:hidden',
    'white-space:pre-wrap',
    i.background ? `background:${color(i.background, 'transparent')}` : '',
    i.failed ? 'outline:1px dashed #dc2626' : '',
  ]
    .filter(Boolean)
    .join(';');
  return `<div style="${style}"${i.failed ? ` title="Could not evaluate: ${esc(i.failed)}"` : ''}>${esc(i.text)}</div>`;
}

/** Each page as a white sheet of the report's page size. */
export function pagesToHtml(pages: readonly FilledPage[], report: JrReport, standalone = false): string {
  const sheets = pages
    .map((p) => `<div class="jr-page" style="position:relative;width:${report.pageWidth}px;height:${report.pageHeight}px;background:#fff;margin:0 auto 16px;box-shadow:0 1px 4px rgba(0,0,0,.25);overflow:hidden">${p.items.map(itemHtml).join('')}</div>`)
    .join('\n');
  if (!standalone) return sheets;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.name)}</title><style>body{background:#e5e7eb;margin:0;padding:16px}@media print{body{background:none;padding:0}.jr-page{box-shadow:none!important;margin:0!important;page-break-after:always}}@page{size:${report.pageWidth}pt ${report.pageHeight}pt;margin:0}</style></head><body>${sheets}</body></html>`;
}

const pdfText = (s: string) =>
  s
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');

export async function pagesToPdf(pages: readonly FilledPage[], report: JrReport): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(report.name);
  doc.setProducer('DevTools24 JRXML preview');
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const toRgb = (hex: string | null, fallback: [number, number, number]) => {
    const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(...fallback);
  };
  for (const p of pages) {
    const page = doc.addPage([report.pageWidth, report.pageHeight]);
    const H = report.pageHeight;
    for (const i of p.items) {
      if (i.kind === 'line') {
        const horizontal = i.height <= 1 || i.width > i.height;
        page.drawLine({ start: { x: i.x, y: H - i.y }, end: horizontal ? { x: i.x + i.width, y: H - i.y } : { x: i.x, y: H - i.y - i.height }, thickness: 0.75, color: toRgb(i.color, [0, 0, 0]) });
        continue;
      }
      if (i.kind === 'rectangle' || i.kind === 'ellipse') {
        page.drawRectangle({ x: i.x, y: H - i.y - i.height, width: i.width, height: i.height, color: i.background ? toRgb(i.background, [1, 1, 1]) : undefined, borderColor: toRgb(i.color, [0, 0, 0]), borderWidth: 0.5 });
        continue;
      }
      if (i.kind !== 'staticText' && i.kind !== 'textField') continue;
      if (i.background) page.drawRectangle({ x: i.x, y: H - i.y - i.height, width: i.width, height: i.height, color: toRgb(i.background, [1, 1, 1]) });
      const font = i.bold && i.italic ? fonts.boldItalic : i.bold ? fonts.bold : i.italic ? fonts.italic : fonts.regular;
      const size = i.fontSize;
      let line = pdfText(i.text.split('\n')[0]);
      while (line && font.widthOfTextAtSize(line, size) > i.width) line = line.slice(0, -1);
      const w = font.widthOfTextAtSize(line, size);
      const x = i.align === 'Right' ? i.x + i.width - w : i.align === 'Center' ? i.x + (i.width - w) / 2 : i.x;
      page.drawText(line, { x, y: H - i.y - size, size, font, color: toRgb(i.color, [0, 0, 0]) });
    }
  }
  return doc.save({ useObjectStreams: true });
}

export function rowsToCsv(rows: readonly string[][]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

async function zip(files: Record<string, string>, type: string): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  return new Blob([zipSync(entries, { level: 6 }) as Uint8Array<ArrayBuffer>], { type });
}

const colName = (n: number) => {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** A one-sheet Excel workbook; numbers stay numbers, the header row is bold. */
export async function rowsToXlsx(rows: readonly string[][], sheetName = 'Report'): Promise<Blob> {
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          if (ri > 0 && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16) return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return zip(
    {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

/** A Word document with the report name as a heading and the rows as a table. */
export async function rowsToDocx(rows: readonly string[][], title: string): Promise<Blob> {
  const cell = (v: string, header: boolean) =>
    `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders>${header ? '<w:shd w:val="clear" w:fill="EEF0FF"/>' : ''}</w:tcPr><w:p><w:r>${header ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(v)}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rows.map((r, i) => `<w:tr>${r.map((v) => cell(v, i === 0)).join('')}</w:tr>`).join('')}</w:tbl>`;
  return zip(
    {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${xml(title)}</w:t></w:r></w:p>${table}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}
