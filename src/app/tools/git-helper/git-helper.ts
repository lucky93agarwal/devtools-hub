import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { PLACEHOLDERS, fill, searchScenarios } from './git-scenarios';

const CONTENT: ToolContent = {
  aboutHeading: 'About this Git command helper',
  about:
    'Git can undo almost anything, if you know the command. Search for what happened in everyday words, such as ' +
    '“committed to the wrong branch”, “undo last commit” or “committed a password”, and get the exact commands with a ' +
    'short explanation. Fill in your branch, commit or file name once and every command uses it. Commands that can ' +
    'lose work or rewrite shared history are clearly marked.',
  steps: [
    'Search for your situation or browse the groups.',
    'Type your branch name, commit hash or file once at the top.',
    'Read the explanation and any warning before running anything.',
    'Copy the commands into your terminal.',
  ],
  faq: [
    { question: 'I ran a reset and lost work. Can I get it back?', answer: 'Usually yes, if it was committed: git reflog lists every recent position of HEAD. Make a branch at the hash you need. Uncommitted changes that were discarded cannot be recovered by Git.' },
    { question: 'What is the difference between reset and revert?', answer: 'reset moves your branch back and rewrites history, fine for local commits. revert adds a new commit that undoes an old one, the safe way for commits others already have.' },
    { question: 'Why --force-with-lease instead of --force?', answer: 'It refuses to push if someone else pushed in the meantime, so you cannot wipe out a teammate’s work by accident.' },
  ],
};

@Component({
  selector: 'app-git-helper',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="git-helper" [content]="content" privacy="Everything here is a reference. Commands run only when you paste them into your own terminal.">
      <input type="search" class="field w-full text-base" aria-label="Search Git situations" placeholder="What happened? For example: wrong branch, undo commit, password" [value]="query()" (input)="query.set($any($event.target).value)" />
      <div class="mt-3 flex flex-wrap gap-3">
        @for (p of placeholders; track p.key) {
          <label class="flex items-center gap-2 text-sm"><span class="font-semibold">{{ p.label }}</span>
            <input class="field w-40 py-1 font-mono" [attr.aria-label]="p.label + ' name'" [placeholder]="p.example" [value]="values()[p.key] ?? ''" (input)="set(p.key, $any($event.target).value)" />
          </label>
        }
      </div>
      @for (g of groups(); track g.name) {
        <h2 class="mt-8 text-xl leading-7">{{ g.name }}</h2>
        <div class="mt-3 flex flex-col gap-3">
          @for (s of g.items; track s.id) {
            <article class="card p-4" [attr.aria-label]="s.question">
              <h3 class="font-semibold">{{ s.question }}</h3>
              <div class="mt-2 flex items-start gap-2">
                <pre class="min-w-0 flex-1 overflow-x-auto rounded-lg bg-page p-3 font-mono text-sm">{{ commands(s.commands) }}</pre>
                <app-copy-button [text]="commands(s.commands)" [ariaLabel]="'Copy commands for: ' + s.question" />
              </div>
              <p class="mt-2 text-sm text-muted">{{ s.explain }}</p>
              @if (s.danger) {
                <p class="mt-2 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm"><span class="font-semibold">Careful:</span> {{ s.danger }}</p>
              }
            </article>
          }
        </div>
      } @empty {
        <p class="card mt-6 p-4 text-sm text-muted">Nothing matches “{{ query() }}”. Try other words, such as undo, branch or remote.</p>
      }
    </app-tool-page>
  `,
})
export class GitHelper {
  protected readonly content = CONTENT;
  protected readonly placeholders = PLACEHOLDERS;
  protected readonly query = signal('');
  protected readonly values = signal<Record<string, string>>({});
  protected readonly groups = computed(() => {
    const list = searchScenarios(this.query());
    return [...new Set(list.map((s) => s.group))].map((name) => ({ name, items: list.filter((s) => s.group === name) }));
  });

  protected set(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  protected commands(lines: string[]): string {
    return lines.map((c) => fill(c, this.values())).join('\n');
  }
}
