import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TOOLS, ToolInfo } from './tools';

const FAVOURITES_KEY = 'dth-favourite-tools';
const RECENT_KEY = 'dth-recent-tools';
const MAX_RECENT = 6;

function load(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((p) => typeof p === 'string' && TOOLS.some((t) => t.path === p)) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows may refuse storage; the lists then last until the tab closes.
  }
}

/**
 * The visitor's starred tools and the tools they opened last, kept in this browser only.
 * Empty on the server, so prerendered pages are the same for everyone.
 */
@Injectable({ providedIn: 'root' })
export class UserTools {
  readonly favourites = signal<string[]>([]);
  readonly recent = signal<string[]>([]);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.favourites.set(load(FAVOURITES_KEY));
    this.recent.set(load(RECENT_KEY));
    inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0].replace(/^\//, '');
        if (TOOLS.some((t) => t.path === path)) this.visit(path);
      });
  }

  isFavourite(path: string): boolean {
    return this.favourites().includes(path);
  }

  toggleFavourite(path: string): void {
    const next = this.isFavourite(path) ? this.favourites().filter((p) => p !== path) : [...this.favourites(), path];
    this.favourites.set(next);
    save(FAVOURITES_KEY, next);
  }

  private visit(path: string): void {
    const next = [path, ...this.recent().filter((p) => p !== path)].slice(0, MAX_RECENT);
    this.recent.set(next);
    save(RECENT_KEY, next);
  }

  static tools(paths: string[]): ToolInfo[] {
    return paths.map((p) => TOOLS.find((t) => t.path === p)!).filter(Boolean);
  }
}
