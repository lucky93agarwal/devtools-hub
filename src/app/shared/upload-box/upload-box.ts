import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ICONS, Icon } from '../icon/icon';

/**
 * Large drop zone used as the main action of file-based tools.
 * Files can be dropped, chosen with the button, or pasted (Ctrl/Cmd + V).
 * It only hands the files to the parent; limits are checked by each tool.
 */
@Component({
  selector: 'app-upload-box',
  imports: [Icon],
  host: { '(document:paste)': 'onPaste($event)' },
  template: `
    <div
      class="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors"
      [class]="dragging() ? 'border-brand bg-surface' : 'border-line'"
      (dragenter)="onDragOver($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <span class="grid size-12 place-items-center rounded-full bg-surface text-brand">
        <app-icon [path]="uploadIcon" />
      </span>
      <p class="font-heading text-xl leading-7 font-semibold">{{ title() }}</p>
      <button type="button" class="btn-primary" [disabled]="disabled()" (click)="input().nativeElement.click()">
        {{ buttonLabel() }}
      </button>
      @if (hint()) {
        <p class="text-sm leading-5 text-muted">{{ hint() }}</p>
      }
      <input
        #fileInput
        type="file"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        [accept]="accept()"
        [multiple]="multiple()"
        (change)="onInputChange(fileInput)"
      />
    </div>
  `,
})
export class UploadBox {
  readonly title = input('Drop files here');
  readonly buttonLabel = input('Choose files');
  readonly hint = input('');
  /** Value for the file input's accept attribute, for example "image/*". */
  readonly accept = input('');
  readonly multiple = input(false);
  readonly disabled = input(false);
  /**
   * Drop files that do not match accept before emitting. Turn off when the parent
   * wants every file so it can explain why some were skipped.
   */
  readonly filter = input(true);

  readonly filesSelected = output<File[]>();

  protected readonly dragging = signal(false);
  protected readonly uploadIcon = ICONS.upload;
  protected readonly input = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.dragging.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.emit(event.dataTransfer?.files);
  }

  protected onInputChange(element: HTMLInputElement): void {
    this.emit(element.files);
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
  }

  protected onPaste(event: ClipboardEvent): void {
    this.emit(event.clipboardData?.files);
  }

  private emit(fileList: FileList | null | undefined): void {
    if (this.disabled() || !fileList || fileList.length === 0) {
      return;
    }
    const files = Array.from(fileList).filter((file) => !this.filter() || this.isAccepted(file));
    const selected = this.multiple() ? files : files.slice(0, 1);
    if (selected.length > 0) {
      this.filesSelected.emit(selected);
    }
  }

  /** Checks a file against the accept list, e.g. "image/*,.json". */
  private isAccepted(file: File): boolean {
    const rules = this.accept()
      .split(',')
      .map((rule) => rule.trim().toLowerCase())
      .filter(Boolean);
    if (rules.length === 0) {
      return true;
    }
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return rules.some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
  }
}
