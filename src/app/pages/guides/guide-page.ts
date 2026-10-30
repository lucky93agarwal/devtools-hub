import { Component, DOCUMENT, OnDestroy, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SITE_NAME, SITE_URL } from '../../core/app-config';
import { GUIDES, guideFor } from '../../core/guides';
import { TOOLS } from '../../core/tools';
import { AdSlot } from '../../shared/ad-slot/ad-slot';
import { API_ARTICLES } from './articles-api';
import { IMAGE_ARTICLES } from './articles-images';
import { JSON_ARTICLES } from './articles-json';
import { Block } from './article';

const ARTICLES = { ...JSON_ARTICLES, ...API_ARTICLES, ...IMAGE_ARTICLES };
const SCRIPT_ID = 'guide-structured-data';

/** Splits text on backticks so `code` spans can be shown as code. */
export function inlineParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((p) => p.text);
}

/** One guide: title, intro, the article, a link to its tool and more guides. */
@Component({
  selector: 'app-guide-page',
  imports: [RouterLink, AdSlot],
  template: `
    @if (guide(); as g) {
      <article class="container-tool content-page pt-10 pb-6 sm:pt-16">
        <p class="text-sm"><a routerLink="/guides">Guides</a></p>
        <h1 class="mt-2 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ g.title }}</h1>
        <p class="text-sm text-muted">Updated {{ updated() }} · {{ minutes() }} min read</p>
        <p class="text-lg leading-8">{{ article()?.intro }}</p>

        @for (block of article()?.body ?? []; track $index) {
          @if (isH(block)) {
            <h2>{{ block.h }}</h2>
          } @else if (isP(block)) {
            <p>
              @for (part of parts(block.p); track $index) {
                @if (part.code) {<code class="rounded bg-surface px-1 font-mono text-[0.9em] break-words">{{ part.text }}</code>} @else {<ng-container>{{ part.text }}</ng-container>}
              }
            </p>
          } @else if (isUl(block)) {
            <ul>
              @for (item of block.ul; track $index) {
                <li>
                  @for (part of parts(item); track $index) {
                    @if (part.code) {<code class="rounded bg-surface px-1 font-mono text-[0.9em] break-words">{{ part.text }}</code>} @else {<ng-container>{{ part.text }}</ng-container>}
                  }
                </li>
              }
            </ul>
          } @else if (isOl(block)) {
            <ol class="mt-3 flex list-decimal flex-col gap-2 pl-5">
              @for (item of block.ol; track $index) {
                <li>
                  @for (part of parts(item); track $index) {
                    @if (part.code) {<code class="rounded bg-surface px-1 font-mono text-[0.9em] break-words">{{ part.text }}</code>} @else {<ng-container>{{ part.text }}</ng-container>}
                  }
                </li>
              }
            </ol>
          } @else if (isCode(block)) {
            <pre class="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-6">{{ block.code }}</pre>
          } @else if (isTable(block)) {
            <div class="mt-3 overflow-x-auto rounded-xl border border-line">
              <table class="w-full text-left text-sm">
                <thead class="bg-surface">
                  <tr>
                    @for (cell of block.table.head; track $index) {
                      <th class="px-3 py-2 font-semibold">{{ cell }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of block.table.rows; track $index) {
                    <tr class="border-t border-line">
                      @for (cell of row; track $index) {
                        <td class="px-3 py-2 align-top">{{ cell }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (isNote(block)) {
            <p class="rounded-xl border border-line bg-surface px-4 py-3">{{ block.note }}</p>
          }
        }

        @if (tools().length) {
          <div class="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/5 px-4 py-4">
            <span class="font-semibold">Try it in your browser:</span>
            @for (tool of tools(); track tool.path) {
              <a class="btn-small no-underline" [routerLink]="'/' + tool.path">{{ tool.name }}</a>
            }
          </div>
        }

        <div class="mt-10"><app-ad-slot placement="beforeFaq" /></div>

        <h2>More guides</h2>
        <ul>
          @for (other of more(); track other.slug) {
            <li><a [routerLink]="'/guides/' + other.slug">{{ other.title }}</a></li>
          }
        </ul>
      </article>
    }
  `,
})
export class GuidePage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly slug = this.route.snapshot.url.at(-1)?.path ?? '';

  protected readonly guide = computed(() => guideFor(this.slug) ?? null);
  protected readonly article = computed(() => ARTICLES[this.slug] ?? null);
  protected readonly tools = computed(() => TOOLS.filter((t) => this.guide()?.tools.includes(t.path) && t.live));
  protected readonly more = computed(() => {
    const own = this.guide();
    // Guides sharing a tool first, then the rest, five in all.
    const related = GUIDES.filter((g) => g.slug !== this.slug && g.tools.some((t) => own?.tools.includes(t)));
    const others = GUIDES.filter((g) => g.slug !== this.slug && !related.includes(g));
    return [...related, ...others].slice(0, 5);
  });
  protected readonly updated = computed(() => {
    const date = this.guide()?.updated;
    return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  });
  /** Reading time at about 220 words a minute. */
  protected readonly minutes = computed(() => {
    const article = this.article();
    if (!article) return 1;
    const text = [article.intro, ...article.body.map((b) => JSON.stringify(b))].join(' ');
    return Math.max(1, Math.round(text.split(/\s+/).length / 220));
  });

  protected readonly parts = inlineParts;
  protected isH = (b: Block): b is { h: string } => 'h' in b;
  protected isP = (b: Block): b is { p: string } => 'p' in b;
  protected isUl = (b: Block): b is { ul: string[] } => 'ul' in b;
  protected isOl = (b: Block): b is { ol: string[] } => 'ol' in b;
  protected isCode = (b: Block): b is { code: string } => 'code' in b;
  protected isTable = (b: Block): b is { table: { head: string[]; rows: string[][] } } => 'table' in b;
  protected isNote = (b: Block): b is { note: string } => 'note' in b;

  constructor() {
    const guide = this.guide();
    if (!guide) return;
    // Article structured data, so search engines know the page is an article and when it changed.
    this.document.getElementById(SCRIPT_ID)?.remove();
    const script = this.document.createElement('script');
    script.id = SCRIPT_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: guide.title,
      description: guide.description,
      dateModified: guide.updated,
      url: `${SITE_URL}/guides/${guide.slug}`,
      publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    });
    this.document.head.appendChild(script);
  }

  ngOnDestroy(): void {
    this.document.getElementById(SCRIPT_ID)?.remove();
  }
}

/** The list of all guides. */
@Component({
  selector: 'app-guides-page',
  imports: [RouterLink],
  template: `
    <article class="container-tool content-page pt-10 pb-6 sm:pt-16">
      <h1 class="text-[28px] leading-9 sm:text-[40px] sm:leading-12">Developer guides</h1>
      <p class="text-lg leading-8">
        Practical explanations of the formats, protocols and techniques behind the tools on {{ siteName }}: what they are,
        how they work and the mistakes to avoid.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        @for (guide of guides; track guide.slug) {
          <a
            class="flex flex-col gap-2 rounded-xl border border-line p-4 no-underline hover:border-brand"
            [routerLink]="'/guides/' + guide.slug"
          >
            <span class="font-heading text-lg leading-7 font-semibold text-ink">{{ guide.title }}</span>
            <span class="text-sm text-muted">{{ guide.description }}</span>
          </a>
        }
      </div>
    </article>
  `,
})
export class GuidesPage {
  protected readonly guides = GUIDES;
  protected readonly siteName = SITE_NAME;
}
