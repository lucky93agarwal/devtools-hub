import { Component, computed, signal } from '@angular/core';
import { downloadText } from '../../shared/file-utils';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { mapJson, mapSql, toXml, type MapResult } from './mapper';

const CONTENT: ToolContent = {
  aboutHeading: 'About this JRXML field and parameter mapper',
  about:
    'Stop typing <field> tags by hand. Paste a sample API response (JSON) or an SQL query and get JRXML declarations ' +
    'with the right Java classes: Integer, Long, BigDecimal for money, Date or Timestamp for ISO dates, Boolean and ' +
    'String. Nested JSON becomes fields with a fieldDescription path for the JSON data source, top-level values of an ' +
    'envelope become parameters, numeric fields get Sum variables, and SQL :name or ? placeholders become $P{} ' +
    'parameters inside the queryString. Optionally get a ready column header and detail band too.',
  steps: ['Choose JSON or SQL and paste a sample.', 'Check the field list and the notes.', 'Copy or download the XML and paste it into your .jrxml.'],
  faq: [
    { question: 'Where do the tags go in the .jrxml?', answer: 'Parameters, queryString, fields and variables go near the top, after <style> and before <title> and the bands, in that order.' },
    { question: 'How are SQL column types chosen?', answer: 'From the column name and expression (for example *_at → Timestamp, amount → BigDecimal, COUNT() → Long). Check them against your database.' },
  ],
};

const JSON_SAMPLE = `{
  "invoiceNo": "INV-2026-0042",
  "customer": { "name": "Asha Rao", "city": "Lucknow" },
  "items": [
    { "lineNo": 1, "product": "Website design", "qty": 1, "unitPrice": 25000.0, "deliveredOn": "2026-11-20" },
    { "lineNo": 2, "product": "Hosting", "qty": 12, "unitPrice": 500.0, "deliveredOn": "2026-11-21" }
  ]
}`;
const SQL_SAMPLE = `SELECT o.id AS order_id, c.name AS customer_name, o.order_date, o.amount, o.status
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.order_date BETWEEN :fromDate AND :toDate AND o.status = ?
ORDER BY o.order_date`;

@Component({
  selector: 'app-jrxml-field-mapper',
  imports: [ToolPage, CopyButton],
  template: `
    <app-tool-page path="jrxml-field-mapper" [content]="content" [wide]="true">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm" role="tablist" aria-label="Input">
        <button type="button" role="tab" class="btn-small" [attr.aria-selected]="mode() === 'json'" [class.!bg-brand]="mode() === 'json'" [class.!text-on-brand]="mode() === 'json'" (click)="setMode('json')">JSON payload</button>
        <button type="button" role="tab" class="btn-small" [attr.aria-selected]="mode() === 'sql'" [class.!bg-brand]="mode() === 'sql'" [class.!text-on-brand]="mode() === 'sql'" (click)="setMode('sql')">SQL query</button>
        <label class="ml-2 flex items-center gap-2"><input type="checkbox" [checked]="withBands()" (change)="withBands.set($any($event.target).checked)" /> Add column header and detail band</label>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-2">
          <textarea class="field min-h-96 font-mono text-xs" [attr.aria-label]="mode() === 'json' ? 'JSON payload' : 'SQL query'" spellcheck="false" [value]="input()" (input)="input.set($any($event.target).value)"></textarea>
          <div class="flex gap-2"><button type="button" class="btn-small" (click)="input.set(mode() === 'json' ? jsonSample : sqlSample)">Sample</button><button type="button" class="btn-small" (click)="input.set('')">Clear</button></div>
        </div>
        <div class="flex min-w-0 flex-col gap-2">
          @if (error()) { <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }
          @if (result(); as r) {
            @if (r.notes.length) { <ul class="list-disc rounded-xl border border-line bg-surface py-2 pr-3 pl-7 text-sm">@for (n of r.notes; track $index) { <li>{{ n }}</li> }</ul> }
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs" aria-label="Mapped fields">
                <thead class="text-muted"><tr><th class="py-1 pr-2">Kind</th><th class="py-1 pr-2">Name</th><th class="py-1 pr-2">Class</th><th class="py-1">Path</th></tr></thead>
                <tbody>
                  @for (p of r.parameters; track p.name) { <tr class="border-t border-line"><td class="py-1 pr-2">parameter</td><td class="py-1 pr-2 font-mono">{{ p.name }}</td><td class="py-1 pr-2 font-mono">{{ p.className }}</td><td></td></tr> }
                  @for (f of r.fields; track f.name) { <tr class="border-t border-line"><td class="py-1 pr-2">field</td><td class="py-1 pr-2 font-mono">{{ f.name }}</td><td class="py-1 pr-2 font-mono">{{ f.className }}</td><td class="py-1 font-mono">{{ f.description ?? '' }}</td></tr> }
                  @for (v of r.variables; track v.name) { <tr class="border-t border-line"><td class="py-1 pr-2">variable</td><td class="py-1 pr-2 font-mono">{{ v.name }}</td><td class="py-1 pr-2 font-mono">{{ v.className }}</td><td class="py-1">{{ v.calculation }}</td></tr> }
                </tbody>
              </table>
            </div>
            <textarea class="field min-h-72 font-mono text-xs" readonly aria-label="JRXML output" [value]="xml()"></textarea>
            <div class="flex gap-2"><app-copy-button [text]="xml()" label="Copy XML" /><button type="button" class="btn-small" (click)="download()">Download</button></div>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JrxmlFieldMapper {
  protected readonly content = CONTENT;
  protected readonly jsonSample = JSON_SAMPLE;
  protected readonly sqlSample = SQL_SAMPLE;
  protected readonly mode = signal<'json' | 'sql'>('json');
  protected readonly input = signal(JSON_SAMPLE);
  protected readonly withBands = signal(true);
  private readonly mapped = computed<{ result: MapResult | null; error: string }>(() => {
    if (!this.input().trim()) return { result: null, error: '' };
    try {
      return { result: this.mode() === 'json' ? mapJson(this.input()) : mapSql(this.input()), error: '' };
    } catch (e) {
      return { result: null, error: this.mode() === 'json' && e instanceof SyntaxError ? `This is not valid JSON: ${e.message}` : (e as Error).message };
    }
  });
  protected readonly result = computed(() => this.mapped().result);
  protected readonly error = computed(() => this.mapped().error);
  protected readonly xml = computed(() => (this.result() ? toXml(this.result()!, this.withBands()) : ''));

  protected setMode(mode: 'json' | 'sql'): void {
    if (!this.input().trim() || this.input() === JSON_SAMPLE || this.input() === SQL_SAMPLE) this.input.set(mode === 'json' ? JSON_SAMPLE : SQL_SAMPLE);
    this.mode.set(mode);
  }

  protected download(): void {
    downloadText(this.xml(), 'fields.jrxml.txt', 'text/plain');
  }
}
