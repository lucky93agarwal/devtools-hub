/** Subtitles: reading and writing .srt files, and turning their lines into caption clips. */
import { Clip, Project, TitleStyle, clipEnd, makeId } from './project';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** The look of a new caption: white text in a dark box near the bottom. */
export const CAPTION_STYLE: Omit<TitleStyle, 'text'> = { size: 6, colour: '#ffffff', x: 0.5, y: 0.86, background: true, font: 'sans' };

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function parseTime(text: string): number | null {
  const m = /(\d+):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? '0').padEnd(3, '0')) / 1000;
}

/** Reads the lines of an .srt (or simple .vtt) file. Bad blocks are skipped. */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split('-->');
    const start = parseTime(a);
    const end = parseTime(b ?? '');
    const words = lines
      .slice(timing + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (start === null || end === null || end <= start || !words) continue;
    cues.push({ start, end, text: words });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Writes lines as an .srt file. */
export function toSrt(cues: readonly Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

/** The caption clips of a project as lines, in time order. */
export function projectCues(project: Project): Cue[] {
  return project.clips
    .filter((c) => c.caption && c.title)
    .map((c) => ({ start: c.start, end: clipEnd(c), text: c.title!.text }))
    .sort((a, b) => a.start - b.start);
}

/** The track captions go on: one named "Captions", made on top when there is none. */
export function captionTrack(project: Project): { project: Project; track: number } {
  const existing = project.tracks.find((t) => t.name === 'Captions');
  if (existing) return { project, track: existing.id };
  const id = Math.max(0, ...project.tracks.map((t) => t.id)) + 1;
  return { project: { ...project, tracks: [...project.tracks, { id, name: 'Captions', muted: false, hidden: false }] }, track: id };
}

/** Adds lines as caption clips on the Captions track (shifted by `offset` seconds). */
export function addCues(project: Project, cues: readonly Cue[], offset = 0): { project: Project; ids: string[] } {
  const made = captionTrack(project);
  const clips: Clip[] = cues.map((cue) => ({
    id: makeId('caption'),
    track: made.track,
    start: cue.start + offset,
    in: 0,
    out: cue.end - cue.start,
    title: { ...CAPTION_STYLE, text: cue.text },
    caption: true,
    volume: 1,
  }));
  return { project: { ...made.project, clips: [...made.project.clips, ...clips] }, ids: clips.map((c) => c.id) };
}
