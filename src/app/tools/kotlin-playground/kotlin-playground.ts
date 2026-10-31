import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import { onSharedInput } from '../../core/shared-input';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { KOTLIN_SAMPLES } from './kotlin-samples';

const CONTENT: ToolContent = {
  aboutHeading: 'About this Kotlin Playground',
  about:
    'Write and run Kotlin in the browser, with no IDE or Gradle set-up. This page uses the official Kotlin Playground ' +
    'from JetBrains: the editor runs here, with code completion and error highlighting, and when you press Run your ' +
    'code is compiled and run on JetBrains’ Kotlin server (api.kotlinlang.org), the same one behind kotlinlang.org. ' +
    'Good for trying a language feature, checking an answer or sharing a snippet with a teammate.',
  steps: [
    'Pick a sample or write your own main function.',
    'Press the Run button in the editor to see the output.',
    'Use Share link to send the code to someone.',
  ],
  faq: [
    { question: 'Is my code sent anywhere?', answer: 'Yes, when you run it or ask for completions: the code goes to JetBrains’ Kotlin compiler server. Do not paste secrets or private company code. Everything else on DevTools24 runs only in your browser.' },
    { question: 'Which Kotlin version is used?', answer: 'The latest stable version supported by the JetBrains server, targeting the JVM.' },
    { question: 'Can I use Android or other libraries?', answer: 'No. Only the Kotlin standard library is available. Use Android Studio for Android code.' },
  ],
};

interface PlaygroundOptions {
  onChange?: (code: string) => void;
}
type Playground = (target: Element, options?: PlaygroundOptions) => Promise<unknown>;

@Component({
  selector: 'app-kotlin-playground',
  imports: [ShareButton, ToolPage],
  template: `
    <app-tool-page path="kotlin-playground" [content]="content" [wide]="true" privacy="Running code sends it to JetBrains’ Kotlin server (api.kotlinlang.org). Do not paste secrets.">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold">Samples:</span>
        @for (s of samples; track s.label) {
          <button type="button" class="btn-small" (click)="load(s.code)">{{ s.label }}</button>
        }
        <app-share-button path="kotlin-playground" [data]="{ input: code() }" />
      </div>
      <p class="mt-3 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm">
        When you press Run, your code is sent to JetBrains’ Kotlin compiler server to be compiled and run.
      </p>
      @if (status()) {
        <p class="mt-3 text-sm text-muted" role="status">{{ status() }}</p>
      }
      <div #host class="kotlin-host mt-4 min-h-64" aria-label="Kotlin editor"></div>
    </app-tool-page>
  `,
})
export class KotlinPlayground {
  protected readonly content = CONTENT;
  protected readonly samples = KOTLIN_SAMPLES;
  protected readonly code = signal(KOTLIN_SAMPLES[0].code);
  protected readonly status = signal('Loading the Kotlin editor…');

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly theme = inject(ThemeService);
  private playground?: Playground;
  private destroyed = false;

  constructor() {
    afterNextRender(async () => {
      try {
        const mod = await import('kotlin-playground');
        this.playground = mod.default;
        this.status.set('');
        this.mount();
      } catch {
        this.status.set('The Kotlin editor could not be loaded. Check your connection and reload the page.');
      }
    });
    onSharedInput((d) => this.load(d['input'] ?? ''));
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  protected load(code: string): void {
    this.code.set(code);
    this.mount();
  }

  /** The playground reads its code from the element, so a new sample means a fresh element. */
  private mount(): void {
    if (!this.playground || this.destroyed) return;
    const host = this.host().nativeElement;
    host.replaceChildren();
    const el = document.createElement('div');
    el.textContent = this.code();
    el.setAttribute('theme', this.theme.theme() === 'dark' ? 'darcula' : 'idea');
    el.setAttribute('data-target-platform', 'java');
    el.setAttribute('lines', 'true');
    el.setAttribute('match-brackets', 'true');
    el.setAttribute('auto-indent', 'true');
    host.append(el);
    void this.playground(el, { onChange: (code) => this.code.set(code) });
  }
}
