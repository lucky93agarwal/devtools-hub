/**
 * Puts a tool's input into the part of the address after #, which browsers never send to a server.
 * Used by Share link buttons and by Smart Paste to open a tool with data already filled in.
 */
import { DestroyRef, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export type SharedData = Record<string, string>;

const KEY = 'share';
/** Longer links are cut off by some chats, browsers and servers. */
export const MAX_LINK_LENGTH = 8000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeShared(data: SharedData): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(data)), { level: 9 }));
}

export function decodeShared(text: string): SharedData | null {
  try {
    const value = JSON.parse(strFromU8(inflateSync(fromBase64Url(text))));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as SharedData;
  } catch {
    return null;
  }
}

/** The address of a tool page with the data in its fragment. */
export function shareUrl(origin: string, path: string, data: SharedData): string {
  return `${origin}/${path.replace(/^\//, '')}#${KEY}=${encodeShared(data)}`;
}

/** Reads shared data from a fragment such as "#share=…". */
export function readFragment(hash: string): SharedData | null {
  const match = new RegExp(`^#?${KEY}=([\\w-]+)$`).exec(hash);
  return match ? decodeShared(match[1]) : null;
}

/** The open tool's handler, so History can put an older input back without reloading the page. */
const appliers = new Set<(data: SharedData) => void>();

/** Gives `data` to the tool on the page now, as if it had been opened with it. Returns false when none listens. */
export function restoreShared(data: SharedData): boolean {
  appliers.forEach((apply) => apply(data));
  return appliers.size > 0;
}

/** Data handed to the next tool page opened inside the app, such as by Smart Paste. */
let pending: { path: string; data: SharedData } | null = null;

/** Opens with this data the next time the tool at `path` starts (call it just before navigating there). */
export function prefill(path: string, data: SharedData): void {
  pending = { path: path.replace(/^\//, ''), data };
}

/**
 * Calls `apply` once in the browser when the page was opened with data: from Smart Paste, or from a share link,
 * which is then removed from the address bar so later edits are not confused with the shared version.
 * Call it from a component constructor.
 */
export function onSharedInput(apply: (data: SharedData) => void): void {
  // During an in-app navigation the address bar may change only after this page renders, so ask the router.
  const router = inject(Router);
  const navigation = router.currentNavigation();
  const target = (navigation?.finalUrl ? router.serializeUrl(navigation.finalUrl) : router.url).split(/[?#]/)[0].replace(/^\//, '');
  appliers.add(apply);
  inject(DestroyRef).onDestroy(() => appliers.delete(apply));
  afterNextRender(() => {
    if (pending && pending.path === target) {
      const { data } = pending;
      pending = null;
      apply(data);
      return;
    }
    const data = readFragment(location.hash);
    if (!data) return;
    history.replaceState(history.state, '', location.pathname + location.search);
    apply(data);
  });
}

/** Files handed to the next tool page, such as a file dropped anywhere on the site. */
let pendingFiles: { path: string; files: File[] } | null = null;

export function prefillFiles(path: string, files: File[]): void {
  pendingFiles = { path: path.replace(/^\//, ''), files };
}

/** Like onSharedInput, for tools that take files: calls `apply` once with files dropped elsewhere on the site. */
export function onSharedFiles(apply: (files: File[]) => void): void {
  const router = inject(Router);
  const navigation = router.currentNavigation();
  const target = (navigation?.finalUrl ? router.serializeUrl(navigation.finalUrl) : router.url).split(/[?#]/)[0].replace(/^\//, '');
  afterNextRender(() => {
    if (pendingFiles && pendingFiles.path === target) {
      const { files } = pendingFiles;
      pendingFiles = null;
      apply(files);
    }
  });
}
