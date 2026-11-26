/**
 * Plain text, Markdown and JSON to a styled PDF, laid out with pdf-lib: headings, paragraphs, lists,
 * code blocks, quotes, rules and tables, with wrapping, page breaks and page numbers.
 * The built-in PDF fonts cover Latin text only; other scripts use the browser's "Save as PDF" instead.
 */
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; rows: string[][] };

export interface PdfStyle {
  size: 'A4' | 'Letter';
  fontSize: number;
  title: string;
  pageNumbers: boolean;
}

// ---------- input to blocks ----------

interface MdToken {
  type: string;
  text?: string;
  raw?: string;
  depth?: number;
  ordered?: boolean;
  items?: MdToken[];
  tokens?: MdToken[];
  header?: { text: string }[];
  rows?: { text: string }[][];
}

/** Inline Markdown to plain text (links keep their text, code spans keep their content). */
function inlineText(tokens: MdToken[] | undefined, fallback = ''): string {
  if (!tokens?.length) return fallback;
  return tokens.map((t) => (t.tokens ? inlineText(t.tokens, t.text) : t.type === 'br' ? ' ' : (t.text ?? ''))).join('');
}

export async function markdownToBlocks(markdown: string): Promise<Block[]> {
  const { marked } = await import('marked');
  const blocks: Block[] = [];
  const walk = (tokens: MdToken[]) => {
    for (const t of tokens) {
      switch (t.type) {
        case 'heading':
          blocks.push({ kind: 'heading', level: t.depth ?? 1, text: inlineText(t.tokens, t.text) });
          break;
        case 'paragraph':
        case 'text':
          blocks.push({ kind: 'paragraph', text: inlineText(t.tokens, t.text) });
          break;
        case 'list':
          blocks.push({ kind: 'list', ordered: !!t.ordered, items: (t.items ?? []).map((i) => inlineText(i.tokens, i.text).replace(/\s*\n\s*/g, ' ')) });
          break;
        case 'code':
          blocks.push({ kind: 'code', text: t.text ?? '' });
          break;
        case 'blockquote':
          blocks.push({ kind: 'quote', text: (t.tokens ?? []).map((q) => inlineText(q.tokens, q.text)).join(' ') });
          break;
        case 'hr':
          blocks.push({ kind: 'rule' });
          break;
        case 'table':
          blocks.push({ kind: 'table', rows: [(t.header ?? []).map((h) => h.text), ...(t.rows ?? []).map((r) => r.map((c) => c.text))] });
          break;
        case 'html':
          if (t.text?.trim()) blocks.push({ kind: 'paragraph', text: t.text.replace(/<[^>]+>/g, '').trim() });
          break;
      }
    }
  };
  walk(marked.lexer(markdown) as unknown as MdToken[]);
  return blocks;
}

export function textToBlocks(text: string, monospace: boolean): Block[] {
  if (monospace) return [{ kind: 'code', text }];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ kind: 'paragraph' as const, text: p.replace(/\s*\n\s*/g, ' ') }));
}

/** JSON as a pretty code block; an array of flat objects also becomes a table. Throws on invalid JSON. */
export function jsonToBlocks(json: string): Block[] {
  const value: unknown = JSON.parse(json);
  const blocks: Block[] = [];
  if (Array.isArray(value) && value.length && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
    const keys = [...new Set(value.flatMap((v) => Object.keys(v as object)))].slice(0, 8);
    const flat = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    blocks.push({ kind: 'heading', level: 2, text: `${value.length} records` });
    blocks.push({ kind: 'table', rows: [keys, ...value.slice(0, 500).map((v) => keys.map((k) => flat((v as Record<string, unknown>)[k])))] });
    blocks.push({ kind: 'heading', level: 2, text: 'JSON' });
  }
  blocks.push({ kind: 'code', text: JSON.stringify(value, null, 2) });
  return blocks;
}

// ---------- layout ----------

/** Characters the standard PDF fonts can draw (WinAnsi); others become "?". */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\t/g, '    ')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');
}

export function hasUnsupportedCharacters(text: string): boolean {
  return /[^\x09\x0a\x0d\x20-\x7e\xa0-\xff‘’“”–—…]/.test(text);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = word.trimStart();
      // A single word longer than the line: cut it.
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export async function blocksToPdf(blocks: readonly Block[], style: PdfStyle): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  if (style.title) doc.setTitle(style.title);
  doc.setProducer('DevTools24');
  const fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const [pageW, pageH] = style.size === 'A4' ? [595.28, 841.89] : [612, 792];
  const margin = 56;
  const width = pageW - margin * 2;
  const base = style.fontSize;
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const brand = rgb(0.31, 0.27, 0.9);
  const shade = rgb(0.95, 0.96, 0.98);
  let page: PDFPage = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    y = pageH - margin;
  };
  const need = (h: number) => {
    if (y - h < margin) newPage();
  };
  const lines = (text: string, font: PDFFont, size: number, x: number, w: number, color: RGB, lead = 1.4) => {
    for (const line of wrap(pdfSafe(text), font, size, w)) {
      need(size * lead);
      y -= size * lead;
      page.drawText(line, { x, y: y + size * 0.3, size, font, color });
    }
  };

  if (style.title) {
    lines(style.title, fonts.bold, base * 1.9, margin, width, brand, 1.3);
    y -= base * 0.6;
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1, color: brand });
    y -= base;
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        const size = base * ([0, 1.7, 1.4, 1.2, 1.08, 1, 1][block.level] ?? 1);
        need(size * 3);
        y -= size * 0.5;
        lines(block.text, fonts.bold, size, margin, width, block.level <= 2 ? brand : ink, 1.3);
        y -= size * 0.3;
        break;
      }
      case 'paragraph':
        lines(block.text, fonts.body, base, margin, width, ink);
        y -= base * 0.7;
        break;
      case 'quote': {
        const top = y;
        lines(block.text, fonts.italic, base, margin + 14, width - 14, muted);
        page.drawLine({ start: { x: margin + 3, y: top - 2 }, end: { x: margin + 3, y: y + 2 }, thickness: 2.5, color: brand });
        y -= base * 0.7;
        break;
      }
      case 'list':
        block.items.forEach((item, i) => {
          const marker = block.ordered ? `${i + 1}.` : '•';
          need(base * 1.4);
          page.drawText(block.ordered ? marker : '-', { x: margin + 4, y: y - base * 1.4 + base * 0.3, size: base, font: block.ordered ? fonts.body : fonts.bold, color: brand });
          lines(item, fonts.body, base, margin + 22, width - 22, ink);
        });
        y -= base * 0.6;
        break;
      case 'code': {
        const size = base * 0.86;
        const codeLines = wrap(pdfSafe(block.text), fonts.mono, size, width - 16);
        for (let i = 0; i < codeLines.length; ) {
          need(size * 1.35 + 12);
          const room = Math.max(1, Math.floor((y - margin - 12) / (size * 1.35)));
          const chunk = codeLines.slice(i, i + room);
          const h = chunk.length * size * 1.35 + 12;
          page.drawRectangle({ x: margin, y: y - h, width, height: h, color: shade });
          y -= 6;
          for (const line of chunk) {
            y -= size * 1.35;
            page.drawText(line, { x: margin + 8, y: y + size * 0.3, size, font: fonts.mono, color: ink });
          }
          y -= 6;
          i += chunk.length;
          if (i < codeLines.length) newPage();
        }
        y -= base * 0.7;
        break;
      }
      case 'rule':
        need(base);
        y -= base * 0.5;
        page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.6, color: muted });
        y -= base * 0.5;
        break;
      case 'table': {
        const cols = Math.max(1, ...block.rows.map((r) => r.length));
        const colW = width / cols;
        const size = base * 0.86;
        const drawRow = (row: string[], header: boolean) => {
          const cells = Array.from({ length: cols }, (_, c) => wrap(pdfSafe(row[c] ?? ''), header ? fonts.bold : fonts.body, size, colW - 8));
          const h = Math.max(...cells.map((c) => c.length)) * size * 1.3 + 8;
          need(h);
          if (header) page.drawRectangle({ x: margin, y: y - h, width, height: h, color: shade });
          cells.forEach((cell, c) =>
            cell.forEach((line, l) =>
              page.drawText(line, { x: margin + c * colW + 4, y: y - 4 - (l + 1) * size * 1.3 + size * 0.3, size, font: header ? fonts.bold : fonts.body, color: ink }),
            ),
          );
          y -= h;
          page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.4, color: muted });
        };
        block.rows.forEach((row, i) => drawRow(row, i === 0));
        y -= base * 0.8;
        break;
      }
    }
  }

  if (style.pageNumbers) {
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      p.drawText(label, { x: pageW / 2 - fonts.body.widthOfTextAtSize(label, 8) / 2, y: margin / 2, size: 8, font: fonts.body, color: muted });
    });
  }
  return doc.save({ useObjectStreams: true });
}

/** Styled HTML of the same blocks, for the preview and for the browser's "Save as PDF". */
export function blocksToHtml(blocks: readonly Block[], title: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case 'heading':
          return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
        case 'paragraph':
          return `<p>${esc(b.text)}</p>`;
        case 'quote':
          return `<blockquote>${esc(b.text)}</blockquote>`;
        case 'list':
          return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
        case 'code':
          return `<pre>${esc(b.text)}</pre>`;
        case 'rule':
          return '<hr>';
        case 'table':
          return `<table>${b.rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
      }
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Document')}</title><style>
body{font:14px/1.55 -apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari",sans-serif;color:#1a1f29;max-width:760px;margin:32px auto;padding:0 24px}
h1,h2{color:#4f46e5}h1.title{border-bottom:2px solid #4f46e5;padding-bottom:8px}
pre{background:#f2f4f8;padding:10px 12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
blockquote{border-left:3px solid #4f46e5;margin:0;padding-left:12px;color:#5b6270;font-style:italic}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #d5d9e0;padding:6px;text-align:left;vertical-align:top}th{background:#f2f4f8}
@page{margin:18mm}
</style></head><body>${title ? `<h1 class="title">${esc(title)}</h1>` : ''}${body}</body></html>`;
}
