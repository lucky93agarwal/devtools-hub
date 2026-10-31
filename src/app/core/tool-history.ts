import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SharedData } from './shared-input';

/** One remembered input of a tool. */
export interface HistoryEntry {
  data: SharedData;
  at: number;
  /** First line of the main input, for the list. */
  preview: string;
}

/** An input the visitor saved by name, to open again later. */
export interface SavedItem extends HistoryEntry {
  id: string;
  path: string;
  name: string;
}

const HISTORY_KEY = 'dth-history';
const SAVED_KEY = 'dth-saved';
export const HISTORY_SIZE = 10;
/** Inputs larger than this are not remembered, so storage does not fill up. */
const MAX_ENTRY_CHARS = 100_000;

export function previewOf(data: SharedData): string {
  const main = Object.values(data).find((v) => v.trim()) ?? '';
  const line = main.trim().split('\n')[0];
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

const size = (data: SharedData) => Object.values(data).reduce((n, v) => n + v.length, 0);
const same = (a: SharedData, b: SharedData) => JSON.stringify(a) === JSON.stringify(b);

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the lists still work until the tab closes.
  }
}

/**
 * The last inputs of each tool and the inputs saved by name, kept only in this browser's storage.
 * Only tools that offer a Share link take part, so tokens and secrets (JWT, cURL, .env) are never kept.
 */
@Injectable({ providedIn: 'root' })
export class ToolHistory {
  readonly history = signal<Record<string, HistoryEntry[]>>({});
  readonly saved = signal<SavedItem[]>([]);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    if (!this.browser) return;
    this.history.set(read(HISTORY_KEY, {}));
    this.saved.set(read(SAVED_KEY, []));
  }

  remember(path: string, data: SharedData): void {
    if (!this.browser || !previewOf(data) || size(data) > MAX_ENTRY_CHARS) return;
    const list = this.history()[path] ?? [];
    if (list[0] && same(list[0].data, data)) return;
    // A newer version of the same text replaces the older one rather than filling the list with every keystroke.
    const rest = list.filter((e) => !same(e.data, data) && !(Object.values(data)[0] ?? '').startsWith(Object.values(e.data)[0] ?? '\u0000'));
    const next = { ...this.history(), [path]: [{ data, at: Date.now(), preview: previewOf(data) }, ...rest].slice(0, HISTORY_SIZE) };
    this.history.set(next);
    write(HISTORY_KEY, next);
  }

  entries(path: string): HistoryEntry[] {
    return this.history()[path] ?? [];
  }

  clear(path: string): void {
    const next = { ...this.history() };
    delete next[path];
    this.history.set(next);
    write(HISTORY_KEY, next);
  }

  save(path: string, name: string, data: SharedData): SavedItem {
    const item: SavedItem = { id: crypto.randomUUID(), path, name: name.trim() || previewOf(data) || 'Untitled', data, at: Date.now(), preview: previewOf(data) };
    const next = [item, ...this.saved()];
    this.saved.set(next);
    write(SAVED_KEY, next);
    return item;
  }

  remove(id: string): void {
    const next = this.saved().filter((s) => s.id !== id);
    this.saved.set(next);
    write(SAVED_KEY, next);
  }

  savedFor(path: string): SavedItem[] {
    return this.saved().filter((s) => s.path === path);
  }
}
