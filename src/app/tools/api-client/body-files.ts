import { BodyFile, newId } from './model';

/**
 * Files chosen for request bodies, kept in memory only. Saved requests store just the
 * name and size, since a page cannot keep a file between visits without uploading it.
 */
const files = new Map<string, File>();

export function keepFile(file: File): BodyFile {
  const id = newId();
  files.set(id, file);
  return { id, name: file.name, size: file.size, type: file.type };
}

/** The chosen file, or undefined when it has to be chosen again (for example after a reload). */
export function fileFor(meta: BodyFile | null | undefined): File | undefined {
  return meta ? files.get(meta.id) : undefined;
}
