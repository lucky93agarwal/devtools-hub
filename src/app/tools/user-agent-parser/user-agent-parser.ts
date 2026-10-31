import { Component, afterNextRender, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { SAMPLE_AGENTS, parseUserAgent } from './ua';

const CONTENT: ToolContent = {
  aboutHeading: 'About this User-Agent parser',
  about:
    'Every browser, app and bot sends a User-Agent header that names itself. In logs and analytics these strings are ' +
    'long and confusing. Paste one to see the browser and version, rendering engine, operating system and device ' +
    'type, and whether it comes from a search engine crawler, a link preview bot, an AI crawler or an HTTP library ' +
    'such as curl, OkHttp or python-requests. Your own browser’s string is filled in to start.',
  steps: ['Paste a User-Agent string from a log, or use your own.', 'Read the browser, system, device and bot details.', 'Try the samples to compare desktop, phone and bot strings.'],
  faq: [
    { question: 'Can I trust the User-Agent?', answer: 'No. Any client can send any string, so never use it for security decisions. It is fine for statistics and debugging.' },
    { question: 'Why does every browser say Mozilla?', answer: 'For historical compatibility: old sites only served full pages to Mozilla, so every browser started claiming to be it.' },
    { question: 'Why does Chrome show an old-looking version or OS?', answer: 'Chrome reduces the details it sends (User-Agent reduction) for privacy, for example always reporting Windows 10.' },
  ],
};

@Component({
  selector: 'app-user-agent-parser',
  imports: [ToolPage],
  template: `
    <app-tool-page path="user-agent-parser" [content]="content">
      <label for="ua-input" class="text-sm leading-5 font-semibold">User-Agent</label>
      <textarea id="ua-input" rows="3" class="field-code mt-2" spellcheck="false" [value]="ua()" (input)="ua.set($any($event.target).value)"></textarea>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (s of samples; track s.label) {
          <button type="button" class="btn-small" (click)="ua.set(s.ua)">{{ s.label }}</button>
        }
        @if (mine()) {
          <button type="button" class="btn-small" (click)="ua.set(mine())">My browser</button>
        }
      </div>
      @if (info(); as i) {
        <dl class="mt-6 grid gap-3 sm:grid-cols-2" aria-live="polite">
          @for (row of [{ l: 'Browser or app', v: i.browser }, { l: 'Engine', v: i.engine }, { l: 'Operating system', v: i.os }, { l: 'Device', v: i.device }]; track row.l) {
            <div class="card p-4"><dt class="text-xs text-muted">{{ row.l }}</dt><dd class="mt-1 font-semibold">{{ row.v }}</dd></div>
          }
        </dl>
        <p class="mt-4 rounded-xl border px-4 py-3 text-sm" [class]="i.bot ? 'border-warning bg-warning/10' : 'border-line'">
          @if (i.bot) {
            <span class="font-semibold">Not a person’s browser:</span> {{ i.bot }}
          } @else {
            Looks like a regular browser.
          }
        </p>
      }
    </app-tool-page>
  `,
})
export class UserAgentParser {
  protected readonly content = CONTENT;
  protected readonly samples = SAMPLE_AGENTS;
  protected readonly ua = signal(SAMPLE_AGENTS[0].ua);
  protected readonly mine = signal('');
  protected readonly info = computed(() => parseUserAgent(this.ua()));

  constructor() {
    afterNextRender(() => {
      this.mine.set(navigator.userAgent);
      this.ua.set(navigator.userAgent);
    });
    onSharedInput((d) => this.ua.set(d['input'] ?? ''));
  }
}
