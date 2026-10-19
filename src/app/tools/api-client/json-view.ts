import { Component, ElementRef, OnDestroy, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { JsonNode } from '../json-formatter/json-tree';
import { decodeJwt, timeClaims, tokenTiming } from '../jwt/jwt-tools';
import { copyText, downloadBlob } from '../../shared/file-utils';
import { ICONS, Icon } from '../../shared/icon/icon';
import {
  PAGE,
  TreeRow,
  buildRows,
  containerIds,
  copyTextFor,
  defaultCollapsed,
  fileNameFromUrl,
  summary,
  typeInfo,
  urlKind,
} from './json-view-model';

interface Popover {
  row: TreeRow;
  /** "key" shows the type and path; "value" previews a link or decodes a token. */
  mode: 'key' | 'value';
  pinned: boolean;
  left: number;
  width: number;
  /** Either top or bottom is set, so the popover opens below or above the anchor. */
  top: number | null;
  bottom: number | null;
  /** The room left on that side, so a tall popover scrolls instead of leaving the screen. */
  maxHeight: number;
}

const TIMING_TEXT = {
  expired: 'Expired',
  'not-yet-valid': 'Not valid yet',
  active: 'Active',
  'no-expiry': 'No expiry',
} as const;

/**
 * A JSON response as a tree: fold any object or array, copy any part of it,
 * hover a key for its type, hover a token to decode it and a link to preview it.
 * Hovering opens a popover; clicking keeps it open so its text can be copied.
 */
@Component({
  selector: 'app-json-view',
  imports: [Icon],
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
    '(window:scroll)': 'reposition()',
    '(window:resize)': 'reposition()',
  },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn-small" (click)="expandAll()">Expand all</button>
      <button type="button" class="btn-small" (click)="collapseAll()">Collapse all</button>
      <span class="text-xs text-muted">
        Hover a key for its type, or a link or token for a preview. Click to keep it open.
      </span>
      <span class="text-sm font-semibold text-success" aria-live="polite">{{ message() }}</span>
    </div>
    <div
      class="mt-2 max-h-[32rem] overflow-auto rounded-xl border border-line py-2 font-mono text-[13px] leading-6"
      aria-label="Response body tree"
      role="region"
      (scroll)="reposition()"
    >
      @for (row of rows(); track row.id) {
        <div
          class="group flex min-w-0 items-start gap-1 pr-2 hover:bg-surface"
          [style.padding-left.px]="8 + row.depth * 16"
        >
          @switch (row.kind) {
            @case ('more') {
              <button type="button" class="font-sans text-sm font-semibold text-brand hover:underline" (click)="showMore(row)">
                Show {{ row.hidden! < page ? row.hidden : page }} more of {{ row.hidden }}
              </button>
            }
            @case ('close') {
              <span class="pl-5">{{ row.valueKind === 'object' ? '}' : ']' }}{{ row.comma ? ',' : '' }}</span>
            }
            @default {
              @if (row.kind === 'open' && row.count > 0) {
                <button
                  type="button"
                  class="mt-1 flex size-4 shrink-0 items-center justify-center rounded text-muted hover:text-ink"
                  [attr.aria-expanded]="!row.collapsed"
                  [attr.aria-label]="(row.collapsed ? 'Expand ' : 'Collapse ') + row.path"
                  (click)="toggle(row)"
                >
                  <svg viewBox="0 0 24 24" class="size-3 transition-transform" [class.rotate-90]="!row.collapsed" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  </svg>
                </button>
              } @else {
                <span class="w-4 shrink-0"></span>
              }
              <span class="min-w-0 break-all">
                @if (row.key !== null) {
                  <span
                    tabindex="0"
                    class="cursor-help rounded hover:bg-line"
                    [class]="row.isIndex ? 'text-muted' : 'font-semibold text-ink'"
                    [attr.aria-label]="'Type of ' + row.path"
                    (mouseenter)="hover(row, 'key', $event)"
                    (mouseleave)="leave()"
                    (focus)="hover(row, 'key', $event)"
                    (click)="pin(row, 'key', $event)"
                    (keydown.enter)="pin(row, 'key', $event)"
                    >{{ row.isIndex ? row.key : '"' + row.key + '"' }}</span
                  ><span class="text-muted">: </span>
                }
                @if (row.kind === 'open') {
                  @if (row.count === 0) {
                    <span>{{ row.valueKind === 'object' ? '{}' : '[]' }}{{ row.comma ? ',' : '' }}</span>
                  } @else if (row.collapsed) {
                    <button type="button" class="rounded hover:bg-line" (click)="toggle(row)">
                      {{ row.valueKind === 'object' ? '{…}' : '[…]' }}</button
                    >{{ row.comma ? ',' : '' }}
                    <span class="font-sans text-xs text-muted">{{ summaryOf(row) }}</span>
                  } @else {
                    <span>{{ row.valueKind === 'object' ? '{' : '[' }}</span>
                  }
                } @else if (row.format === 'jwt' || row.format === 'url') {
                  <span
                    tabindex="0"
                    class="cursor-pointer rounded text-success underline decoration-dotted underline-offset-4 hover:bg-line"
                    [attr.aria-label]="(row.format === 'jwt' ? 'Decode token at ' : 'Preview link at ') + row.path"
                    (mouseenter)="hover(row, 'value', $event)"
                    (mouseleave)="leave()"
                    (focus)="hover(row, 'value', $event)"
                    (click)="pin(row, 'value', $event)"
                    (keydown.enter)="pin(row, 'value', $event)"
                    >{{ row.node.kind === 'raw' ? row.node.text : '' }}</span
                  >{{ row.comma ? ',' : '' }}
                } @else {
                  <span [class]="valueClass[row.valueKind]">{{ row.node.kind === 'raw' ? row.node.text : '' }}</span
                  >{{ row.comma ? ',' : '' }}
                }
              </span>
              <button
                type="button"
                class="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 font-sans text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:bg-line hover:text-ink focus:opacity-100 [@media(hover:none)]:opacity-100"
                [attr.aria-label]="'Copy ' + row.path"
                (click)="copyRow(row)"
              >
                <app-icon [path]="icons.copy" [size]="12" /> Copy
              </button>
            }
          }
        </div>
      }
    </div>

    @if (popover(); as p) {
      <div
        #popoverBox
        class="fixed z-50 flex flex-col gap-2 overflow-auto rounded-xl border border-line bg-page p-3 text-sm leading-5 text-ink shadow-xl"
        role="dialog"
        [attr.aria-label]="p.mode === 'key' ? 'Type of ' + p.row.path : p.row.format === 'jwt' ? 'Decoded token' : 'Link preview'"
        [style.left.px]="p.left"
        [style.width.px]="p.width"
        [style.top.px]="p.top"
        [style.bottom.px]="p.bottom"
        [style.max-height.px]="p.maxHeight"
        (mouseenter)="cancelClose()"
        (mouseleave)="leave()"
      >
        <div class="flex items-start gap-2">
          <code class="min-w-0 flex-1 font-mono text-xs break-all text-muted">{{ p.row.path }}</code>
          @if (p.pinned) {
            <button type="button" class="shrink-0 text-muted hover:text-ink" aria-label="Close" (click)="close()">
              <app-icon [path]="icons.close" [size]="16" />
            </button>
          }
        </div>

        @if (p.mode === 'key') {
          @let info = typeOf(p.row);
          <p><span class="font-semibold">{{ info.label }}</span></p>
          <p class="text-muted break-words">{{ info.detail }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-small" (click)="copy(p.row.path, 'Path')">
              <app-icon [path]="icons.copy" [size]="14" /> Copy path
            </button>
            <button type="button" class="btn-small" (click)="copyRow(p.row)">
              <app-icon [path]="icons.copy" [size]="14" /> Copy value
            </button>
          </div>
        } @else if (p.row.format === 'jwt') {
          @if (jwt(); as token) {
            <p class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">JSON Web Token</span>
              <span class="chip px-2 py-0.5 text-xs">{{ token.alg }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                [class]="token.timing === 'expired' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'"
                >{{ token.timingText }}</span
              >
            </p>
            @for (claim of token.times; track claim.name) {
              <p class="text-xs">
                <span class="font-semibold">{{ claim.label }}:</span> {{ claim.date.toLocaleString() }} ({{ claim.relative }})
              </p>
            }
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-muted uppercase">Header</span>
              <button type="button" class="btn-small px-2 py-0.5 text-xs" (click)="copy(token.header, 'Header')">Copy</button>
            </div>
            <pre class="overflow-x-auto rounded-lg bg-surface p-2 font-mono text-xs select-text">{{ token.header }}</pre>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-muted uppercase">Payload</span>
              <button type="button" class="btn-small px-2 py-0.5 text-xs" (click)="copy(token.payload, 'Payload')">Copy</button>
            </div>
            <pre class="overflow-x-auto rounded-lg bg-surface p-2 font-mono text-xs select-text">{{ token.payload }}</pre>
            <p class="text-xs text-muted">Decoded only: the signature is not checked.</p>
            <button type="button" class="btn-small self-start" (click)="copyRow(p.row)">
              <app-icon [path]="icons.copy" [size]="14" /> Copy token
            </button>
          }
        } @else {
          @let url = p.row.value!;
          @let kind = linkKind();
          <a [href]="url" target="_blank" rel="noopener noreferrer" class="font-mono text-xs break-all text-brand hover:underline">{{ url }}</a>
          @switch (kind) {
            @case ('video') {
              <video [src]="url" controls muted preload="metadata" class="max-h-48 w-full rounded-lg bg-surface"></video>
            }
            @case ('audio') {
              <audio [src]="url" controls preload="none" class="w-full"></audio>
            }
            @case ('pdf') {
              @if (pdfSrc(); as src) {
                <iframe [src]="src" title="PDF preview" referrerpolicy="no-referrer" class="h-72 w-full rounded-lg border border-line bg-white"></iframe>
              } @else {
                <button type="button" class="btn-small self-start" [disabled]="busy()" (click)="previewPdf(url)">
                  {{ busy() ? 'Loading…' : 'Show PDF' }}
                </button>
              }
            }
            @case ('other') {
              <p class="text-xs text-muted">No preview for this kind of link.</p>
            }
            @default {
              @if (imageFailed()) {
                @if (kind === 'unknown') {
                  <p class="text-xs text-muted">No preview for this link.</p>
                } @else {
                  <p class="text-xs text-danger">The image could not be loaded.</p>
                }
              } @else {
                <img
                  [src]="url"
                  alt="Preview of the linked image"
                  referrerpolicy="no-referrer"
                  class="checkerboard max-h-48 self-start rounded-lg border border-line object-contain"
                  [class.hidden]="!imageSize()"
                  (load)="imageLoaded($event)"
                  (error)="imageFailed.set(true)"
                />
                @if (imageSize(); as size) {
                  <p class="text-xs text-muted">{{ size }}</p>
                } @else {
                  <p class="text-xs text-muted">Loading preview…</p>
                }
              }
            }
          }
          <div class="flex flex-wrap gap-2">
            <a [href]="url" target="_blank" rel="noopener noreferrer" class="btn-small">Open</a>
            <button type="button" class="btn-small" [disabled]="busy()" (click)="download(url)">
              <app-icon [path]="icons.download" [size]="14" /> Download
            </button>
            <button type="button" class="btn-small" (click)="copyRow(p.row)">
              <app-icon [path]="icons.copy" [size]="14" /> Copy link
            </button>
          </div>
          <p class="text-xs text-muted">Previews load straight from that server.</p>
        }
      </div>
    }
  `,
})
export class JsonView implements OnDestroy {
  readonly root = input.required<JsonNode>();

  protected readonly icons = ICONS;
  protected readonly page = PAGE;
  protected readonly valueClass: Record<string, string> = {
    string: 'text-success',
    number: 'text-brand',
    boolean: 'text-warning',
    null: 'text-muted',
  };

  protected readonly collapsed = linkedSignal(() => defaultCollapsed(this.root()));
  protected readonly shown = linkedSignal<JsonNode, Map<string, number>>({ source: this.root, computation: () => new Map() });
  protected readonly rows = computed(() => buildRows(this.root(), this.collapsed(), this.shown()));

  protected readonly popover = signal<Popover | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly imageFailed = signal(false);
  protected readonly imageSize = signal('');
  /** The PDF to show in the frame: a local copy when the server allows it, else the link itself. */
  protected readonly pdfSrc = signal<SafeResourceUrl | null>(null);
  protected readonly linkKind = computed(() => {
    const value = this.popover()?.row.value;
    return value ? urlKind(value) : 'other';
  });
  protected readonly jwt = computed(() => {
    const p = this.popover();
    if (p?.mode !== 'value' || p.row.format !== 'jwt') return null;
    const result = decodeJwt(p.row.value ?? '');
    if (!result.ok) return null;
    const now = new Date();
    const timing = tokenTiming(result.jwt.payload, now);
    return {
      alg: String(result.jwt.header['alg'] ?? 'unknown'),
      header: result.jwt.headerText,
      payload: result.jwt.payloadText,
      times: timeClaims(result.jwt.payload, now),
      timing,
      timingText: TIMING_TEXT[timing],
    };
  });

  private readonly sanitizer = inject(DomSanitizer);
  private readonly box = viewChild<ElementRef<HTMLElement>>('popoverBox');
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private anchor: HTMLElement | null = null;
  private pdfUrl: string | null = null;
  private messageTimer?: ReturnType<typeof setTimeout>;

  protected summaryOf = summary;
  protected typeOf = typeInfo;

  protected toggle(row: TreeRow): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  protected collapseAll(): void {
    this.collapsed.set(containerIds(this.root(), 1));
  }

  protected showMore(row: TreeRow): void {
    const id = row.id.slice(0, -'/more'.length);
    this.shown.update((map) => new Map(map).set(id, (map.get(id) ?? PAGE) + PAGE));
  }

  // Popover

  protected hover(row: TreeRow, mode: Popover['mode'], event: Event): void {
    const target = event.currentTarget as HTMLElement;
    this.cancelClose();
    clearTimeout(this.openTimer);
    const current = this.popover();
    if (current?.pinned) return;
    if (current && current.row.id === row.id && current.mode === mode) return;
    // A short wait, so moving the mouse across the tree does not flash popovers.
    this.openTimer = setTimeout(() => this.open(row, mode, target, false), event.type === 'focus' ? 0 : 150);
  }

  protected pin(row: TreeRow, mode: Popover['mode'], event: Event): void {
    event.stopPropagation();
    clearTimeout(this.openTimer);
    this.cancelClose();
    const current = this.popover();
    if (current && current.row.id === row.id && current.mode === mode) {
      this.popover.set({ ...current, pinned: true });
      return;
    }
    this.open(row, mode, event.currentTarget as HTMLElement, true);
  }

  protected leave(): void {
    clearTimeout(this.openTimer);
    if (this.popover()?.pinned) return;
    this.closeTimer = setTimeout(() => this.close(), 200);
  }

  protected cancelClose(): void {
    clearTimeout(this.closeTimer);
  }

  protected close(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.closeOpen();
  }

  /** Keeps an open popover next to its key or value while the page or tree scrolls. */
  protected reposition(): void {
    const current = this.popover();
    if (!current || !this.anchor) return;
    if (!this.anchor.isConnected) {
      this.closeOpen();
      return;
    }
    this.popover.set({ ...current, ...this.place(this.anchor, current.mode) });
  }

  private closeOpen(): void {
    if (!this.popover()) return;
    this.popover.set(null);
    this.anchor = null;
    this.releasePdf();
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!this.popover() || !target) return;
    if (this.box()?.nativeElement.contains(target) || this.anchor?.contains(target)) return;
    this.close();
  }

  private open(row: TreeRow, mode: Popover['mode'], anchor: HTMLElement, pinned: boolean): void {
    this.releasePdf();
    this.imageFailed.set(false);
    this.imageSize.set('');
    this.anchor = anchor;
    this.popover.set({ row, mode, pinned, ...this.place(anchor, mode) });
  }

  private place(anchor: HTMLElement, mode: Popover['mode']): Pick<Popover, 'left' | 'width' | 'top' | 'bottom' | 'maxHeight'> {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(mode === 'key' ? 320 : 400, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    // Open above the anchor when there is clearly more room there.
    const below = window.innerHeight - rect.bottom;
    const above = below < 300 && rect.top > below;
    return {
      left,
      width,
      top: above ? null : rect.bottom + 4,
      bottom: above ? window.innerHeight - rect.top + 4 : null,
      maxHeight: Math.max(160, Math.min(448, (above ? rect.top : below) - 12)),
    };
  }

  // Actions

  protected async copyRow(row: TreeRow): Promise<void> {
    const name = row.key === null ? 'Response' : row.isIndex ? `Item ${row.key}` : `"${row.key}"`;
    await this.copy(copyTextFor(row), name);
  }

  protected async copy(text: string, label: string): Promise<void> {
    this.say((await copyText(text)) ? `${label} copied` : 'Copy failed');
  }

  protected imageLoaded(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.imageSize.set(`${image.naturalWidth} × ${image.naturalHeight} px`);
  }

  /** Saves the file. Servers that do not allow other sites to read it are opened in a new tab instead. */
  protected async download(url: string): Promise<void> {
    this.busy.set(true);
    try {
      const blob = await this.fetchBlob(url);
      downloadBlob(blob, fileNameFromUrl(url, blob.type));
      this.say('Download started');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
      this.say('That server does not allow downloads from other sites, so the file opened in a new tab');
    } finally {
      this.busy.set(false);
    }
  }

  /** Loads the PDF as a file first, since many servers refuse to be shown in a frame. */
  protected async previewPdf(url: string): Promise<void> {
    this.busy.set(true);
    try {
      const blob = await this.fetchBlob(url);
      this.releasePdf();
      this.pdfUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      this.pdfSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl));
    } catch {
      // Only http(s) links reach here (see stringFormat), so the frame cannot run a script URL.
      this.pdfSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    } finally {
      this.busy.set(false);
    }
  }

  private async fetchBlob(url: string): Promise<Blob> {
    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  }

  /** Shows a short message next to the tree buttons, such as "Path copied". */
  private say(text: string): void {
    this.message.set(text);
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => this.message.set(''), 4000);
  }

  private releasePdf(): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    this.pdfUrl = null;
    this.pdfSrc.set(null);
  }

  ngOnDestroy(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    clearTimeout(this.messageTimer);
    this.releasePdf();
  }
}

