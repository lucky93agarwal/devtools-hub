/** Builds sample PDFs for upload testing: N pages of text and tables, optionally padded to an exact size. */
import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage, RGB } from 'pdf-lib';

export interface DummyOptions {
  pages: number;
  size: 'A4' | 'Letter';
  content: 'text' | 'table' | 'both';
  /** Exact file size in bytes, or 0 to leave the natural size. */
  targetBytes: number;
  title: string;
}

const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(
    ' ',
  );

function sentence(seed: number, words = 14): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[(seed * 7 + i * 3) % WORDS.length]);
  const s = out.join(' ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawPage(page: PDFPage, font: PDFFont, bold: PDFFont, n: number, total: number, o: DummyOptions, rgb: (r: number, g: number, b: number) => RGB): void {
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  page.drawText(o.title || 'Sample document', { x: margin, y, size: 18, font: bold });
  y -= 22;
  page.drawText(`Page ${n} of ${total} · generated for testing by DevTools24`, { x: margin, y, size: 9, font });
  y -= 28;
  if (o.content !== 'table') {
    for (let p = 0; p < (o.content === 'both' ? 3 : 8) && y > 120; p++) {
      for (const line of wrap(`${sentence(n + p)} ${sentence(n * 3 + p, 18)} ${sentence(p + 5, 12)}`, font, 11, width - margin * 2)) {
        page.drawText(line, { x: margin, y, size: 11, font });
        y -= 15;
      }
      y -= 10;
    }
  }
  if (o.content !== 'text') {
    const cols = ['#', 'Item', 'Quantity', 'Price', 'Total'];
    const colX = [margin, margin + 40, margin + 220, margin + 320, margin + 420];
    const rowH = 20;
    page.drawRectangle({ x: margin - 4, y: y - 6, width: width - margin * 2 + 8, height: rowH, color: rgb(0.9, 0.91, 0.97) });
    cols.forEach((c, i) => page.drawText(c, { x: colX[i], y, size: 10, font: bold }));
    y -= rowH;
    for (let r = 1; y > margin + rowH; r++) {
      const qty = ((n * 13 + r * 7) % 9) + 1;
      const price = (((n * 31 + r * 17) % 900) + 100) / 10;
      const cells = [String(r), `Sample item ${n}-${r}`, String(qty), price.toFixed(2), (qty * price).toFixed(2)];
      cells.forEach((c, i) => page.drawText(c, { x: colX[i], y, size: 10, font }));
      page.drawLine({ start: { x: margin - 4, y: y - 6 }, end: { x: width - margin + 4, y: y - 6 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
      y -= rowH;
      if (o.content === 'both' && r >= 14) break;
    }
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 65536) crypto.getRandomValues(bytes.subarray(i, Math.min(length, i + 65536)));
  return bytes;
}

/** Makes the PDF. With a target size, random (incompressible) data is added in an unused object until the file hits it. */
export async function makeDummyPdf(o: DummyOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const build = async (padding: number): Promise<Uint8Array> => {
    const doc: PDFDocumentType = await PDFDocument.create();
    doc.setTitle(o.title || 'Sample document');
    doc.setProducer('DevTools24 dummy PDF generator');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let n = 1; n <= o.pages; n++) drawPage(doc.addPage([...PAGE_SIZES[o.size]] as [number, number]), font, bold, n, o.pages, o, rgb);
    if (padding > 0) doc.context.register(doc.context.stream(randomBytes(padding)));
    return doc.save({ useObjectStreams: false });
  };
  let bytes = await build(0);
  if (!o.targetBytes || o.targetBytes <= bytes.length) return bytes;
  // The padding object itself adds a few bytes of header; two passes land on the exact size.
  let padding = o.targetBytes - bytes.length;
  for (let pass = 0; pass < 3; pass++) {
    bytes = await build(padding);
    const diff = o.targetBytes - bytes.length;
    if (diff === 0) break;
    padding += diff;
  }
  return bytes;
}
