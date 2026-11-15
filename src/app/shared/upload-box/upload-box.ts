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
      <div class="flex flex-wrap justify-center gap-2">
        <button type="button" class="btn-primary" [disabled]="disabled()" (click)="input().nativeElement.click()">
          {{ buttonLabel() }}
        </button>
        @if (folders()) {
          <button type="button" class="btn-secondary" [disabled]="disabled()" (click)="folderInput.click()">
            Choose folder
          </button>
          <input
            #folderInput
            type="file"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            webkitdirectory
            multiple
            (change)="onInputChange(folderInput)"
          />
        }
      </div>
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
  /** Also take whole folders: a "Choose folder" button, and folders dropped on the box (read with subfolders). */
  readonly folders = input(false);

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

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    const transfer = event.dataTransfer;
    const entries = this.folders() ? folderEntries(transfer) : [];
    if (entries.length) {
      this.emit(await readEntries(entries));
      return;
    }
    this.emit(transfer?.files);
  }

  protected onInputChange(element: HTMLInputElement): void {
    this.emit(element.files);
    // Reset so choosing the same file again still fires a change event.
    element.value = '';
  }

  protected onPaste(event: ClipboardEvent): void {
    this.emit(event.clipboardData?.files);
  }

  private emit(fileList: FileList | File[] | null | undefined): void {
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

/** Folder and file entries of a drop, when at least one dropped item is a folder. */
function folderEntries(transfer: DataTransfer | null | undefined): FileSystemEntry[] {
  const items = Array.from(transfer?.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => !!entry);
  return entries.some((entry) => entry.isDirectory) ? entries : [];
}

/** Most files read from dropped folders, so a huge folder cannot freeze the page. */
const MAX_FOLDER_FILES = 500;

/** Reads every file in the dropped entries, going into subfolders. */
async function readEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];
  const queue = [...entries];
  while (queue.length && files.length < MAX_FOLDER_FILES) {
    const entry = queue.shift()!;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => (entry as FileSystemFileEntry).file(resolve, () => resolve(null)));
      if (file) files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns the folder in pieces; keep reading until it returns nothing.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (!batch.length) break;
        queue.push(...batch);
      }
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
