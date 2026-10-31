import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { prefill, prefillFiles } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';

const TOAST_MS = 4000;

const typingIn = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], .monaco-editor');

/**
 * Site-wide helpers: drop a file anywhere to open it in the right tool, keyboard shortcuts in every tool,
 * and the list of shortcuts (press ?).
 */
@Component({
  selector: 'app-global-actions',
  host: {
    '(window:dragover)': 'onDragOver($event)',
    '(window:dragleave)': 'onDragLeave($event)',
    '(window:drop)': 'onDrop($event)',
  },
  template: `
    @if (dragging()) {
      <div class="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/10 p-6 backdrop-blur-[1px]" aria-hidden="true">
        <p class="rounded-2xl border-2 border-dashed border-brand bg-page px-8 py-6 text-center font-heading text-xl font-semibold shadow-xl">
          Drop the file to open it in the right tool
        </p>
      </div>
    }
    @if (toast(); as message) {
      <p class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-page shadow-lg" role="status">{{ message }}</p>
    }
    <dialog #helpDialog class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-page p-0 text-ink shadow-2xl backdrop:bg-black/40" aria-label="Keyboard shortcuts" (click)="onHelpClick($event)">
      <div class="p-5">
        <h2 class="text-xl leading-7">Keyboard shortcuts</h2>
        <dl class="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          @for (s of shortcuts; track s.keys) {
            <dt><kbd class="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs">{{ s.keys }}</kbd></dt>
            <dd class="text-muted">{{ s.does }}</dd>
          }
        </dl>
        <p class="mt-4 text-xs text-muted">On a Mac, use ⌘ instead of Ctrl. Files can be dropped anywhere on the site.</p>
        <button type="button" class="btn-small mt-4" (click)="help().nativeElement.close()">Close</button>
      </div>
    </dialog>
  `,
})
export class GlobalActions {
  protected readonly dragging = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly shortcuts = [
    { keys: 'Ctrl K  or  /', does: 'Search all tools' },
    { keys: 'Ctrl Enter', does: 'Run the tool (Format, Convert, Compare…)' },
    { keys: 'Ctrl Shift Enter', does: 'Copy the result' },
    { keys: '?', does: 'Show these shortcuts' },
    { keys: 'Esc', does: 'Close a menu or dialog' },
  ];
  protected readonly help = viewChild.required<ElementRef<HTMLDialogElement>>('helpDialog');
  private readonly router = inject(Router);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Capture phase, so the code editor does not swallow Ctrl+Enter first.
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    afterNextRender(() => addEventListener('keydown', onKey, true));
    inject(DestroyRef).onDestroy(() => {
      if (typeof removeEventListener !== 'undefined') removeEventListener('keydown', onKey, true);
      clearTimeout(this.toastTimer);
    });
  }

  private onKey(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === 'Enter') {
      const selector = event.shiftKey ? 'main app-copy-button button:not(:disabled)' : 'main .btn-primary:not(:disabled)';
      const button = [...document.querySelectorAll<HTMLElement>(selector)].find((b) => b.offsetParent !== null);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      button.click();
    } else if (event.key === '?' && !mod && !typingIn(event.target)) {
      event.preventDefault();
      this.help().nativeElement.showModal();
    }
  }

  protected onHelpClick(event: MouseEvent): void {
    if (event.target === this.help().nativeElement) this.help().nativeElement.close();
  }

  private carriesFiles(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('Files');
  }

  protected onDragOver(event: DragEvent): void {
    // A tool's own drop area handles the file itself (and cancels the event first).
    if (!this.carriesFiles(event) || event.defaultPrevented) {
      this.dragging.set(false);
      return;
    }
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!event.relatedTarget) this.dragging.set(false);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    this.dragging.set(false);
    if (!this.carriesFiles(event) || event.defaultPrevented) return;
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    // Loaded only when a file is dropped, to keep the first page load small.
    const { routeFile } = await import('../../core/file-router');
    const route = await routeFile(files[0]);
    if ('error' in route) {
      this.show(route.error);
      return;
    }
    if ('files' in route) prefillFiles(route.path, files);
    else prefill(route.path, route.data);
    this.show(`Opening ${files[0].name} in ${TOOLS.find((t) => t.path === route.path)?.name ?? route.path}`);
    // On the same page the tool would not start again, so load it fresh.
    if (this.router.url.split(/[?#]/)[0] === `/${route.path}`) await this.router.navigateByUrl('/', { skipLocationChange: true });
    await this.router.navigateByUrl('/' + route.path);
  }

  private show(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }
}
