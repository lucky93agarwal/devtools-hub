import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, effect, input, linkedSignal, output, signal } from '@angular/core';
import type { GraphQLSchema } from 'graphql';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import {
  FieldInfo,
  Operation,
  fieldsAt,
  introspectionBody,
  queryProblems,
  rootTypes,
  schemaFromText,
  selection,
  toggleArgument,
  toggleField,
} from './graphql-tools';

/** What the page knows about the schema at the request's URL. */
export interface SchemaState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** An introspection result or SDL. */
  text?: string;
  error?: string;
}

const ROOT_LABELS: Record<Operation, string> = { query: 'Query', mutation: 'Mutation', subscription: 'Subscription' };

/**
 * The GraphQL request's Query tab: the query and variables, problems found in the
 * query, and a schema explorer whose tick boxes write the query, as in Postman.
 * It brings graphql-js with it, so the page loads it only for GraphQL requests.
 */
@Component({
  selector: 'app-graphql-editor',
  imports: [CodeEditor, NgTemplateOutlet],
  template: `
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase">Query</span>
          <app-code-editor
            class="h-72"
            language="graphql"
            ariaLabel="GraphQL query"
            placeholder="Tick fields in the schema, or write a query"
            [invalid]="problems().length > 0"
            [value]="query()"
            (valueChange)="setQuery($event)"
          />
          @if (problems().length) {
            <ul class="flex flex-col gap-1 text-sm text-danger" aria-label="Query problems">
              @for (problem of problems(); track $index) {
                <li>
                  @if (problem.line) {
                    <span class="font-mono text-xs">{{ problem.line }}:{{ problem.column }}</span>
                  }
                  {{ problem.message }}
                </li>
              }
            </ul>
          }
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-muted uppercase">Variables</span>
            <button type="button" class="btn-small px-2 py-0.5 text-xs" (click)="beautifyVariables()">Beautify</button>
          </div>
          <app-code-editor
            class="h-32"
            language="json"
            ariaLabel="GraphQL variables"
            placeholder='{"id": 1}'
            [value]="variables()"
            (valueChange)="setVariables($event)"
          />
        </div>
      </div>

      <aside class="flex min-w-0 flex-col gap-2 rounded-xl border border-line p-3" aria-label="Schema explorer">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">Schema</span>
          <button
            type="button"
            class="btn-small ml-auto px-2 py-0.5 text-xs"
            [disabled]="schemaState().status === 'loading' || !canFetch()"
            (click)="fetch()"
          >
            {{ schemaState().status === 'loading' ? 'Loading…' : schema() ? 'Refresh' : 'Fetch schema' }}
          </button>
          <label class="btn-small cursor-pointer px-2 py-0.5 text-xs">
            Load file
            <input type="file" class="sr-only" accept=".graphql,.graphqls,.gql,.json" aria-label="Schema file" (change)="loadFile($any($event.target))" />
          </label>
        </div>

        @if (schemaError(); as error) {
          <p class="text-sm leading-5 text-danger">{{ error }}</p>
          <p class="text-xs text-muted">
            If the server turns off introspection, load its schema as a .graphql (SDL) or introspection .json file.
          </p>
        } @else if (schemaState().status === 'loading') {
          <p class="text-sm text-muted">Reading the schema…</p>
        } @else if (!schema()) {
          <p class="text-sm leading-5 text-muted">Enter the endpoint URL to read its schema, or load a schema file.</p>
        }

        @if (schema()) {
          <div class="flex flex-wrap gap-1" role="tablist" aria-label="Operation type">
            @for (root of roots(); track root.operation) {
              <button
                type="button"
                role="tab"
                class="rounded-full px-3 py-1 text-xs font-semibold"
                [class]="activeRoot() === root.operation ? 'bg-brand text-on-brand' : 'bg-surface text-muted hover:text-ink'"
                [attr.aria-selected]="activeRoot() === root.operation"
                (click)="activeRoot.set(root.operation)"
              >
                {{ rootLabel[root.operation] }}
              </button>
            }
          </div>
          <input
            type="text"
            class="rounded-lg border border-line bg-page px-3 py-1.5 text-sm"
            placeholder="Filter fields"
            aria-label="Filter schema fields"
            [value]="filter()"
            (input)="filter.set($any($event.target).value)"
          />
          @if (!picked()) {
            <p class="text-xs text-warning">Fix the query's syntax to tick fields again.</p>
          }
          <div class="max-h-[28rem] overflow-auto font-mono text-[13px] leading-6" role="tree" aria-label="Schema fields">
            <ng-container *ngTemplateOutlet="fieldList; context: { path: [], depth: 0 }" />
          </div>
        }
      </aside>
    </div>

    <ng-template #fieldList let-path="path" let-depth="depth">
      @for (field of fieldsFor(path, depth); track field.name) {
        @let fieldPath = path.concat(field.name);
        @let key = fieldPath.join('/');
        <div
          class="flex min-w-0 items-center gap-1 rounded hover:bg-surface"
          role="treeitem"
          [attr.aria-expanded]="field.leaf ? null : expanded().has(key)"
          [style.padding-left.px]="depth * 14"
          [title]="field.description"
        >
          @if (field.leaf) {
            <span class="w-4 shrink-0"></span>
          } @else {
            <button
              type="button"
              class="grid size-4 shrink-0 place-items-center text-muted hover:text-ink"
              [attr.aria-label]="(expanded().has(key) ? 'Collapse ' : 'Expand ') + key"
              (click)="toggleExpanded(key)"
            >
              <svg viewBox="0 0 24 24" class="size-3 transition-transform" [class.rotate-90]="expanded().has(key)" aria-hidden="true">
                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
              </svg>
            </button>
          }
          <input
            type="checkbox"
            class="size-3.5 shrink-0 accent-brand"
            [attr.aria-label]="'Select ' + key"
            [disabled]="!picked()"
            [checked]="isPicked(key)"
            (change)="pick(fieldPath, $any($event.target).checked)"
          />
          <span class="truncate" [class.line-through]="field.deprecated">{{ field.name }}</span>
          <span class="truncate text-xs text-muted">{{ field.type }}</span>
        </div>
        @if (!field.leaf && expanded().has(key)) {
          @for (arg of field.args; track arg.name) {
            <div class="flex min-w-0 items-center gap-1" [style.padding-left.px]="depth * 14 + 20" [title]="arg.description">
              <input
                type="checkbox"
                class="size-3.5 shrink-0 accent-brand"
                [attr.aria-label]="'Argument ' + arg.name + ' of ' + key"
                [disabled]="!picked()"
                [checked]="isArgPicked(key, arg.name)"
                (change)="pickArg(fieldPath, arg.name, $any($event.target).checked)"
              />
              <span class="truncate text-warning">{{ arg.name }}{{ arg.required ? '*' : '' }}</span>
              <span class="truncate text-xs text-muted">{{ arg.type }}</span>
            </div>
          }
          <ng-container *ngTemplateOutlet="fieldList; context: { path: fieldPath, depth: depth + 1 }" />
        }
      }
    </ng-template>
  `,
})
export class GraphqlEditor implements OnDestroy {
  readonly query = input('');
  readonly variables = input('');
  /** The endpoint, with {{variables}} filled in; the schema is read from here. */
  readonly url = input('');
  readonly schemaState = input<SchemaState>({ status: 'idle' });
  readonly queryChange = output<string>();
  readonly variablesChange = output<string>();
  /** Asks the page to POST this body (an introspection query) to the endpoint. */
  readonly fetchSchema = output<string>();
  readonly schemaFile = output<string>();

  protected readonly rootLabel = ROOT_LABELS;
  protected readonly filter = signal('');
  protected readonly expanded = signal(new Set<string>());
  private readonly fileError = signal('');

  protected readonly built = computed<{ schema: GraphQLSchema | null; error: string }>(() => {
    const text = this.schemaState().text;
    if (!text) return { schema: null, error: '' };
    try {
      return { schema: schemaFromText(text), error: '' };
    } catch (e) {
      return { schema: null, error: e instanceof Error ? e.message : 'The schema could not be read.' };
    }
  });
  protected readonly schema = computed(() => this.built().schema);
  protected readonly schemaError = computed(() => this.fileError() || this.schemaState().error || this.built().error);
  protected readonly roots = computed(() => (this.schema() ? rootTypes(this.schema()!) : []));
  protected readonly picked = computed(() => selection(this.query()));
  /** The operation type shown, following the query's own when it has one. */
  protected readonly activeRoot = linkedSignal<Operation>(() => this.picked()?.operation ?? 'query');
  protected readonly problems = computed(() => queryProblems(this.query(), this.schema()));
  protected readonly canFetch = computed(() => /^https?:\/\/[^/\s]+/i.test(this.url()));

  /** Fields per path, worked out once per schema and operation type. */
  private readonly fieldCache = computed(() => {
    this.schema();
    this.activeRoot();
    return new Map<string, FieldInfo[]>();
  });
  private fetchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Read the schema by itself once the URL looks complete and none is loaded for it.
    effect(() => {
      const idle = this.schemaState().status === 'idle';
      const ready = this.canFetch();
      clearTimeout(this.fetchTimer);
      if (idle && ready) this.fetchTimer = setTimeout(() => this.fetchSchema.emit(introspectionBody()), 800);
    });
  }

  protected fetch(): void {
    this.fileError.set('');
    this.fetchSchema.emit(introspectionBody());
  }

  protected async loadFile(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      schemaFromText(text);
      this.fileError.set('');
      this.schemaFile.emit(text);
    } catch (e) {
      this.fileError.set(`${file.name} is not a schema: ${e instanceof Error ? e.message : 'it could not be read.'}`);
    }
  }

  protected setQuery(text: string): void {
    if (text !== this.query()) this.queryChange.emit(text);
  }

  protected setVariables(text: string): void {
    if (text !== this.variables()) this.variablesChange.emit(text);
  }

  protected beautifyVariables(): void {
    try {
      this.variablesChange.emit(JSON.stringify(JSON.parse(this.variables()), null, 2));
    } catch {
      // Left as typed; the request explains invalid JSON when it is sent.
    }
  }

  protected fieldsFor(path: string[], depth: number): FieldInfo[] {
    const schema = this.schema();
    if (!schema) return [];
    const cache = this.fieldCache();
    const key = path.join('/');
    let fields = cache.get(key);
    if (!fields) {
      fields = fieldsAt(schema, this.activeRoot(), path);
      cache.set(key, fields);
    }
    const filter = this.filter().trim().toLowerCase();
    return depth === 0 && filter ? fields.filter((f) => f.name.toLowerCase().includes(filter)) : fields;
  }

  protected isPicked(key: string): boolean {
    const picked = this.picked();
    return !!picked && picked.operation === this.activeRoot() && picked.fields.has(key);
  }

  protected isArgPicked(key: string, arg: string): boolean {
    const picked = this.picked();
    return !!picked && picked.operation === this.activeRoot() && picked.args.has(`${key}(${arg}`);
  }

  protected toggleExpanded(key: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected pick(path: string[], on: boolean): void {
    const schema = this.schema();
    if (!schema) return;
    const next = toggleField(this.query(), schema, this.activeRoot(), path, on);
    if (next !== null) this.queryChange.emit(next);
    // Ticking an object opens it, so its fields can be changed.
    if (on && !this.expanded().has(path.join('/'))) this.toggleExpanded(path.join('/'));
  }

  protected pickArg(path: string[], arg: string, on: boolean): void {
    const schema = this.schema();
    if (!schema) return;
    const next = toggleArgument(this.query(), this.variables(), schema, this.activeRoot(), path, arg, on);
    if (!next) return;
    this.queryChange.emit(next.query);
    if (next.variables !== this.variables()) this.variablesChange.emit(next.variables);
  }

  ngOnDestroy(): void {
    clearTimeout(this.fetchTimer);
  }
}
