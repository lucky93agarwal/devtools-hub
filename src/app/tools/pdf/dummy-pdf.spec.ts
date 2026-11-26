import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeDummyPdf } from './dummy-pdf';

describe('makeDummyPdf', () => {
  it('makes the requested number of pages', async () => {
    const bytes = await makeDummyPdf({ pages: 3, size: 'A4', content: 'both', targetBytes: 0, title: 'Test' });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getTitle()).toBe('Test');
  });

  it('hits an exact target size', async () => {
    const target = 300 * 1024;
    const bytes = await makeDummyPdf({ pages: 2, size: 'Letter', content: 'text', targetBytes: target, title: '' });
    expect(bytes.length).toBe(target);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
