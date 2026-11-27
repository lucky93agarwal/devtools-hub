import { Component, ElementRef, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { HIGHLIGHTS, TEXT_COLORS, escapeHtml, nextListMarker, sanitizeNoteHtml } from './rich-text';

/** What the editor holds: plain text when nothing is formatted, otherwise the allowed HTML. */
export interface EditorValue {
  text: string;
  format: 'text' | 'html';
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function nearest<T extends { hex: string }>(css: string, list: readonly T[]): T | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css) ?? /^#([0-9a-f]{6})$/i.exec(css);
  if (!m) return null;
  const c = m.length === 4 ? [+m[1], +m[2], +m[3]] : rgb(`#${m[1]}`);
  let best: T | null = null;
  let distance = Infinity;
  for (const item of list) {
    const [r, g, b] = rgb(item.hex);
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < distance) [best, distance] = [item, d];
  }
  return best;
}

/**
 * A small rich-text box (contenteditable): bold, italic, underline, text colour and highlight from the
 * toolbar or Ctrl/⌘+B, I, U; smart lists ("1. ", "a. ", "* " continue on Enter, an empty item ends the
 * list); grows up to 5 lines, then scrolls. Enter sends (unless in a list), Shift+Enter adds a line,
 * Ctrl/⌘+Enter always sends.
 */
@Component({
  selector: 'app-rich-editor',
  host: { class: 'flex min-w-0 flex-col gap-1' },
  styles: `
    .rich-box { white-space: pre-wrap; overflow-wrap: anywhere; max-height: calc(5 * 1.5em + 1rem); overflow-y: auto; line-height: 1.5; }
    .rich-box:empty::before { content: attr(data-placeholder); color: var(--color-muted); pointer-events: none; }
  `,
  template: `
    @if (toolbar()) {
      <div class="flex flex-wrap items-center gap-1" role="toolbar" [attr.aria-label]="label() + ' formatting'">
        <button type="button" class="btn-small !px-2 font-bold" title="Bold (Ctrl+B)" aria-label="Bold" (mousedown)="$event.preventDefault(); run('bold')">B</button>
        <button type="button" class="btn-small !px-2 italic" title="Italic (Ctrl+I)" aria-label="Italic" (mousedown)="$event.preventDefault(); run('italic')">I</button>
        <button type="button" class="btn-small !px-2 underline" title="Underline (Ctrl+U)" aria-label="Underline" (mousedown)="$event.preventDefault(); run('underline')">U</button>
        <span class="relative">
          <button type="button" class="btn-small !px-2" title="Text colour" aria-label="Text colour" [attr.aria-expanded]="menu() === 'color'" (mousedown)="$event.preventDefault(); toggle('color')"><span class="font-bold text-red-600">A</span></button>
          @if (menu() === 'color') {
            <span class="absolute bottom-full left-0 z-30 mb-1 flex gap-1 rounded-xl border border-line bg-page p-1.5 shadow-lg" role="menu" aria-label="Text colours">
              @for (c of colors; track c.id) {
                <button type="button" role="menuitem" class="h-6 w-6 rounded-full border border-line" [style.background]="c.hex" [title]="c.label" [attr.aria-label]="c.label + ' text'" (mousedown)="$event.preventDefault(); color(c.hex)"></button>
              }
            </span>
          }
        </span>
        <span class="relative">
          <button type="button" class="btn-small !px-2" title="Highlight" aria-label="Highlight" [attr.aria-expanded]="menu() === 'mark'" (mousedown)="$event.preventDefault(); toggle('mark')"><span class="rounded bg-yellow-300 px-1 text-black">ab</span></button>
          @if (menu() === 'mark') {
            <span class="absolute bottom-full left-0 z-30 mb-1 flex gap-1 rounded-xl border border-line bg-page p-1.5 shadow-lg" role="menu" aria-label="Highlight colours">
              @for (c of highlights; track c.id) {
                <button type="button" role="menuitem" class="h-6 w-6 rounded-full border border-line" [style.background]="c.hex" [title]="c.label" [attr.aria-label]="c.label + ' highlight'" (mousedown)="$event.preventDefault(); mark(c.hex)"></button>
              }
            </span>
          }
        </span>
        <button type="button" class="btn-small !px-2 text-xs" title="Clear formatting" aria-label="Clear formatting" (mousedown)="$event.preventDefault(); run('removeFormat')">T̸</button>
      </div>
    }
    <div
      #box
      class="rich-box field min-h-10 !py-2 text-sm"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      [attr.aria-label]="label()"
      [attr.data-placeholder]="placeholder()"
      (keydown)="key($event)"
      (input)="changed()"
      (paste)="paste($event)"
    ></div>
  `,
})
export class RichEditor {
  readonly label = input('Note');
  readonly placeholder = input('');
  readonly toolbar = input(true);
  /** Starting content (for editing). */
  readonly initial = input<EditorValue | null>(null);
  /** Enter sends (the new-note box); false: Enter adds a line (editing). */
  readonly enterSends = input(true);
  readonly submitted = output<void>();
  readonly empty = output<boolean>();
  /** Files pasted into the box (screenshots). */
  readonly files = output<File[]>();

  protected readonly colors = TEXT_COLORS;
  protected readonly highlights = HIGHLIGHTS;
  protected readonly menu = signal<'' | 'color' | 'mark'>('');
  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');

  constructor() {
    afterNextRender(() => {
      const start = this.initial();
      if (start) this.box().nativeElement.innerHTML = start.format === 'html' ? sanitizeNoteHtml(start.text).replace(/<br>/g, '\n') : escapeHtml(start.text);
      this.changed();
    });
  }

  focus(): void {
    this.box().nativeElement.focus();
  }

  clear(): void {
    this.box().nativeElement.innerHTML = '';
    this.changed();
  }

  /** The content: plain text when nothing is formatted, otherwise the allowed HTML. */
  value(): EditorValue {
    const html = this.serialize(this.box().nativeElement).replace(/\n$/, '');
    const plain = !/<(b|i|u|span|mark)\b/.test(html);
    if (plain) return { text: this.box().nativeElement.innerText.replace(/ /g, ' ').replace(/\n$/, ''), format: 'text' };
    return { text: sanitizeNoteHtml(html.replace(/\n/g, '<br>')), format: 'html' };
  }

  protected changed(): void {
    const el = this.box().nativeElement;
    // An empty box must be truly empty for the placeholder to show.
    if (!el.textContent && el.innerHTML && !el.querySelector('img')) el.innerHTML = '';
    this.empty.emit(!el.textContent?.trim());
  }

  protected toggle(menu: 'color' | 'mark'): void {
    this.menu.set(this.menu() === menu ? '' : menu);
  }

  protected run(command: 'bold' | 'italic' | 'underline' | 'removeFormat'): void {
    this.box().nativeElement.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command);
    this.menu.set('');
    this.changed();
  }

  protected color(hex: string): void {
    this.box().nativeElement.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, hex);
    this.menu.set('');
    this.changed();
  }

  protected mark(hex: string): void {
    this.box().nativeElement.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('hiliteColor', false, hex);
    this.menu.set('');
    this.changed();
  }

  /** Text from the start of the current line to the caret. */
  private currentLine(): string {
    const selection = getSelection();
    if (!selection?.rangeCount) return '';
    const range = selection.getRangeAt(0).cloneRange();
    range.setStart(this.box().nativeElement, 0);
    // Line breaks may be "\n" text, <br> or <div>, so the copy is read the same way the note is saved.
    const holder = document.createElement('div');
    holder.append(range.cloneContents());
    const before = this.serialize(holder)
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    return before.slice(before.lastIndexOf('\n') + 1);
  }

  protected key(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      this.run(({ b: 'bold', i: 'italic', u: 'underline' } as const)[event.key.toLowerCase() as 'b' | 'i' | 'u']);
      return;
    }
    if (event.key === ' ' && !mod) {
      // "* " or "- " at the start of a line becomes a bullet.
      const line = this.currentLine();
      if (/^\s*[*-]$/.test(line)) {
        event.preventDefault();
        document.execCommand('delete');
        document.execCommand('insertText', false, '• ');
      }
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (mod) return this.submitted.emit();
    const list = nextListMarker(this.currentLine());
    if (list && !event.shiftKey) {
      if (list.empty) {
        // Enter on an empty item ends the list: remove the marker.
        const line = this.currentLine();
        for (let i = 0; i < line.length; i++) document.execCommand('delete');
      } else document.execCommand('insertText', false, `\n${list.next}`);
      this.changed();
      return;
    }
    if (event.shiftKey || !this.enterSends()) {
      document.execCommand('insertText', false, '\n');
      this.changed();
      return;
    }
    this.submitted.emit();
  }

  /** Pasted text arrives without outside formatting; pasted files are handed over. */
  protected paste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])];
    event.preventDefault();
    if (files.length) return this.files.emit(files);
    document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
    this.changed();
  }

  /** The box's DOM as allowed HTML, with "\n" for line breaks. */
  private serialize(node: Node): string {
    let out = '';
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += escapeHtml((child.textContent ?? '').replace(/ /g, ' '));
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        out += '\n';
        continue;
      }
      let inner = this.serialize(child);
      if (tag === 'div' || tag === 'p') {
        out += (out && !out.endsWith('\n') ? '\n' : '') + inner;
        continue;
      }
      const style = child.style;
      if (tag === 'b' || tag === 'strong' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) inner = `<b>${inner}</b>`;
      if (tag === 'i' || tag === 'em' || style.fontStyle === 'italic') inner = `<i>${inner}</i>`;
      if (tag === 'u' || /underline/.test(style.textDecoration)) inner = `<u>${inner}</u>`;
      const color = style.color || (tag === 'font' ? (child.getAttribute('color') ?? '') : '');
      const textColor = color ? nearest(color, TEXT_COLORS) : null;
      if (textColor) inner = `<span class="tc-${textColor.id}">${inner}</span>`;
      const highlight = style.backgroundColor ? nearest(style.backgroundColor, HIGHLIGHTS) : null;
      if (highlight) inner = `<mark class="hl-${highlight.id}">${inner}</mark>`;
      out += inner;
    }
    return out;
  }
}
