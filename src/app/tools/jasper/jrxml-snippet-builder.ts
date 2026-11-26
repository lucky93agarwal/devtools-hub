import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { barcodeSnippet, listSnippet, parseColumns, subreportSnippet, tableSnippet } from './snippets';

const CONTENT: ToolContent = {
  aboutHeading: 'About this JRXML table and subreport builder',
  about:
    'Generate the fiddly XML for JasperReports components: a table with a repeating header row, striped rows and ' +
    'right-aligned numbers; a list; a QR code, Code 128 or EAN-13 barcode; or a subreport with parameters and a JSON, ' +
    'JavaBean or JDBC data source. Describe the columns as "Header : field : width : class", one per line, and copy the ' +
    'subDataset declaration and the component element straight into your .jrxml.',
  steps: ['Choose table, list, barcode / QR or subreport.', 'Fill in the columns or settings.', 'Copy the declaration and the element into your report.'],
  faq: [
    { question: 'Why does the table not show any rows?', answer: 'The dataSourceExpression must return a new data source for the list (subDataSource for JSON, JRBeanCollectionDataSource for Java lists), and the subDataset field names must match the keys in each item.' },
    { question: 'Where does the components namespace go?', answer: 'It is included on the <jr:table>, <jr:list> or barcode element, so the snippet works without changing the <jasperReport> root.' },
  ],
};

type Kind = 'table' | 'list' | 'barcode' | 'subreport';

@Component({
  selector: 'app-jrxml-snippet-builder',
  imports: [ToolPage, CopyButton],
  template: `
    <app-tool-page path="jrxml-snippet-builder" [content]="content" [wide]="true">
      <div class="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Snippet type">
        @for (k of kinds; track k.id) {
          <button type="button" role="tab" class="btn-small" [attr.aria-selected]="kind() === k.id" [class.!bg-brand]="kind() === k.id" [class.!text-on-brand]="kind() === k.id" (click)="kind.set(k.id)">{{ k.label }}</button>
        }
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card flex min-w-0 flex-col gap-3 p-4 text-sm">
          @if (kind() === 'table' || kind() === 'list') {
            <label class="flex flex-col gap-1"><span class="font-semibold">Columns: Header : field : width : class (one per line)</span>
              <textarea class="field min-h-40 font-mono text-xs" aria-label="Columns" spellcheck="false" [value]="columns()" (input)="columns.set($any($event.target).value)"></textarea>
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1"><span class="font-semibold">Dataset name</span><input class="field" aria-label="Dataset name" [value]="dataset()" (input)="dataset.set($any($event.target).value)" /></label>
              <label class="flex flex-col gap-1"><span class="font-semibold">Data comes from</span>
                <select class="field" aria-label="Data source" (change)="source.set($any($event.target).value)"><option value="json">JSON (subDataSource)</option><option value="beans">Java list field (JavaBeans)</option></select>
              </label>
              <label class="flex flex-col gap-1"><span class="font-semibold">{{ source() === 'json' ? 'JSON path of the list' : 'List field' }}</span><input class="field font-mono" aria-label="List path" [value]="listField()" (input)="listField.set($any($event.target).value)" /></label>
              <label class="flex flex-col gap-1"><span class="font-semibold">Total width</span><input class="field" type="number" aria-label="Total width" [value]="width()" (input)="width.set(+$any($event.target).value || 555)" /></label>
            </div>
            @if (kind() === 'table') { <label class="flex items-center gap-2"><input type="checkbox" [checked]="zebra()" (change)="zebra.set($any($event.target).checked)" /> Striped rows</label> }
          }
          @if (kind() === 'barcode') {
            <label class="flex flex-col gap-1"><span class="font-semibold">Type</span>
              <select class="field" aria-label="Barcode type" (change)="barcode.set($any($event.target).value)"><option value="qr">QR code</option><option value="code128">Code 128</option><option value="ean13">EAN-13</option></select>
            </label>
            <label class="flex flex-col gap-1"><span class="font-semibold">Value (expression)</span><input class="field font-mono" aria-label="Barcode value" [value]="codeExpr()" (input)="codeExpr.set($any($event.target).value)" /></label>
            <label class="flex flex-col gap-1"><span class="font-semibold">Size</span><input class="field" type="number" aria-label="Size" [value]="codeSize()" (input)="codeSize.set(+$any($event.target).value || 80)" /></label>
          }
          @if (kind() === 'subreport') {
            <label class="flex flex-col gap-1"><span class="font-semibold">Subreport file</span><input class="field font-mono" aria-label="Subreport file" [value]="subFile()" (input)="subFile.set($any($event.target).value)" /></label>
            <label class="flex flex-col gap-1"><span class="font-semibold">Data comes from</span>
              <select class="field" aria-label="Subreport data source" (change)="subSource.set($any($event.target).value)"><option value="json">JSON (subDataSource)</option><option value="beans">Java list field</option><option value="connection">Same database connection (SQL in the subreport)</option></select>
            </label>
            @if (subSource() !== 'connection') { <label class="flex flex-col gap-1"><span class="font-semibold">List path / field</span><input class="field font-mono" aria-label="Subreport list" [value]="listField()" (input)="listField.set($any($event.target).value)" /></label> }
            <label class="flex flex-col gap-1"><span class="font-semibold">Parameters to pass (comma separated)</span><input class="field font-mono" aria-label="Parameters to pass" [value]="subParams()" (input)="subParams.set($any($event.target).value)" /></label>
          }
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          @if (snippet().declarations) {
            <label class="flex flex-col gap-1 text-sm font-semibold">1. Declaration (near the top of the report)
              <textarea class="field min-h-28 font-mono text-xs font-normal" readonly aria-label="Declaration" [value]="snippet().declarations"></textarea>
            </label>
            <app-copy-button [text]="snippet().declarations ?? ''" label="Copy declaration" />
          }
          <label class="flex flex-col gap-1 text-sm font-semibold">{{ snippet().declarations ? '2. Element (inside a band)' : 'Element (inside a band)' }}
            <textarea class="field min-h-80 font-mono text-xs font-normal" readonly aria-label="Element" [value]="snippet().element"></textarea>
          </label>
          <app-copy-button [text]="snippet().element" label="Copy element" />
          <p class="text-sm text-muted">{{ snippet().note }}</p>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JrxmlSnippetBuilder {
  protected readonly content = CONTENT;
  protected readonly kinds: { id: Kind; label: string }[] = [
    { id: 'table', label: 'Dynamic table' },
    { id: 'list', label: 'List' },
    { id: 'barcode', label: 'Barcode / QR code' },
    { id: 'subreport', label: 'Subreport' },
  ];
  protected readonly kind = signal<Kind>('table');
  protected readonly columns = signal('Item : product : 220\nQty : qty : 60 : java.lang.Integer\nPrice : unitPrice : : java.math.BigDecimal\nDelivered : deliveredOn : : java.util.Date');
  protected readonly dataset = signal('items');
  protected readonly source = signal<'json' | 'beans'>('json');
  protected readonly listField = signal('items');
  protected readonly width = signal(555);
  protected readonly zebra = signal(true);
  protected readonly barcode = signal<'qr' | 'code128' | 'ean13'>('qr');
  protected readonly codeExpr = signal('"https://example.com/invoice/" + $F{invoiceNo}');
  protected readonly codeSize = signal(80);
  protected readonly subFile = signal('invoice_items.jrxml');
  protected readonly subSource = signal<'json' | 'beans' | 'connection'>('json');
  protected readonly subParams = signal('INVOICE_ID, REPORT_LOCALE');

  protected readonly snippet = computed<{ declarations?: string; element: string; note: string }>(() => {
    const table = { dataset: this.dataset() || 'items', source: this.source(), listField: this.listField(), columns: parseColumns(this.columns()), width: this.width(), zebra: this.zebra() };
    switch (this.kind()) {
      case 'table':
        return tableSnippet(table);
      case 'list':
        return listSnippet(table);
      case 'barcode':
        return barcodeSnippet(this.barcode(), this.codeExpr(), this.codeSize());
      case 'subreport':
        return subreportSnippet({ file: this.subFile(), source: this.subSource(), listField: this.listField(), parameters: this.subParams().split(',').map((p) => p.trim()), height: 40, width: this.width() });
    }
  });
}
