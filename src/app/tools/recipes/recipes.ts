import { Component, afterNextRender, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { onSharedInput, prefill } from '../../core/shared-input';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { RECIPES, STEPS, StepOutput, runRecipe, stepById } from './steps';

const STORAGE_KEY = 'dth-recipes';

interface SavedRecipe {
  name: string;
  steps: string[];
}

const CONTENT: ToolContent = {
  aboutHeading: 'About recipes: chain tools together',
  about:
    'Many small jobs need two or three tools in a row: decode Base64 and then format the JSON inside, URL-decode a ' +
    'parameter and read it as JSON, take a JWT payload and turn it into YAML. A recipe does the whole chain at once. ' +
    'Each step’s output goes into the next step, you see the result of every step, and a failing step tells you why. ' +
    'Start from a ready-made recipe or build your own, save it for next time, and share it as a link.',
  steps: [
    'Pick a ready-made recipe, or add steps one by one.',
    'Paste your input. Every step runs as you type.',
    'Copy the final result, or open it in a full tool.',
    'Save recipes you use often; they stay in this browser.',
  ],
  faq: [
    { question: 'Is my data sent anywhere?', answer: 'No. Every step runs in your browser. Saved recipes keep only the list of steps, not your input.' },
    { question: 'Can I share a recipe?', answer: 'Yes. Share link puts the steps and your input in the link after #, which is never sent to a server.' },
    { question: 'Which steps are there?', answer: 'Base64, URL, JSON-string and HTML decoding and encoding, JWT header and payload, JSON format and minify, conversions between JSON, YAML, CSV and XML, SHA-256 and MD5, and line tools such as trim, sort and de-duplicate.' },
  ],
};

@Component({
  selector: 'app-recipes',
  imports: [CopyButton, ShareButton, ToolPage],
  template: `
    <app-tool-page path="recipes" [content]="content" [wide]="true" privacy="Every step runs in your browser. Your input is never uploaded.">
      <h2 class="text-lg">Ready-made recipes</h2>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (r of recipes; track r.name) {
          <button type="button" class="btn-small" (click)="useRecipe(r.steps, r.sample)">{{ r.name }}</button>
        }
      </div>
      @if (saved().length) {
        <h2 class="mt-5 text-lg">My recipes</h2>
        <div class="mt-2 flex flex-wrap gap-2">
          @for (r of saved(); track r.name) {
            <span class="flex items-center rounded-full border border-line">
              <button type="button" class="px-3 py-1 text-sm font-semibold" (click)="useRecipe(r.steps)">{{ r.name }}</button>
              <button type="button" class="px-2 py-1 text-sm text-muted hover:text-danger" [attr.aria-label]="'Delete recipe ' + r.name" (click)="remove(r.name)">×</button>
            </span>
          }
        </div>
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <div class="flex flex-col gap-3">
          <label class="text-sm font-semibold" for="recipe-input">Input</label>
          <textarea id="recipe-input" class="field-code h-48" spellcheck="false" placeholder="Paste the text to run through the steps." [value]="input()" (input)="input.set($any($event.target).value)"></textarea>

          <h2 class="mt-2 text-lg">Steps</h2>
          <ol class="flex flex-col gap-2" aria-label="Recipe steps">
            @for (id of steps(); track $index; let i = $index, last = $last) {
              <li class="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <span class="grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">{{ i + 1 }}</span>
                <span class="flex-1 text-sm font-semibold">{{ label(id) }}</span>
                <button type="button" class="btn-small" [disabled]="i === 0" [attr.aria-label]="'Move ' + label(id) + ' up'" (click)="move(i, -1)">↑</button>
                <button type="button" class="btn-small" [disabled]="last" [attr.aria-label]="'Move ' + label(id) + ' down'" (click)="move(i, 1)">↓</button>
                <button type="button" class="btn-small" [attr.aria-label]="'Remove ' + label(id)" (click)="removeStep(i)">×</button>
              </li>
            } @empty {
              <li class="text-sm text-muted">No steps yet. Pick a recipe above or add a step.</li>
            }
          </ol>
          <label class="text-sm font-semibold">Add a step
            <select class="field mt-1 w-full" aria-label="Add a step" (change)="addStep($any($event.target))">
              <option value="">Choose…</option>
              @for (g of groups; track g.name) {
                <optgroup [label]="g.name">
                  @for (s of g.steps; track s.id) { <option [value]="s.id">{{ s.label }}</option> }
                </optgroup>
              }
            </select>
          </label>
          <div class="flex flex-wrap items-end gap-2">
            <label class="text-sm font-semibold">Recipe name
              <input class="field mt-1 w-56" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="My recipe" />
            </label>
            <button type="button" class="btn-secondary" [disabled]="!steps().length || !name().trim()" (click)="save()">Save recipe</button>
            <app-share-button path="recipes" [data]="steps().length ? { input: input(), steps: steps().join(',') } : null" />
          </div>
        </div>

        <div class="flex flex-col gap-3" aria-live="polite">
          @for (o of outputs(); track $index; let i = $index) {
            <section class="rounded-xl border p-3" [class]="o.result.ok ? 'border-line' : 'border-danger bg-danger/10'">
              <p class="text-xs font-semibold tracking-wide text-muted uppercase">Step {{ i + 1 }} · {{ o.step.label }}</p>
              @if (o.result.ok) {
                <pre class="mt-1 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap break-all">{{ o.result.text }}</pre>
              } @else {
                <p class="mt-1 text-sm" role="alert">{{ o.result.error }}</p>
              }
            </section>
          }
          @if (final(); as text) {
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-lg">Result</h2>
              <app-copy-button [text]="text" ariaLabel="Copy the result" />
            </div>
            <textarea class="field-code h-48" readonly aria-label="Result" [value]="text"></textarea>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-semibold">Open the result in:</span>
              @for (t of targets; track t.path) {
                <button type="button" class="btn-small" (click)="openIn(t.path, text)">{{ t.label }}</button>
              }
            </div>
          } @else if (!input().trim()) {
            <p class="card p-4 text-sm text-muted">Paste some input to run the steps.</p>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class Recipes {
  protected readonly content = CONTENT;
  protected readonly recipes = RECIPES;
  protected readonly groups = [...new Set(STEPS.map((s) => s.group))].map((name) => ({ name, steps: STEPS.filter((s) => s.group === name) }));
  protected readonly targets = [
    { path: 'json-formatter', label: 'JSON Formatter' },
    { path: 'json-to-code', label: 'JSON to Code' },
    { path: 'hash-generator', label: 'Hash Generator' },
    { path: 'case-converter', label: 'Case Converter' },
  ];
  protected readonly input = signal(RECIPES[0].sample);
  protected readonly steps = signal<string[]>(RECIPES[0].steps);
  protected readonly name = signal('');
  protected readonly saved = signal<SavedRecipe[]>([]);
  protected readonly outputs = signal<StepOutput[]>([]);
  protected readonly final = computed(() => {
    const list = this.outputs();
    const last = list.at(-1);
    return list.length === this.steps().length && last?.result.ok ? last.result.text : null;
  });

  private readonly router = inject(Router);
  private run = 0;

  constructor() {
    afterRenderEffect(() => {
      const input = this.input();
      const steps = this.steps();
      const id = ++this.run;
      if (!input.trim()) {
        this.outputs.set([]);
        return;
      }
      void runRecipe(input, steps).then((out) => id === this.run && this.outputs.set(out));
    });
    afterNextRender(() => this.saved.set(this.load()));
    onSharedInput((d) => {
      this.input.set(d['input'] ?? '');
      this.steps.set((d['steps'] ?? '').split(',').filter((s) => stepById(s)));
    });
  }

  protected label(id: string): string {
    return stepById(id)?.label ?? id;
  }

  protected useRecipe(steps: string[], sample?: string): void {
    this.steps.set([...steps]);
    if (sample !== undefined) this.input.set(sample);
  }

  protected addStep(select: HTMLSelectElement): void {
    if (select.value) this.steps.update((s) => [...s, select.value]);
    select.value = '';
  }

  protected removeStep(i: number): void {
    this.steps.update((s) => s.filter((_, j) => j !== i));
  }

  protected move(i: number, by: number): void {
    this.steps.update((s) => {
      const next = [...s];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  protected save(): void {
    const recipe = { name: this.name().trim(), steps: this.steps() };
    this.store([...this.saved().filter((r) => r.name !== recipe.name), recipe]);
    this.name.set('');
  }

  protected remove(name: string): void {
    this.store(this.saved().filter((r) => r.name !== name));
  }

  protected openIn(path: string, text: string): void {
    prefill(path, { input: text });
    void this.router.navigateByUrl('/' + path);
  }

  private load(): SavedRecipe[] {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter((r) => typeof r?.name === 'string' && Array.isArray(r.steps)) : [];
    } catch {
      return [];
    }
  }

  private store(list: SavedRecipe[]): void {
    this.saved.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Storage can be blocked; the recipe still works for this visit.
    }
  }
}
