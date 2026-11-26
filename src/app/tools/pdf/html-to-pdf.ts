import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { downloadBlob } from '../../shared/file-utils';
import { canvasToBlob } from '../../shared/image-canvas';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';

const CONTENT: ToolContent = {
  aboutHeading: 'About this HTML to PDF converter',
  about:
    'Paste an HTML and CSS snippet, such as an invoice, receipt, email or report template, and see exactly how it prints. ' +
    'Pick the page size, orientation and margins; the live preview updates as you type. "Print / Save as PDF" gives a sharp ' +
    'PDF with selectable text using your browser\'s own engine; "Download PDF (image)" makes a PDF in one click. Scripts in ' +
    'the snippet do not run, and nothing is uploaded.',
  steps: ['Paste HTML (with a <style> block if you like).', 'Choose page size, orientation and margins.', 'Use Print / Save as PDF, or Download PDF (image).'],
  faq: [
    { question: 'Why are some images missing in "Download PDF (image)"?', answer: 'Browsers do not let a page draw images from other sites into a picture. Use data: URLs for images, or Print / Save as PDF, which shows everything.' },
    { question: 'How do I force a page break?', answer: 'Add style="break-before: page" (or page-break-before: always) to the element that should start a new page.' },
    { question: 'Do scripts run?', answer: 'No. The preview blocks JavaScript for safety. Paste the final HTML your code produces.' },
  ],
};

const SAMPLE = `<style>
  body { font-family: Arial, sans-serif; color: #222; }
  .head { display: flex; justify-content: space-between; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; }
  h1 { color: #4f46e5; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th { background: #eef; text-align: left; }
  th, td { padding: 8px; border-bottom: 1px solid #ddd; }
  .total { text-align: right; font-size: 18px; margin-top: 16px; }
</style>
<div class="head">
  <div><h1>INVOICE</h1><p>#INV-2026-0042</p></div>
  <div style="text-align:right"><strong>Acme Pvt Ltd</strong><br>Lucknow, India<br>26 Nov 2026</div>
</div>
<p>Bill to: <strong>Asha Rao</strong></p>
<table>
  <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
  <tr><td>Website design</td><td>1</td><td>₹25,000</td><td>₹25,000</td></tr>
  <tr><td>Hosting (12 months)</td><td>1</td><td>₹6,000</td><td>₹6,000</td></tr>
  <tr><td>Domain</td><td>1</td><td>₹900</td><td>₹900</td></tr>
</table>
<p class="total">Grand total: <strong>₹31,900</strong></p>`;

/**
 * The page as an SVG image. Stylesheets do not reliably apply inside an SVG image, so every element gets its
 * final (computed) style written onto it; <body> becomes a <div>, since <html>/<body> are ignored there.
 */
export function toSvg(doc: Document, width: number, height: number): string {
  const view = doc.defaultView!;
  const inline = (from: Element, to: Element) => {
    const computed = view.getComputedStyle(from);
    let css = '';
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      css += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    to.setAttribute('style', css);
    for (let i = 0; i < from.children.length; i++) inline(from.children[i], to.children[i]);
  };
  const clone = doc.body.cloneNode(true) as HTMLElement;
  inline(doc.body, clone);
  clone.querySelectorAll('style, script').forEach((n) => n.remove());
  const wrapper = doc.createElement('div');
  wrapper.setAttribute('style', `${clone.getAttribute('style')}width:${width}px;min-height:${height}px;margin:0;background:#fff;`);
  wrapper.append(...clone.childNodes);
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const xhtml = new XMLSerializer().serializeToString(wrapper);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
}

const PAGE_MM = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210] } as const;
type PageName = keyof typeof PAGE_MM;

@Component({
  selector: 'app-html-to-pdf',
  imports: [ToolPage, CopyButton],
  template: `
    <app-tool-page path="html-to-pdf" [content]="content" [wide]="true" privacy="Rendered in your browser. Your HTML is never uploaded.">
      <div class="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm">
        <label class="flex flex-col gap-1"><span class="font-semibold">Page</span>
          <select class="field" aria-label="Page size" (change)="page.set($any($event.target).value)"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A5">A5</option></select>
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Orientation</span>
          <select class="field" aria-label="Orientation" (change)="landscape.set($any($event.target).value === 'landscape')"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
        </label>
        <label class="flex flex-col gap-1"><span class="font-semibold">Margin (mm)</span>
          <input class="field !w-24" type="number" min="0" max="40" aria-label="Margin in millimetres" [value]="margin()" (input)="margin.set(+$any($event.target).value || 0)" />
        </label>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-2">
          <textarea class="field min-h-[32rem] flex-1 font-mono text-sm" aria-label="HTML" spellcheck="false" [value]="source()" (input)="source.set($any($event.target).value)"></textarea>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-small" (click)="source.set(sample)">Sample invoice</button>
            <app-copy-button [text]="source()" label="Copy HTML" />
            <button type="button" class="btn-small" (click)="source.set('')">Clear</button>
          </div>
        </div>
        <div class="flex min-w-0 flex-col gap-2">
          <div class="overflow-auto rounded-xl border border-line bg-surface p-3">
            <iframe #frame class="mx-auto block bg-white shadow" title="Preview" sandbox="allow-same-origin allow-modals" [style.width.px]="pagePx().w" [style.height.px]="pagePx().h"></iframe>
          </div>
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-2 text-sm" role="alert">{{ error() }}</p> }
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" [disabled]="!source().trim()" (click)="print()">Print / Save as PDF</button>
            <button type="button" class="btn-secondary" [disabled]="busy() || !source().trim()" (click)="download()">{{ busy() ? 'Making PDF…' : 'Download PDF (image)' }}</button>
          </div>
          <p class="text-xs text-muted">Print / Save as PDF keeps text selectable: in the print window choose "Save as PDF" as the destination.</p>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class HtmlToPdf {
  protected readonly content = CONTENT;
  protected readonly sample = SAMPLE;
  protected readonly source = signal(SAMPLE);
  protected readonly page = signal<PageName>('A4');
  protected readonly landscape = signal(false);
  protected readonly margin = signal(12);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  private readonly pageMm = computed(() => {
    const [w, h] = PAGE_MM[this.page()];
    return this.landscape() ? { w: h, h: w } : { w, h };
  });
  /** Page size in CSS pixels (96 per inch). */
  protected readonly pagePx = computed(() => ({ w: Math.round((this.pageMm().w / 25.4) * 96), h: Math.round((this.pageMm().h / 25.4) * 96) }));
  protected readonly doc = computed(() => {
    const { w, h } = this.pageMm();
    const css = `@page{size:${w}mm ${h}mm;margin:${this.margin()}mm}html,body{margin:0}body{padding:${this.margin()}mm;box-sizing:border-box}@media print{body{padding:0}}`;
    // Scripts never run here (the frame is sandboxed without allow-scripts).
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${this.source()}</body></html>`;
  });

  constructor() {
    // Set directly: an Angular binding would sanitize the HTML and drop its <style> blocks. The frame
    // is sandboxed without scripts, so nothing in it can run.
    effect(() => {
      const frame = this.frame()?.nativeElement;
      if (frame) frame.srcdoc = this.doc();
    });
  }

  protected print(): void {
    this.frame()?.nativeElement.contentWindow?.print();
  }

  /** Draws the page through an SVG <foreignObject> into a canvas, then cuts it into PDF pages. */
  protected async download(): Promise<void> {
    const frameDoc = this.frame()?.nativeElement.contentDocument;
    if (!frameDoc) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { w, h } = this.pagePx();
      const fullHeight = Math.max(h, frameDoc.documentElement.scrollHeight);
      const svg = toSvg(frameDoc, w, fullHeight);
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const scale = 2;
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const [pw, ph] = [(this.pageMm().w / 25.4) * 72, (this.pageMm().h / 25.4) * 72];
      for (let top = 0; top < fullHeight; top += h) {
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, top, w, h, 0, 0, canvas.width, canvas.height);
        const jpg = await pdf.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer()));
        pdf.addPage([pw, ph]).drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
      }
      const bytes = await pdf.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'page.pdf');
    } catch {
      this.error.set('This page could not be drawn as an image (often because of images from other sites). Use Print / Save as PDF instead.');
    } finally {
      this.busy.set(false);
    }
  }
}
