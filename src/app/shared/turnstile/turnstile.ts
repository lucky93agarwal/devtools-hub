import { Component, DestroyRef, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { turnstileKeyFor } from '../../core/app-config';

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's Turnstile script once. */
function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile: the "are you human?" check on account forms. It usually passes
 * on its own without a puzzle. Emits the token to send with the form, or '' when it expires.
 */
@Component({
  selector: 'app-turnstile',
  // The key depends on the address, known only in the browser; without one nothing is shown.
  template: `<div #box [class.min-h-[65px]]="on()"></div>`,
})
export class Turnstile {
  readonly token = output<string>();
  protected readonly on = signal(false);
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private widget: string | null = null;
  private api: TurnstileApi | null = null;

  constructor() {
    afterNextRender(async () => {
      const box = this.box()?.nativeElement;
      const sitekey = turnstileKeyFor(location.hostname);
      if (!box || !sitekey) return;
      this.on.set(true);
      try {
        this.api = await loadTurnstile();
        this.widget = this.api.render(box, {
          sitekey,
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (t: string) => this.token.emit(t),
          'expired-callback': () => this.token.emit(''),
          'error-callback': () => this.token.emit(''),
        });
      } catch {
        // Without the script (offline), the server explains that the check is missing.
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.api && this.widget) this.api.remove(this.widget);
    });
  }

  /** A token works once: get a fresh one after every submit. */
  reset(): void {
    this.token.emit('');
    if (this.api && this.widget) this.api.reset(this.widget);
  }
}
