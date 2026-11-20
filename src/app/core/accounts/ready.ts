import { Signal, afterNextRender, signal } from '@angular/core';

/**
 * True once the page's code is running in the browser. The prerendered page shows forms
 * before that; their buttons stay off until then, so a form is never sent by the browser
 * on its own (which would put the password in the address bar).
 */
export function pageReady(): Signal<boolean> {
  const ready = signal(false);
  afterNextRender(() => ready.set(true));
  return ready.asReadonly();
}
