import { Component, DOCUMENT, OnDestroy, OnInit, inject, input } from '@angular/core';
import { SITE_NAME, SITE_URL } from '../../core/app-config';
import { ToolInfo } from '../../core/tools';
import { AdSlot } from '../ad-slot/ad-slot';

export interface FaqItem {
  question: string;
  answer: string;
}

/** The text below a tool: what it is for, how to use it and common questions. */
export interface ToolContent {
  aboutHeading: string;
  about: string;
  steps: string[];
  faq: FaqItem[];
}

const SCRIPT_ID = 'tool-structured-data';

/**
 * Explanation, steps and FAQ shown below every tool. Also adds structured data
 * (WebApplication and FAQPage) so search engines understand the page. Extra
 * sections can be placed between the steps and the FAQ.
 */
@Component({
  selector: 'app-tool-info',
  imports: [AdSlot],
  template: `
    <section
      class="mt-16 flex flex-col gap-10 border-t border-line pt-10"
      aria-labelledby="about-heading"
    >
      <!-- Ads sit in the explanation below the tool, never inside it. -->
      <app-ad-slot placement="belowTool" />

      <div>
        <h2 id="about-heading" class="text-2xl leading-8 sm:text-[28px] sm:leading-9">
          {{ content().aboutHeading }}
        </h2>
        <p class="mt-3 text-muted">{{ content().about }}</p>
      </div>

      <div>
        <h2 class="text-2xl leading-8 sm:text-[28px] sm:leading-9">How to use it</h2>
        <ol class="mt-3 flex list-decimal flex-col gap-2 pl-5 text-muted">
          @for (step of content().steps; track step) {
            <li>{{ step }}</li>
          }
        </ol>
      </div>

      <ng-content />

      <app-ad-slot placement="beforeFaq" />

      <div>
        <h2 class="text-2xl leading-8 sm:text-[28px] sm:leading-9">Frequently asked questions</h2>
        <div class="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line">
          @for (item of content().faq; track item.question) {
            <details class="group px-4 py-3">
              <summary
                class="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-semibold"
              >
                <h3 class="text-base leading-6">{{ item.question }}</h3>
                <span
                  class="text-muted transition-transform group-open:rotate-45"
                  aria-hidden="true"
                  >+</span
                >
              </summary>
              <p class="mt-2 text-muted">{{ item.answer }}</p>
            </details>
          }
        </div>
      </div>
    </section>
  `,
})
export class ToolInfoSection implements OnInit, OnDestroy {
  readonly tool = input.required<ToolInfo>();
  readonly content = input.required<ToolContent>();

  private readonly document = inject(DOCUMENT);

  ngOnInit(): void {
    this.document.getElementById(SCRIPT_ID)?.remove();
    const script = this.document.createElement('script');
    script.id = SCRIPT_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData(this.tool(), this.content()));
    this.document.head.appendChild(script);
  }

  ngOnDestroy(): void {
    this.document.getElementById(SCRIPT_ID)?.remove();
  }
}

/** schema.org data: the tool as a free web app, plus its FAQ. */
export function structuredData(tool: ToolInfo, content: ToolContent): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: tool.name,
        description: tool.metaDescription,
        url: `${SITE_URL}/${tool.path}`,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any (runs in a web browser)',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      },
      {
        '@type': 'FAQPage',
        mainEntity: content.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };
}
