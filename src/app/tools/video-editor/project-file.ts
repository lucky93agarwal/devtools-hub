/**
 * Saving the whole project, with its files, as one .zip that can be opened later
 * or on another computer.
 */
import { MediaItem, Project } from './project';

export const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  app: 'DevTools24 Video Editor';
  version: number;
  project: Project;
  media: { id: string; name: string; kind: MediaItem['kind']; duration: number; width: number; height: number; hasAudio: boolean; type: string; path: string }[];
}

/** A safe file name for a path inside the zip. */
export function zipPath(id: string, name: string): string {
  return `media/${id}-${name.replace(/[^\w.-]+/g, '_')}`;
}

export async function saveProjectFile(project: Project, media: readonly MediaItem[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const file: ProjectFile = {
    app: 'DevTools24 Video Editor',
    version: PROJECT_FILE_VERSION,
    project,
    media: media.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      duration: m.duration,
      width: m.width,
      height: m.height,
      hasAudio: m.hasAudio,
      type: m.file.type,
      path: zipPath(m.id, m.name),
    })),
  };
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    'project.json': [new TextEncoder().encode(JSON.stringify(file, null, 2)), { level: 6 }],
  };
  // Media files are already compressed, so they are stored as they are.
  for (const m of media) entries[zipPath(m.id, m.name)] = [new Uint8Array(await m.file.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export async function openProjectFile(blob: Blob): Promise<{ project: Project; media: MediaItem[] }> {
  const { unzipSync } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error('This is not a project file. Choose a .zip saved with Save project.');
  }
  const json = files['project.json'];
  if (!json) throw new Error('This zip has no project.json. Choose a file saved with Save project.');
  const data = JSON.parse(new TextDecoder().decode(json)) as ProjectFile;
  if (data.app !== 'DevTools24 Video Editor' || !data.project?.clips) throw new Error('This project file could not be read.');
  const media: MediaItem[] = [];
  for (const m of data.media) {
    const bytes = files[m.path];
    if (!bytes) continue;
    const file = new File([bytes as Uint8Array<ArrayBuffer>], m.name, { type: m.type });
    media.push({ id: m.id, name: m.name, kind: m.kind, duration: m.duration, width: m.width, height: m.height, hasAudio: m.hasAudio, file, url: URL.createObjectURL(file) });
  }
  return { project: data.project, media };
}
