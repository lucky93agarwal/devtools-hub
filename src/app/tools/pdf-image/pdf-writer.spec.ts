import { buildPdf, placeOnPage } from './pdf-writer';

describe('pdf writer', () => {
  it('fits images on A4, turning to landscape for wide ones', () => {
    const tall = placeOnPage(1000, 2000, 'a4', 0);
    expect(tall.pageWidth).toBeCloseTo(595.28);
    expect(tall.height).toBeCloseTo(841.89);
    const wide = placeOnPage(2000, 1000, 'a4', 18);
    expect(wide.pageWidth).toBeCloseTo(841.89);
    expect(wide.x).toBeCloseTo(18);
  });

  it('makes image-sized pages at 96 DPI', () => {
    expect(placeOnPage(960, 480, 'fit', 0)).toEqual({ pageWidth: 720, pageHeight: 360, x: 0, y: 0, width: 720, height: 360 });
  });

  it('writes a PDF with one page per image and a valid xref', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const page = { jpeg, pixelWidth: 1, pixelHeight: 1, ...placeOnPage(1, 1, 'letter', 0) };
    const pdf = buildPdf([page, page], 'Test (x)');
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/Title (Test x)');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every xref offset points at its object.
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    const entries = text.slice(xref).split('\n').slice(3, 11);
    entries.forEach((line, i) => expect(text.slice(Number(line.slice(0, 10)), Number(line.slice(0, 10)) + 8)).toBe(`${i + 1} 0 obj\n`.slice(0, 8)));
  });
});
