/** Shared helpers for the PDF tools: page ranges, opening PDFs, and text/table extraction. */

export const MAX_PDF_BYTES = 100 * 1024 * 1024;

/**
 * Reads "1-3, 5, 8-" into page numbers (1-based, in the order given, no repeats).
 * "8-" means page 8 to the last page; "-3" means pages 1 to 3. Throws with a readable message.
 */
export function parsePageRanges(text: string, pageCount: number): number[] {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter pages, for example 1-3, 5.');
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    const match = /^(\d*)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!match || (!match[1] && match[2] === undefined)) throw new Error(`"${part}" is not a page or range.`);
    const isRange = part.includes('-');
    const from = match[1] ? Number(match[1]) : 1;
    const to = isRange ? (match[2] ? Number(match[2]) : pageCount) : from;
    if (from < 1 || to < 1) throw new Error('Pages start at 1.');
    if (from > pageCount || to > pageCount) throw new Error(`This PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}; "${part}" is past the end.`);
    const step = from <= to ? 1 : -1;
    for (let n = from; step > 0 ? n <= to : n >= to; n += step) {
      if (!seen.has(n)) {
        seen.add(n);
        pages.push(n);
      }
    }
  }
  return pages;
}

/** Splits 1..pageCount into groups of `size` pages: [[1,2],[3,4],[5]]. */
export function chunkPages(pageCount: number, size: number): number[][] {
  const groups: number[][] = [];
  for (let start = 1; start <= pageCount; start += size) {
    groups.push(Array.from({ length: Math.min(size, pageCount - start + 1) }, (_, i) => start + i));
  }
  return groups;
}

/** Opens a PDF with pdf.js (loaded on first use). */
export async function openWithPdfjs(data: Uint8Array, password?: string) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data,
    password: password || undefined,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
  });
  return { task, pdf: await task.promise };
}

/** A piece of text on a page, from pdf.js: x/y in PDF points (y grows upwards), width in points. */
export interface TextPiece {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine {
  y: number;
  pieces: TextPiece[];
}

/** Groups pieces into lines (top to bottom), each line's pieces left to right. */
export function groupLines(pieces: readonly TextPiece[]): TextLine[] {
  const sorted = pieces.filter((p) => p.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];
  for (const piece of sorted) {
    const tolerance = Math.max(2, piece.height * 0.5);
    const line = lines.find((l) => Math.abs(l.y - piece.y) <= tolerance);
    if (line) line.pieces.push(piece);
    else lines.push({ y: piece.y, pieces: [piece] });
  }
  for (const line of lines) line.pieces.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** One line as text: pieces far apart get a space (or a tab when the gap looks like a column). */
export function lineText(line: TextLine, columnGap = 12): string {
  let out = '';
  let end: number | null = null;
  for (const piece of line.pieces) {
    if (end !== null) {
      const gap = piece.x - end;
      if (gap > columnGap) out += '\t';
      else if (gap > 1 && !out.endsWith(' ') && !piece.text.startsWith(' ')) out += ' ';
    }
    out += piece.text;
    end = piece.x + piece.width;
  }
  return out.replace(/ +/g, ' ').trimEnd();
}

/** Plain text of a page, line by line. */
export function pageText(pieces: readonly TextPiece[]): string {
  return groupLines(pieces)
    .map((l) => lineText(l).replace(/\t/g, '    '))
    .join('\n');
}

/**
 * Rows of cells: a new cell starts where the gap between pieces is wider than `columnGap` points.
 * Lines with a single cell are kept as one-cell rows, so headings stay in place.
 */
export function pageTable(pieces: readonly TextPiece[], columnGap = 12): string[][] {
  return groupLines(pieces).map((l) => lineText(l, columnGap).split('\t').map((c) => c.trim()));
}

/** CSV with quotes where needed (RFC 4180). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

/** Rows to objects using the first row with the most cells as the header. */
export function rowsToObjects(rows: readonly (readonly string[])[]): Record<string, string>[] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width < 2) return [];
  const headerIndex = rows.findIndex((r) => r.length === width);
  const header = rows[headerIndex].map((h, i) => h || `column${i + 1}`);
  return rows
    .slice(headerIndex + 1)
    .filter((r) => r.length >= 2)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
