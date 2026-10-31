import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ThemeService } from '../../core/theme.service';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';

const CONTENT: ToolContent = {
  aboutHeading: 'About this Dart and Flutter playground',
  about:
    'Try Dart and Flutter code without installing the SDK. This page embeds DartPad, the official online editor from ' +
    'the Dart team at Google, which compiles your code and runs it right in the page, including Flutter widgets. Open ' +
    'it with the default example, or load a GitHub gist by its id, the way Flutter docs and tutorials share code.',
  steps: [
    'Press Open DartPad, or paste a GitHub gist id or link first.',
    'Edit the code and press Run in DartPad.',
    'Flutter code shows its UI on the right side of DartPad.',
  ],
  faq: [
    { question: 'Is my code sent anywhere?', answer: 'DartPad is a Google service: it compiles your code on Google’s servers and runs it in your browser. Do not paste secrets. Nothing goes to DevTools24.' },
    { question: 'Why does DartPad only open when I press the button?', answer: 'So the Google page, with its own cookies and scripts, loads only when you choose to use it.' },
    { question: 'How do I share my code?', answer: 'Save it as a public GitHub gist and share the gist id or link. Opening this page with it loads the same code.' },
  ],
};

/** Accepts a gist id, a gist.github.com link or a dartpad.dev link with ?id=. */
export function gistId(text: string): string | null {
  const t = text.trim();
  const match = /(?:[?&]id=|gist\.github\.com\/(?:[\w-]+\/)?)?([0-9a-f]{20,40})\b/i.exec(t);
  return match ? match[1].toLowerCase() : null;
}

@Component({
  selector: 'app-dartpad',
  imports: [ToolPage],
  template: `
    <app-tool-page path="dartpad" [content]="content" [wide]="true" privacy="DartPad is run by Google on dartpad.dev. It loads only when you press Open DartPad.">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-semibold">GitHub gist id or link, optional
          <input class="field mt-1 w-80 max-w-full font-mono" [value]="gist()" (input)="gist.set($any($event.target).value)" placeholder="5c0e154dd50af4a9ac856908061291bc" />
        </label>
        <button type="button" class="btn-primary" (click)="opened.set(true)">{{ opened() ? 'Reload DartPad' : 'Open DartPad' }}</button>
      </div>
      @if (gist().trim() && !id()) {
        <p class="mt-2 text-sm text-danger">This does not look like a gist id. It is a 20 to 32 character hex code.</p>
      }
      <p class="mt-3 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm">
        DartPad is a Google service. Your code is compiled on Google’s servers. Do not paste secrets.
      </p>
      @if (opened()) {
        <iframe class="mt-4 h-[42rem] w-full rounded-xl border border-line" title="DartPad" [src]="src()" allow="clipboard-write" referrerpolicy="no-referrer"></iframe>
      } @else {
        <div class="card mt-4 grid h-64 place-items-center p-4 text-center text-sm text-muted">Press Open DartPad to load the editor from dartpad.dev.</div>
      }
    </app-tool-page>
  `,
})
export class Dartpad {
  protected readonly content = CONTENT;
  protected readonly gist = signal('');
  protected readonly opened = signal(false);
  protected readonly id = computed(() => gistId(this.gist()));
  private readonly theme = inject(ThemeService);
  private readonly sanitizer = inject(DomSanitizer);
  /** Only dartpad.dev with a checked gist id and theme is ever framed. */
  protected readonly src = computed(() => {
    const params = new URLSearchParams({ theme: this.theme.theme() === 'dark' ? 'dark' : 'light' });
    const id = this.id();
    if (id) params.set('id', id);
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://dartpad.dev/?${params}`);
  });
}
