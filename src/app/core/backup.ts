/** Everything the site keeps in this browser, as one file to move to another browser or device. */

/** Keys the site writes: the theme and everything starting with "dth-". Ad settings are left out. */
export const isSiteKey = (key: string) => key === 'theme' || (key.startsWith('dth-') && key !== 'dth-new-version-reload');

export interface Backup {
  app: 'devtools24';
  version: 1;
  createdAt: string;
  items: Record<string, string>;
}

export function makeBackup(storage: Storage, now = new Date()): Backup {
  const items: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)!;
    if (isSiteKey(key)) items[key] = storage.getItem(key) ?? '';
  }
  return { app: 'devtools24', version: 1, createdAt: now.toISOString(), items };
}

export type RestoreResult = { ok: true; count: number } | { ok: false; error: string };

/** Writes a backup back. Existing data under the same keys is replaced; other keys are left alone. */
export function restoreBackup(storage: Storage, text: string): RestoreResult {
  let backup: Backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a DevTools24 backup (it is not JSON).' };
  }
  if (backup?.app !== 'devtools24' || backup.version !== 1 || typeof backup.items !== 'object') {
    return { ok: false, error: 'This file is not a DevTools24 backup.' };
  }
  const entries = Object.entries(backup.items).filter(([key, value]) => isSiteKey(key) && typeof value === 'string');
  try {
    for (const [key, value] of entries) storage.setItem(key, value);
  } catch {
    return { ok: false, error: 'The browser refused to store the data. It may be full or blocked.' };
  }
  return { ok: true, count: entries.length };
}

export function clearSiteData(storage: Storage): number {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!).filter(isSiteKey);
  keys.forEach((k) => storage.removeItem(k));
  return keys.length;
}
