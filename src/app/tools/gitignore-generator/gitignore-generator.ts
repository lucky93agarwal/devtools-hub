import { Component, computed, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { GITIGNORE_CONTENT } from './content';
import { buildGitignore, searchTemplates } from './gitignore';
import { TEMPLATES } from './templates';

/** Common starting points, as template ids. */
const PRESETS = [
  { label: 'Angular + VS Code + macOS', ids: ['angular', 'node', 'visualstudiocode', 'macos'] },
  { label: 'Android', ids: ['android', 'kotlin', 'gradle', 'jetbrains', 'macos', 'windows'] },
  { label: 'iOS', ids: ['swift', 'xcode', 'macos'] },
  { label: 'Flutter', ids: ['flutter', 'dart', 'android', 'xcode', 'visualstudiocode', 'macos'] },
  { label: 'Python', ids: ['python', 'virtualenv', 'visualstudiocode', 'jetbrains'] },
  { label: 'Spring Boot', ids: ['java', 'maven', 'gradle', 'jetbrains', 'visualstudiocode'] },
];

@Component({
  selector: 'app-gitignore-generator',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">Start from:</span>
        @for (preset of presets; track preset.label) {
          <button type="button" class="btn-small" (click)="applyPreset(preset.ids)">{{ preset.label }}</button>
        }
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <div class="flex flex-col gap-3">
          <label for="gi-search" class="text-sm leading-5 font-semibold">Languages, frameworks, editors and systems</label>
          <input
            id="gi-search"
            type="search"
            class="field"
            placeholder="Search, for example node or jetbrains"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
          @if (selected().size) {
            <div class="flex flex-wrap gap-1.5" aria-label="Chosen templates">
              @for (template of chosen(); track template.id) {
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-sm font-semibold text-on-brand"
                  [attr.aria-label]="'Remove ' + template.label"
                  (click)="toggle(template.id)"
                >
                  {{ template.label }}
                  <app-icon [path]="icons.close" [size]="14" />
                </button>
              }
              <button type="button" class="btn-small" (click)="clearAll()">Clear all</button>
            </div>
          }
          <div class="card max-h-[28rem] overflow-y-auto p-3">
            @for (group of groups(); track group.name) {
              <fieldset class="mb-3 last:mb-0">
                <legend class="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ group.name }}</legend>
                <div class="grid gap-x-3 sm:grid-cols-2">
                  @for (template of group.templates; track template.id) {
                    <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-page">
                      <input type="checkbox" class="size-4 accent-brand" [checked]="selected().has(template.id)" (change)="toggle(template.id)" />
                      {{ template.label }}
                    </label>
                  }
                </div>
              </fieldset>
            } @empty {
              <p class="p-2 text-sm text-muted">Nothing matches “{{ query() }}”.</p>
            }
          </div>
          <label class="flex flex-col gap-2 text-sm leading-5">
            <span class="font-semibold">Your own lines <span class="font-normal text-muted">(optional, added first)</span></span>
            <textarea rows="4" class="field-code" spellcheck="false" placeholder=".env.local&#10;coverage/" [value]="custom()" (input)="custom.set($any($event.target).value)"></textarea>
          </label>
          <label class="flex items-center gap-2 text-sm leading-5">
            <input type="checkbox" class="size-4 accent-brand" [checked]="dedupe()" (change)="dedupe.set($any($event.target).checked)" />
            Remove patterns that an earlier section already has
          </label>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex min-h-9 items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">.gitignore</span>
            <div class="flex gap-2">
              <app-copy-button [text]="output()" />
              <button type="button" class="btn-small" [disabled]="!output()" (click)="download()">
                <app-icon [path]="icons.download" [size]="16" />
                Download
              </button>
            </div>
          </div>
          <textarea
            class="field-code h-[36rem]"
            readonly
            aria-label=".gitignore file"
            placeholder="Choose what your project uses and the file appears here."
            [value]="output()"
          ></textarea>
          @if (output()) {
            <p class="text-sm text-muted">{{ lineCount() }} lines. Save it as .gitignore in the root of your repository.</p>
          }
        </div>
      </div>

      <p class="mt-4 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Templates come from GitHub's public github/gitignore collection and are built into this page.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class GitignoreGenerator {
  protected readonly tool = TOOLS.find((t) => t.path === 'gitignore-generator')!;
  protected readonly content = GITIGNORE_CONTENT;
  protected readonly icons = ICONS;
  protected readonly presets = PRESETS;

  protected readonly query = signal('');
  protected readonly selected = signal(new Set<string>());
  protected readonly custom = signal('');
  protected readonly dedupe = signal(true);

  protected readonly groups = computed(() => {
    const found = searchTemplates(TEMPLATES, this.query());
    return [...new Set(found.map((t) => t.group))].map((name) => ({ name, templates: found.filter((t) => t.group === name) }));
  });
  /** In the order they were picked, so the file follows the same order. */
  protected readonly chosen = computed(() =>
    [...this.selected()].map((id) => TEMPLATES.find((t) => t.id === id)!).filter(Boolean),
  );
  protected readonly output = computed(() => buildGitignore(this.chosen(), this.custom(), this.dedupe()));
  protected readonly lineCount = computed(() => this.output().trimEnd().split('\n').length);

  private readonly analytics = inject(Analytics);

  protected toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected clearAll(): void {
    this.selected.set(new Set());
  }

  protected applyPreset(ids: string[]): void {
    this.selected.set(new Set(ids.filter((id) => TEMPLATES.some((t) => t.id === id))));
  }

  protected download(): void {
    // Browsers drop a leading dot from downloaded names, so the file is saved as "gitignore".
    downloadText(this.output(), 'gitignore', 'text/plain');
    this.analytics.track('gitignore-download', { templates: this.selected().size });
  }
}
