import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { blocksToHtml, blocksToPdf, hasUnsupportedCharacters, jsonToBlocks, markdownToBlocks, pdfSafe, textToBlocks } from './text-pdf';

const style = { size: 'A4' as const, fontSize: 11, title: 'Readme', pageNumbers: true };

describe('text to PDF', () => {
  it('reads Markdown blocks', async () => {
    const blocks = await markdownToBlocks('# Title\n\nSome **bold** text with a [link](https://x.y).\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n> quote');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'Some bold text with a link.' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
      { kind: 'code', text: 'const a = 1;' },
      { kind: 'table', rows: [['A', 'B'], ['1', '2']] },
      { kind: 'rule' },
      { kind: 'quote', text: 'quote' },
    ]);
  });

  it('turns an array of objects into a table plus the JSON', () => {
    const blocks = jsonToBlocks('[{"id":1,"name":"Pen"},{"id":2,"name":"Ink","extra":{"a":1}}]');
    expect(blocks[1]).toEqual({ kind: 'table', rows: [['id', 'name', 'extra'], ['1', 'Pen', ''], ['2', 'Ink', '{"a":1}']] });
    expect(blocks.at(-1)?.kind).toBe('code');
    expect(() => jsonToBlocks('{bad')).toThrow();
  });

  it('splits text into paragraphs, or keeps it as code', () => {
    expect(textToBlocks('a\nb\n\nc', false)).toEqual([{ kind: 'paragraph', text: 'a b' }, { kind: 'paragraph', text: 'c' }]);
    expect(textToBlocks('x  y', true)).toEqual([{ kind: 'code', text: 'x  y' }]);
  });

  it('flags and replaces characters the PDF fonts cannot draw', () => {
    expect(hasUnsupportedCharacters('Café “ok” – fine')).toBe(false);
    expect(hasUnsupportedCharacters('नमस्ते')).toBe(true);
    expect(pdfSafe('“a” – b…')).toBe('"a" - b...');
  });

  it('lays out a long document over several numbered pages', async () => {
    const blocks = await markdownToBlocks(Array.from({ length: 80 }, (_, i) => `## Part ${i}\n\nParagraph ${'word '.repeat(60)}`).join('\n\n'));
    const doc = await PDFDocument.load(await blocksToPdf(blocks, style));
    expect(doc.getPageCount()).toBeGreaterThan(3);
    expect(doc.getTitle()).toBe('Readme');
  });

  it('escapes HTML in the preview', () => {
    expect(blocksToHtml([{ kind: 'paragraph', text: '<script>x</script>' }], 'T')).toContain('&lt;script&gt;');
  });
});
