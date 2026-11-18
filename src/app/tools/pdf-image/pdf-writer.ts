/** A small PDF writer that puts one JPEG image on each page. */

export interface PdfPage {
  /** JPEG file bytes. */
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  pixelWidth: number;
  pixelHeight: number;
  /** Page size in points (1/72 inch). */
  pageWidth: number;
  pageHeight: number;
  /** Where the image is drawn on the page, in points from the bottom-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;
export type PageSize = keyof typeof PAGE_SIZES | 'fit';

/**
 * Page and image box for one image. "fit" makes the page the image's size at 96 DPI;
 * A4 and Letter turn to landscape for wide images and centre the image inside the margin.
 */
export function placeOnPage(pixelWidth: number, pixelHeight: number, size: PageSize, margin: number) {
  if (size === 'fit') {
    const width = (pixelWidth * 72) / 96;
    const height = (pixelHeight * 72) / 96;
    return { pageWidth: width + margin * 2, pageHeight: height + margin * 2, x: margin, y: margin, width, height };
  }
  const paper = PAGE_SIZES[size];
  const landscape = pixelWidth > pixelHeight;
  const pageWidth = landscape ? paper.height : paper.width;
  const pageHeight = landscape ? paper.width : paper.height;
  const scale = Math.min((pageWidth - margin * 2) / pixelWidth, (pageHeight - margin * 2) / pixelHeight);
  const width = pixelWidth * scale;
  const height = pixelHeight * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

const n = (value: number) => (Math.round(value * 100) / 100).toString();

export function buildPdf(pages: readonly PdfPage[], title = 'Images'): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Objects: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image).
  const pageIds = pages.map((_, i) => 4 + i * 3);
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7e]/g, '');
  object(3, () => push(`<< /Title (${safeTitle}) /Producer (DevTools24) >>`));
  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(page.pageWidth)} ${n(page.pageHeight)}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    const content = `q ${n(page.width)} 0 0 ${n(page.height)} ${n(page.x)} ${n(page.y)} cm /Im0 Do Q`;
    object(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push('\nendstream');
    });
  });
  const total = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
