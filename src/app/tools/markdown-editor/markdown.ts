/** Markdown to safe HTML (marked + DOMPurify) and Markdown tables from spreadsheet or CSV data. */

let libs: Promise<[typeof import('marked'), typeof import('dompurify')]> | undefined;

/** GitHub-flavoured Markdown as HTML, with scripts and event handlers removed. */
export async function renderMarkdown(markdown: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await (libs ??= Promise.all([import('marked'), import('dompurify')]));
  const html = await marked.parse(markdown, { gfm: true, breaks: false });
  return DOMPurify.sanitize(html);
}

export type Align = 'left' | 'center' | 'right' | 'none';

/** Rows of cells from text copied out of Excel or Google Sheets (tabs) or CSV. */
export function parseCells(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const tabs = lines.some((l) => l.includes('\t'));
  if (tabs) return lines.map((l) => l.split('\t'));
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted && c === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) cells.push(cell), (cell = '');
      else cell += c;
    }
    cells.push(cell);
    return cells;
  });
}

/** A Markdown table with the first row as header, padded so it also reads well as plain text. */
export function toMarkdownTable(rows: string[][], align: Align = 'none'): string {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const clean = rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
  const widths = Array.from({ length: width }, (_, i) => Math.max(3, ...clean.map((r) => r[i].length)));
  const line = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  const rule = widths.map((w) => {
    const dashes = '-'.repeat(w);
    return align === 'left' ? `:${dashes.slice(1)}` : align === 'right' ? `${dashes.slice(1)}:` : align === 'center' ? `:${dashes.slice(2)}:` : dashes;
  });
  return [line(clean[0]), `| ${rule.join(' | ')} |`, ...clean.slice(1).map(line)].join('\n') + '\n';
}
