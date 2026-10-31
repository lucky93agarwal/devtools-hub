import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { bumps, checkRange, sortVersions } from './semver-tools';

const CONTENT: ToolContent = {
  aboutHeading: 'About this semver calculator',
  about:
    'npm, Composer, Cargo, pub and other package managers use version ranges such as ^1.2.3, ~2.0 or >=3 <4 to decide ' +
    'which updates to install. Type a range to read it in plain words and see which versions it allows, sort a list ' +
    'of versions correctly (1.10.0 after 1.9.0, pre-releases before releases), and see the next major, minor, patch or ' +
    'pre-release version. It uses the same semver library as npm.',
  steps: [
    'Type a range, such as ^1.2.3, and paste the versions you want to test, one per line.',
    'Read what the range means and which versions match; the highest match is what npm would install.',
    'Paste versions under Sort to put them in the right order.',
    'Type a version under Next version to see each possible bump.',
  ],
  faq: [
    { question: 'What is the difference between ^ and ~?', answer: '^1.2.3 allows anything up to 2.0.0 (new features and fixes). ~1.2.3 allows only 1.2.x (fixes). For 0.x versions, ^ is stricter: ^0.2.3 means below 0.3.0.' },
    { question: 'Why does ^1.2.3 not match 2.0.0-beta.1?', answer: 'Pre-releases only match a range that names a pre-release of the same major.minor.patch, so users do not get unstable versions by surprise.' },
    { question: 'Is this the same as npm?', answer: 'Yes, it uses the semver package that npm itself uses.' },
  ],
};

@Component({
  selector: 'app-semver-calculator',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="semver-calculator" [content]="content">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Version range</span>
            <input class="field font-mono text-base" spellcheck="false" placeholder="^1.2.3" [value]="range()" (input)="range.set($any($event.target).value)" />
          </label>
          <label class="flex flex-col gap-1 text-sm leading-5">
            <span class="font-semibold">Versions to test, one per line</span>
            <textarea rows="8" class="field-code" spellcheck="false" [value]="versions()" (input)="versions.set($any($event.target).value)"></textarea>
          </label>
        </div>
        <div aria-live="polite">
          @if (rangeResult(); as r) {
            @if (r.ok) {
              <p class="text-sm text-muted">Means</p>
              <p class="font-heading text-xl font-semibold">{{ r.words }}</p>
              <p class="mt-1 font-mono text-sm text-muted">{{ r.normalized }}</p>
              <p class="mt-4 text-sm font-semibold">{{ r.matches.length }} of {{ versionList().length }} versions match</p>
              <ul class="mt-2 flex flex-wrap gap-1.5">
                @for (v of versionList(); track v) {
                  <li class="rounded-full px-2.5 py-0.5 font-mono text-sm" [class]="r.matches.includes(v) ? 'bg-success/15 text-success' : 'bg-surface text-muted line-through'">{{ v }}</li>
                }
              </ul>
              @if (r.best) {
                <p class="mt-3 text-sm">npm would install <span class="font-mono font-semibold">{{ r.best }}</span>.</p>
              }
            } @else {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ r.error }}</p>
            }
          }
        </div>
      </div>

      <section class="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="text-xl leading-7">Sort versions</h2>
          <textarea rows="6" class="field-code mt-3" aria-label="Versions to sort" spellcheck="false" [value]="toSort()" (input)="toSort.set($any($event.target).value)"></textarea>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-sm text-muted">Oldest first</span>
            <app-copy-button [text]="sorted().sorted.join('\\n')" />
          </div>
          <p class="mt-1 font-mono text-sm">{{ sorted().sorted.join(' < ') }}</p>
          @if (sorted().invalid.length) {
            <p class="mt-1 text-sm text-danger">Not versions: {{ sorted().invalid.join(', ') }}</p>
          }
        </div>
        <div>
          <h2 class="text-xl leading-7">Next version</h2>
          <div class="mt-3 flex gap-2">
            <input class="field min-w-0 flex-1 font-mono" aria-label="Current version" spellcheck="false" [value]="current()" (input)="current.set($any($event.target).value)" />
            <input class="field w-24 font-mono" aria-label="Pre-release name" [value]="preid()" (input)="preid.set($any($event.target).value || 'beta')" />
          </div>
          <dl class="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            @for (b of next(); track b.kind) {
              <dt class="text-muted">{{ b.kind }}</dt>
              <dd class="font-mono">{{ b.version }}</dd>
            } @empty {
              <dd class="col-span-2 text-danger">Enter a version such as 1.4.2.</dd>
            }
          </dl>
        </div>
      </section>
    </app-tool-page>
  `,
})
export class SemverCalculator {
  protected readonly content = CONTENT;
  protected readonly range = signal('^1.2.3');
  protected readonly versions = signal('1.2.2\n1.2.3\n1.3.0\n1.9.9\n2.0.0-beta.1\n2.0.0');
  protected readonly toSort = signal('1.10.0\n1.2.0\n2.0.0\n2.0.0-rc.1\n1.9.0');
  protected readonly current = signal('1.4.2');
  protected readonly preid = signal('beta');

  protected readonly versionList = computed(() => this.versions().split('\n').map((v) => v.trim()).filter(Boolean));
  protected readonly rangeResult = computed(() => (this.range().trim() ? checkRange(this.range(), this.versionList()) : null));
  protected readonly sorted = computed(() => sortVersions(this.toSort().split('\n')));
  protected readonly next = computed(() => bumps(this.current(), this.preid()) ?? []);
}
