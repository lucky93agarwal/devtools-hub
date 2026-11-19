/**
 * Keeps the video editor's project in the browser (IndexedDB), with copies of the
 * imported files, so closing the tab or reloading does not lose the work. Nothing
 * leaves the device.
 */
import { MediaItem, Project } from './project';

const DB = 'devtools24-video-editor';
const VERSION = 1;

/** What is stored for one imported file: everything but the object URL, which is made again on restore. */
export type StoredMedia = Omit<MediaItem, 'url' | 'thumb'>;

export interface SavedProject {
  project: Project;
  mediaIds: string[];
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving was stopped.'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Files to keep: everything in Project Files (clips can only use those). */
export function mediaToKeep(media: readonly MediaItem[]): string[] {
  return media.map((m) => m.id);
}

/**
 * Saves the project and any files not saved yet. `known` holds ids already stored,
 * so big videos are written once, not on every edit.
 */
export async function saveProject(project: Project, media: readonly MediaItem[], known: Set<string>): Promise<void> {
  const db = await open();
  try {
    const keep = new Set(mediaToKeep(media));
    const transaction = db.transaction(['media', 'state'], 'readwrite');
    const store = transaction.objectStore('media');
    for (const item of media) {
      if (!keep.has(item.id) || known.has(item.id)) continue;
      const stored: StoredMedia = {
        id: item.id,
        name: item.name,
        kind: item.kind,
        duration: item.duration,
        width: item.width,
        height: item.height,
        hasAudio: item.hasAudio,
        file: item.file,
      };
      store.put(stored);
    }
    for (const id of known) if (!keep.has(id)) store.delete(id);
    const saved: SavedProject = { project, mediaIds: [...keep], savedAt: Date.now() };
    transaction.objectStore('state').put(saved, 'project');
    await done(transaction);
    known.clear();
    for (const id of keep) known.add(id);
  } finally {
    db.close();
  }
}

/** The saved project and its files, or null when there is none. */
export async function loadProject(): Promise<{ saved: SavedProject; media: MediaItem[] } | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await open();
  try {
    const transaction = db.transaction(['media', 'state'], 'readonly');
    const saved = (await request(transaction.objectStore('state').get('project'))) as SavedProject | undefined;
    if (!saved || (!saved.project.clips.length && !saved.mediaIds.length)) return null;
    const media: MediaItem[] = [];
    for (const id of saved.mediaIds) {
      const stored = (await request(transaction.objectStore('media').get(id))) as StoredMedia | undefined;
      if (stored) media.push({ ...stored, url: URL.createObjectURL(stored.file) });
    }
    return { saved, media };
  } finally {
    db.close();
  }
}

export async function clearProject(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await open();
  try {
    const transaction = db.transaction(['media', 'state'], 'readwrite');
    transaction.objectStore('media').clear();
    transaction.objectStore('state').clear();
    await done(transaction);
  } finally {
    db.close();
  }
}

/** "2 minutes ago" style text for the restore message. */
export function ago(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
