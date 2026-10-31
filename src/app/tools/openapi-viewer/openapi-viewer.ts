import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { Operation, parseSpec } from './openapi';

const SAMPLE = `openapi: 3.0.3
info:
  title: Shop API
  version: 1.2.0
  description: Orders and products for the shop app.
servers:
  - url: https://api.shop.example.com/v1
paths:
  /products:
    get:
      tags: [Products]
      summary: List products
      operationId: listProducts
      parameters:
        - { name: page, in: query, schema: { type: integer } }
      responses:
        '200': { description: A page of products }
  /orders:
    post:
      tags: [Orders]
      summary: Create an order
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NewOrder' }
      responses:
        '201': { description: Created }
        '422': { description: Invalid order }
  /orders/{orderId}:
    get:
      tags: [Orders]
      summary: Get an order
      operationId: getOrder
      parameters:
        - { name: orderId, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: The order }
        '404': { description: Not found }
components:
  schemas:
    NewOrder:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            type: object
            properties:
              sku: { type: string, example: BK-1 }
              qty: { type: integer, minimum: 1 }
        email: { type: string, format: email }
`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this OpenAPI viewer and validator',
  about:
    'A long openapi.yaml is hard to read in an editor. Paste an OpenAPI 3 or Swagger 2.0 document to see every endpoint ' +
    'grouped by tag, with its parameters, request body and responses, and a ready-to-run cURL command with a sample ' +
    'body made from the schema. The checker finds broken $ref links, duplicate operationIds, path parameters that are ' +
    'not declared and operations without responses, the mistakes that break code generators and documentation tools.',
  steps: [
    'Paste the spec (YAML or JSON) or open the file.',
    'Fix the problems listed at the top, if any.',
    'Open an endpoint to see its details and copy its cURL command.',
  ],
  faq: [
    { question: 'Does it support Swagger 2.0?', answer: 'Yes, both Swagger 2.0 and OpenAPI 3.0 and 3.1. External $ref files are not loaded; only references inside the document are checked.' },
    { question: 'Can I send the requests?', answer: 'Copy the cURL command into a terminal, or paste it into the API Client on this site to send it from your browser.' },
    { question: 'Is my spec uploaded?', answer: 'No. It is read in your browser.' },
  ],
};

@Component({
  selector: 'app-openapi-viewer',
  imports: [Icon, CodeEditor, CopyButton, ToolPage],
  template: `
    <app-tool-page path="openapi-viewer" [content]="content" [wide]="true" privacy="Read in your browser. Your API specs are never uploaded.">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-small" (click)="text.set(sample)">Try a sample</button>
        <button type="button" class="btn-small" (click)="fileInput.click()"><app-icon [path]="icons.upload" [size]="16" /> Open file</button>
        <input #fileInput type="file" accept=".yaml,.yml,.json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="onFile(fileInput)" />
      </div>
      <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <app-code-editor class="h-96 lg:h-[40rem]" ariaLabel="OpenAPI document" placeholder="Paste openapi.yaml or swagger.json here." [value]="text()" (valueChange)="text.set($event)" />
        <div aria-live="polite">
          @if (result(); as r) {
            @if (!r.ok) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ r.error }}</p>
            } @else {
              <h2 class="text-2xl leading-8">{{ r.spec.title || 'Untitled API' }} <span class="text-base font-normal text-muted">{{ r.spec.apiVersion }} · {{ r.spec.version }}</span></h2>
              @if (r.spec.description) {
                <p class="mt-1 text-sm text-muted">{{ r.spec.description }}</p>
              }
              <p class="mt-1 font-mono text-sm break-all">{{ r.spec.servers.join(', ') }}</p>
              <p class="mt-3 text-sm font-semibold">{{ r.spec.operations.length }} {{ r.spec.operations.length === 1 ? 'endpoint' : 'endpoints' }} · {{ r.spec.schemas.length }} {{ r.spec.schemas.length === 1 ? 'schema' : 'schemas' }} · {{ errorCount() ? errorCount() + ' problems' : 'no problems' }}</p>
              @for (i of r.spec.issues; track i.message) {
                <p class="mt-2 rounded-lg border px-3 py-1.5 text-sm" [class]="i.level === 'error' ? 'border-danger bg-danger/10' : i.level === 'warning' ? 'border-warning bg-warning/10' : 'border-line'">{{ i.message }}</p>
              }
              @for (g of groups(); track g.tag) {
                <h3 class="mt-6 text-lg leading-7">{{ g.tag }}</h3>
                <div class="mt-2 flex flex-col gap-2">
                  @for (op of g.ops; track op.method + op.path) {
                    <details class="rounded-xl border border-line">
                      <summary class="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                        <span class="w-16 rounded px-2 py-0.5 text-center font-mono text-xs font-bold text-white" [class]="color(op)">{{ op.method }}</span>
                        <span class="font-mono text-sm" [class.line-through]="op.deprecated">{{ op.path }}</span>
                        <span class="text-sm text-muted">{{ op.summary }}</span>
                      </summary>
                      <div class="border-t border-line px-3 py-3 text-sm">
                        @if (op.params.length) {
                          <p class="font-semibold">Parameters</p>
                          <ul class="mt-1">
                            @for (p of op.params; track p.in + p.name) {
                              <li><code class="font-mono">{{ p.name }}</code> <span class="text-muted">({{ p.in }}{{ p.type ? ', ' + p.type : '' }}{{ p.required ? ', required' : '' }})</span> {{ p.description }}</li>
                            }
                          </ul>
                        }
                        @if (op.bodyTypes.length) {
                          <p class="mt-2"><span class="font-semibold">Body:</span> {{ op.bodyTypes.join(', ') }}</p>
                        }
                        <p class="mt-2 font-semibold">Responses</p>
                        <ul class="mt-1">
                          @for (res of op.responses; track res.code) {
                            <li><code class="font-mono">{{ res.code }}</code> {{ res.description }}</li>
                          }
                        </ul>
                        <div class="mt-3 flex items-center justify-between gap-2"><span class="font-semibold">cURL</span><app-copy-button [text]="op.curl" [ariaLabel]="'Copy cURL for ' + op.method + ' ' + op.path" /></div>
                        <pre class="mt-1 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">{{ op.curl }}</pre>
                      </div>
                    </details>
                  }
                </div>
              }
            }
          } @else {
            <p class="card p-4 text-sm text-muted">Paste an OpenAPI or Swagger document to see its endpoints.</p>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class OpenapiViewer {
  protected readonly content = CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = SAMPLE;
  protected readonly text = signal('');
  protected readonly result = computed(() => (this.text().trim() ? parseSpec(this.text()) : null));
  protected readonly errorCount = computed(() => {
    const r = this.result();
    return r?.ok ? r.spec.issues.filter((i) => i.level === 'error').length : 0;
  });
  protected readonly groups = computed(() => {
    const r = this.result();
    if (!r?.ok) return [];
    const ops = r.spec.operations;
    return [...new Set(ops.map((o) => o.tag))].map((tag) => ({ tag, ops: ops.filter((o) => o.tag === tag) }));
  });

  constructor() {
    onSharedInput((d) => this.text.set(d['input'] ?? ''));
  }

  protected color(op: Operation): string {
    return { GET: 'bg-brand', POST: 'bg-success', PUT: 'bg-warning', PATCH: 'bg-warning', DELETE: 'bg-danger' }[op.method] ?? 'bg-muted';
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file) this.text.set(await file.text());
  }
}
