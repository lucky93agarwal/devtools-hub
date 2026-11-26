import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { display, evaluate } from './expression';
import { RECIPES, checkExpression, type Recipe } from './recipes';

const CONTENT: ToolContent = {
  aboutHeading: 'About this Jaspersoft expression helper',
  about:
    'Write JasperReports expressions without trial and error. Pick a recipe such as a formatted date, an Indian rupee ' +
    'amount, a null-safe value, a condition, "Page X of Y", a red style for negative values or striped rows, fill in ' +
    'your field names and copy the Java expression or XML. Paste your own expression to check it for unclosed quotes, ' +
    'unbalanced brackets, == on text, missing null checks and integer division, and try it on sample values.',
  steps: ['Pick a recipe and type your field names, or paste your own expression.', 'Read the checks, and try it with sample values.', 'Copy it into your .jrxml.'],
  faq: [
    { question: 'Java or Groovy?', answer: 'The language is set by language="java" or language="groovy" on <jasperReport>. Most recipes work in both; the checker adjusts its advice.' },
    { question: 'Why does "Try it" not run my custom class?', answer: 'Try it understands common Java (String, Number and date formatting). Your own classes run only in JasperReports.' },
  ],
};

@Component({
  selector: 'app-jasper-expression-helper',
  imports: [ToolPage, CopyButton],
  template: `
    <app-tool-page path="jasper-expression-helper" [content]="content" [wide]="true">
      <div class="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav class="card p-2 text-sm" aria-label="Recipes">
          @for (r of recipes; track r.id) {
            <button type="button" class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface" [class.bg-surface]="recipe().id === r.id" [class.font-semibold]="recipe().id === r.id" (click)="pick(r)">{{ r.title }}</button>
          }
        </nav>
        <div class="flex min-w-0 flex-col gap-4">
          <section class="card p-4" aria-labelledby="recipe-title">
            <h2 id="recipe-title" class="text-lg">{{ recipe().title }}</h2>
            @if (recipe().inputs.length) {
              <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                @for (i of recipe().inputs; track i.key) {
                  <label class="flex flex-col gap-1"><span class="font-semibold">{{ i.label }}</span>
                    <input class="field font-mono" [attr.aria-label]="i.label" [value]="values()[i.key] ?? i.value" (input)="setValue(i.key, $any($event.target).value)" />
                  </label>
                }
              </div>
            }
            <pre class="mt-3 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs" aria-label="Recipe output">{{ built().code }}</pre>
            @if (built().note) { <p class="mt-2 text-sm text-muted">{{ built().note }}</p> }
            <div class="mt-2 flex gap-2">
              <app-copy-button [text]="built().code" label="Copy" />
              @if (!built().xml) { <button type="button" class="btn-small" (click)="expression.set(built().code)">Check and try it ↓</button> }
            </div>
          </section>

          <section class="card p-4" aria-labelledby="check-title">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 id="check-title" class="text-lg">Check an expression</h2>
              <label class="flex items-center gap-2 text-sm">Language
                <select class="field !py-1" aria-label="Language" (change)="language.set($any($event.target).value)"><option value="java">Java</option><option value="groovy">Groovy</option></select>
              </label>
            </div>
            <textarea class="field mt-3 min-h-24 w-full font-mono text-sm" aria-label="Expression to check" spellcheck="false" [value]="expression()" (input)="expression.set($any($event.target).value)"></textarea>
            <ul class="mt-2 flex flex-col gap-1 text-sm" aria-label="Checks">
              @for (h of hints(); track $index) {
                <li [class.text-danger]="h.level === 'error'" [class.text-warning]="h.level === 'warning'" [class.text-muted]="h.level === 'tip'">{{ h.level === 'error' ? '✗' : h.level === 'warning' ? '!' : '💡' }} {{ h.message }}</li>
              } @empty {
                @if (expression().trim()) { <li class="text-success">✓ No problems found.</li> }
              }
            </ul>
            <label class="mt-3 flex flex-col gap-1 text-sm"><span class="font-semibold">Sample values (JSON: fields, plus PAGE_NUMBER etc. for variables)</span>
              <input class="field font-mono text-xs" aria-label="Sample values" [value]="sample()" (input)="sample.set($any($event.target).value)" />
            </label>
            <p class="mt-2 text-sm" role="status"><span class="font-semibold">Result:</span> <code class="rounded bg-surface px-1.5 py-0.5">{{ tryIt() }}</code></p>
            <button type="button" class="btn-small mt-2" (click)="expression.set('')">Clear</button>
          </section>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class JasperExpressionHelper {
  protected readonly content = CONTENT;
  protected readonly recipes = RECIPES;
  protected readonly recipe = signal<Recipe>(RECIPES[0]);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly language = signal<'java' | 'groovy'>('java');
  protected readonly expression = signal('$F{status} == "PAID" ? "Paid" : $F{status}.toLowerCase()');
  protected readonly sample = signal('{"orderDate": "2026-11-26", "amount": 123456.5, "status": "PAID", "firstName": "Asha", "lastName": "Rao", "PAGE_NUMBER": 2}');

  protected readonly built = computed(() => {
    const r = this.recipe();
    const v = Object.fromEntries(r.inputs.map((i) => [i.key, this.values()[i.key] ?? i.value]));
    return r.build(v);
  });
  protected readonly hints = computed(() => checkExpression(this.expression(), this.language()));
  protected readonly tryIt = computed(() => {
    if (!this.expression().trim()) return '';
    let values: Record<string, unknown>;
    try {
      values = JSON.parse(this.sample() || '{}');
    } catch {
      return 'Sample values are not valid JSON.';
    }
    try {
      const get = (n: string) => values[n] ?? null;
      const out = display(evaluate(this.expression(), { field: get, parameter: get, variable: get }));
      return out === '' ? '(empty)' : out;
    } catch (e) {
      return `Cannot run here: ${(e as Error).message}`;
    }
  });

  protected pick(r: Recipe): void {
    this.recipe.set(r);
    this.values.set({});
  }

  protected setValue(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }
}
