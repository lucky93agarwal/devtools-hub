import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { SCHEMA_CONTENT, SAMPLE_DATA, SAMPLE_SCHEMA } from './content';
import { ValidationResult, schemaFromSample, validateJson } from './validate';

const DEBOUNCE_MS = 300;

@Component({
  selector: 'app-json-schema-validator',
  imports: [Icon, CodeEditor, ShareButton, ToolPage],
  template: `
    <app-tool-page path="json-schema-validator" [content]="content" [wide]="true" privacy="Validated in your browser. Your JSON and schema are never sent to a server.">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-small" (click)="loadSample()">Try a sample</button>
        <button type="button" class="btn-small" [disabled]="!data().trim()" (click)="makeSchema()">Make a schema from my JSON</button>
        <button type="button" class="btn-small" [disabled]="!schema() && !data()" (click)="set('', '')">Clear</button>
        <app-share-button path="json-schema-validator" [data]="schema() || data() ? { schema: schema(), data: data() } : null" />
      </div>

      <div id="schema-status" class="mt-4 min-h-12 text-sm leading-5" aria-live="polite">
        @switch (result()?.kind) {
          @case ('valid') {
            <p class="flex items-center gap-2 font-semibold">
              <span class="grid size-6 place-items-center rounded-full bg-success text-white"><app-icon [path]="icons.check" [size]="14" /></span>
              Valid: the JSON follows the schema.
            </p>
          }
          @case ('invalid') {
            <div class="rounded-xl border border-danger bg-danger/10 px-4 py-3">
              <p class="font-semibold">{{ errors().length }} {{ errors().length === 1 ? 'problem' : 'problems' }} found</p>
              <ul class="mt-2 flex flex-col gap-1">
                @for (e of errors(); track $index) {
                  <li><code class="font-mono font-semibold">{{ e.path || '(whole document)' }}</code> {{ e.message }}</li>
                }
              </ul>
            </div>
          }
          @case ('bad-input') {
            <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ badInput() }}</p>
          }
          @default {
            <p class="text-muted">Paste a JSON Schema on the left and the JSON to check on the right.</p>
          }
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">JSON Schema</span>
          <app-code-editor class="h-80 lg:h-[30rem]" language="json" ariaLabel="JSON Schema" placeholder="Paste a JSON Schema (draft-07, 2019-09 or 2020-12)." [value]="schema()" (valueChange)="onInput('schema', $event)" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">JSON to check</span>
          <app-code-editor class="h-80 lg:h-[30rem]" language="json" ariaLabel="JSON to check" placeholder="Paste the JSON to validate." [value]="data()" (valueChange)="onInput('data', $event)" />
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JsonSchemaValidator {
  protected readonly content = SCHEMA_CONTENT;
  protected readonly icons = ICONS;
  protected readonly schema = signal('');
  protected readonly data = signal('');
  private readonly settled = signal({ schema: '', data: '' });
  protected readonly result = signal<ValidationResult | null>(null);

  protected readonly errors = computed(() => {
    const r = this.result();
    return r?.kind === 'invalid' ? r.errors : [];
  });
  protected readonly badInput = computed(() => {
    const r = this.result();
    return r?.kind === 'bad-input' ? r.error : '';
  });

  private timer?: ReturnType<typeof setTimeout>;
  private run = 0;

  constructor() {
    effect(() => {
      const { schema, data } = this.settled();
      const id = ++this.run;
      if (!schema.trim() || !data.trim()) {
        this.result.set(null);
        return;
      }
      void validateJson(schema, data).then((r) => id === this.run && this.result.set(r));
    });
    onSharedInput((d) => this.set(d['schema'] ?? '', d['data'] ?? d['input'] ?? ''));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(which: 'schema' | 'data', value: string): void {
    if (value === this[which]()) return;
    this[which].set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settled.set({ schema: this.schema(), data: this.data() }), DEBOUNCE_MS);
  }

  protected set(schema: string, data: string): void {
    clearTimeout(this.timer);
    this.schema.set(schema);
    this.data.set(data);
    this.settled.set({ schema, data });
  }

  protected loadSample(): void {
    this.set(SAMPLE_SCHEMA, SAMPLE_DATA);
  }

  protected makeSchema(): void {
    const schema = schemaFromSample(this.data());
    if (schema) this.set(schema, this.data());
    else this.result.set({ kind: 'bad-input', error: 'A schema can be made from a JSON object or a list of objects.' });
  }
}
