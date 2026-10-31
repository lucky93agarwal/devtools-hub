import { Component, computed, signal } from '@angular/core';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { HEADERS, MIME_TYPES, STATUS_CODES, Section, searchEntries } from './http-data';

const CONTENT: ToolContent = {
  aboutHeading: 'About this HTTP reference',
  about:
    'A quick, searchable reference for building and debugging APIs: every HTTP status code with when to use it (401 ' +
    'or 403? 400 or 422?), the request and response headers you meet most, including CORS and caching, and MIME ' +
    'types for common file extensions such as .apk and .wasm. Search by number, name or topic, for example "cors", ' +
    '"cache" or "redirect".',
  steps: [
    'Choose Status codes, Headers or MIME types.',
    'Search by code, name or topic, such as 429, Authorization or apk.',
    'Read when to use each one.',
  ],
  faq: [
    { question: 'Should I return 401 or 403?', answer: '401 means not logged in (no or a bad token); the client should log in. 403 means logged in but not allowed; logging in again will not help.' },
    { question: 'Should validation errors be 400 or 422?', answer: 'Both are common. Many APIs use 400 for malformed requests (broken JSON) and 422 for well-formed data that breaks a rule, such as an invalid email.' },
    { question: 'Which redirect should I use?', answer: 'Use 301 or 308 for permanent moves and 302, 303 or 307 for temporary ones. 307 and 308 keep the method, so a POST stays a POST.' },
  ],
};

@Component({
  selector: 'app-http-reference',
  imports: [ToolPage],
  template: `
    <app-tool-page path="http-reference" [content]="content">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Section">
          @for (tab of tabs; track tab.value) {
            <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
              [class]="section() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="section() === tab.value" (click)="section.set(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>
        <input type="search" class="field min-w-0 flex-1" aria-label="Search the reference" placeholder="Search, for example 429, cors or apk" [value]="query()" (input)="query.set($any($event.target).value)" />
      </div>
      <ul class="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line" aria-live="polite">
        @for (e of results(); track e.key) {
          <li class="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
            <span class="w-full shrink-0 font-mono font-semibold sm:w-56" [class]="tone(e.key)">{{ e.key }}</span>
            <span class="min-w-0 flex-1">
              <span class="font-semibold">{{ e.title }}</span>
              <span class="block text-sm text-muted">{{ e.text }}</span>
            </span>
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-sm text-muted">Nothing matches “{{ query() }}”.</li>
        }
      </ul>
    </app-tool-page>
  `,
})
export class HttpReference {
  protected readonly content = CONTENT;
  protected readonly tabs: { value: Section; label: string }[] = [
    { value: 'status', label: 'Status codes' },
    { value: 'headers', label: 'Headers' },
    { value: 'mime', label: 'MIME types' },
  ];
  protected readonly section = signal<Section>('status');
  protected readonly query = signal('');
  protected readonly results = computed(() => {
    const entries = { status: STATUS_CODES, headers: HEADERS, mime: MIME_TYPES }[this.section()];
    return searchEntries(entries, this.query());
  });

  protected tone(key: string): string {
    if (this.section() !== 'status') return '';
    return key[0] === '2' ? 'text-success' : key[0] === '3' ? 'text-brand' : key[0] === '4' ? 'text-warning' : key[0] === '5' ? 'text-danger' : 'text-muted';
  }
}
