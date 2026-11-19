/**
 * The video editor's project: media files, tracks and the clips placed on them.
 * Everything here is plain data and pure functions, so it is easy to test and
 * to keep an undo history of.
 */

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  /** Seconds; images get a default length when placed. */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  url: string;
  file: File;
  thumb?: string;
}

export interface TitleStyle {
  text: string;
  size: number;
  colour: string;
  /** Position of the text centre, 0..1 across and down the frame. */
  x: number;
  y: number;
  background: boolean;
}

export interface Clip {
  id: string;
  track: number;
  /** Where the clip starts on the timeline, in seconds. */
  start: number;
  /** Seconds into the source where the clip begins and ends (for titles and images, 0..length). */
  in: number;
  out: number;
  /** A media file, or none for a title. */
  mediaId?: string;
  title?: TitleStyle;
  /** 0..2 for clips with sound. */
  volume: number;
  transitionIn?: Transition;
  transitionOut?: Transition;
  effects?: Effects;
}

export interface Track {
  id: number;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export interface Project {
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
}

export const DEFAULT_STILL = 5;
export const MIN_CLIP = 0.1;

export function newProject(): Project {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [1, 2, 3, 4, 5].map((n) => ({ id: n, name: `Track ${n}`, muted: false, hidden: false })),
    clips: [],
  };
}

export const clipLength = (clip: Clip) => clip.out - clip.in;
export const clipEnd = (clip: Clip) => clip.start + clipLength(clip);

export function projectDuration(project: Project): number {
  return project.clips.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0);
}

/** Clips showing at `time`, from the bottom track to the top track (drawing order). */
export function clipsAt(project: Project, time: number): Clip[] {
  return project.clips
    .filter((clip) => time >= clip.start && time < clipEnd(clip))
    .sort((a, b) => a.track - b.track || a.start - b.start);
}

let counter = 0;
export function makeId(prefix: string): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** The first free time on a track at or after `from`, so a new clip does not cover another. */
export function freeStart(project: Project, track: number, from: number, length: number): number {
  let start = from;
  const others = project.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start);
  for (const other of others) {
    if (start + length <= other.start || start >= clipEnd(other)) continue;
    start = clipEnd(other);
  }
  return start;
}

export function addMediaClip(project: Project, media: MediaItem, track: number, start: number): { project: Project; clip: Clip } {
  const length = media.kind === 'image' ? DEFAULT_STILL : media.duration;
  const clip: Clip = { id: makeId('clip'), track, start: freeStart(project, track, start, length), in: 0, out: length, mediaId: media.id, volume: 1 };
  return { project: { ...project, clips: [...project.clips, clip] }, clip };
}

export function addTitleClip(project: Project, title: TitleStyle, track: number, start: number, length = DEFAULT_STILL): { project: Project; clip: Clip } {
  const clip: Clip = { id: makeId('title'), track, start: freeStart(project, track, start, length), in: 0, out: length, title, volume: 1 };
  return { project: { ...project, clips: [...project.clips, clip] }, clip };
}

export function updateClip(project: Project, id: string, change: Partial<Clip>): Project {
  return { ...project, clips: project.clips.map((c) => (c.id === id ? { ...c, ...change } : c)) };
}

export function removeClip(project: Project, id: string): Project {
  return { ...project, clips: project.clips.filter((c) => c.id !== id) };
}

/** Cuts a clip in two at a timeline time. Returns the project unchanged when the time is not inside the clip. */
export function splitClip(project: Project, id: string, time: number): Project {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || time <= clip.start + MIN_CLIP || time >= clipEnd(clip) - MIN_CLIP) return project;
  const cut = clip.in + (time - clip.start);
  // The opening transition stays on the first part and the closing one on the second.
  const left: Clip = { ...clip, out: cut, transitionOut: undefined };
  const right: Clip = { ...clip, id: makeId('clip'), start: time, in: cut, transitionIn: undefined };
  return { ...project, clips: project.clips.flatMap((c) => (c.id === id ? [left, right] : [c])) };
}

/** Splits every clip under the playhead (like a razor across all tracks). */
export function splitAll(project: Project, time: number): Project {
  return project.clips.filter((c) => time > c.start && time < clipEnd(c)).reduce((p, c) => splitClip(p, c.id, time), project);
}

/**
 * Moves the left or right edge of a clip. Videos and sounds cannot be stretched past
 * their source; images and titles can be any length.
 */
export function trimClip(project: Project, id: string, edge: 'start' | 'end', time: number, sourceLength: number | null): Project {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) return project;
  if (edge === 'end') {
    const max = sourceLength === null ? Infinity : sourceLength;
    const out = Math.min(max, Math.max(clip.in + MIN_CLIP, clip.in + (time - clip.start)));
    return updateClip(project, id, { out });
  }
  // Moving the start edge keeps the end where it is.
  const end = clipEnd(clip);
  const minIn = sourceLength === null ? -Infinity : 0;
  let start = Math.min(time, end - MIN_CLIP);
  let inPoint = clip.in + (start - clip.start);
  if (inPoint < minIn) {
    inPoint = minIn;
    start = clip.start + (minIn - clip.in);
  }
  start = Math.max(0, start);
  if (sourceLength === null) return updateClip(project, id, { start, in: 0, out: end - start });
  return updateClip(project, id, { start, in: inPoint });
}

/** Snaps `time` to the nearest clip edge or the playhead when it is within `tolerance` seconds. */
export function snap(project: Project, time: number, tolerance: number, ignore: string, extra: number[] = []): number {
  let best = time;
  let bestDistance = tolerance;
  const points = [0, ...extra];
  for (const clip of project.clips) if (clip.id !== ignore) points.push(clip.start, clipEnd(clip));
  for (const point of points) {
    const distance = Math.abs(point - time);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/** "00:01:05:12" style timecode with frames, as editors show it. */
export function timecode(seconds: number, fps: number): string {
  const total = Math.max(0, Math.floor(seconds * fps + 1e-6));
  const frames = total % fps;
  const s = Math.floor(total / fps);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}:${pad(frames)}`;
}

/** Ruler labels: a tick every `step` seconds, chosen so labels are at least ~80 px apart. */
export function rulerStep(pixelsPerSecond: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (step * pixelsPerSecond >= 80) return step;
  return 600;
}

/** Where a clip sits inside the frame: the source scaled to fit (letterboxed), centred. */
export function fitRect(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number) {
  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
}

// ---------- transitions ----------

export type TransitionType = 'fade' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'slide-left' | 'slide-right' | 'circle' | 'zoom';

export interface Transition {
  type: TransitionType;
  /** Seconds. */
  duration: number;
}

export const TRANSITIONS: readonly { type: TransitionType; label: string; icon: string }[] = [
  { type: 'fade', label: 'Fade', icon: '◐' },
  { type: 'wipe-left', label: 'Wipe right', icon: '▶' },
  { type: 'wipe-right', label: 'Wipe left', icon: '◀' },
  { type: 'wipe-up', label: 'Wipe up', icon: '▲' },
  { type: 'slide-left', label: 'Slide in', icon: '⇠' },
  { type: 'slide-right', label: 'Slide right', icon: '⇢' },
  { type: 'circle', label: 'Circle', icon: '◯' },
  { type: 'zoom', label: 'Zoom', icon: '⤢' },
];

/**
 * How far into its opening and closing transitions a clip is at `time`: 1 means the
 * transition is over (fully shown), 0 means it has just begun. Null when there is none.
 */
export function transitionProgress(clip: Clip, time: number): { in: number | null; out: number | null } {
  const local = time - clip.start;
  const length = clipLength(clip);
  const inDuration = clip.transitionIn ? Math.min(clip.transitionIn.duration, length) : 0;
  const outDuration = clip.transitionOut ? Math.min(clip.transitionOut.duration, length) : 0;
  return {
    in: inDuration > 0 && local < inDuration ? Math.max(0, local / inDuration) : null,
    out: outDuration > 0 && length - local < outDuration ? Math.max(0, (length - local) / outDuration) : null,
  };
}

/** Sound level (0..1) at `time` from the clip's transitions, so sound fades with the picture. */
export function transitionGain(clip: Clip, time: number): number {
  const { in: start, out: end } = transitionProgress(clip, time);
  return Math.min(start ?? 1, end ?? 1);
}

// ---------- effects ----------

export interface Effects {
  /** Percent, 100 is unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0..100 percent of the effect. */
  grayscale: number;
  sepia: number;
  invert: number;
  /** Degrees. */
  hue: number;
  /** Blur in pixels at 720p, scaled with the frame. */
  blur: number;
  opacity: number;
}

export const NO_EFFECTS: Effects = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, invert: 0, hue: 0, blur: 0, opacity: 100 };

export const EFFECT_PRESETS: readonly { name: string; icon: string; effects: Partial<Effects> }[] = [
  { name: 'Black & white', icon: '⬛', effects: { grayscale: 100 } },
  { name: 'Sepia', icon: '🟫', effects: { sepia: 85 } },
  { name: 'Vintage', icon: '📼', effects: { sepia: 40, contrast: 110, saturation: 80, brightness: 95 } },
  { name: 'Vivid', icon: '🌈', effects: { saturation: 160, contrast: 115 } },
  { name: 'Brighten', icon: '☀', effects: { brightness: 130 } },
  { name: 'Darken', icon: '🌙', effects: { brightness: 70 } },
  { name: 'Blur', icon: '💧', effects: { blur: 6 } },
  { name: 'Invert', icon: '🔄', effects: { invert: 100 } },
  { name: 'Cool', icon: '❄', effects: { hue: 200, saturation: 90 } },
  { name: 'Warm', icon: '🔥', effects: { sepia: 25, saturation: 120 } },
];

/** CSS / canvas filter string for the effects; '' when nothing changes. */
export function effectsFilter(effects: Effects | undefined, frameHeight: number): string {
  if (!effects) return '';
  const parts: string[] = [];
  if (effects.brightness !== 100) parts.push(`brightness(${effects.brightness}%)`);
  if (effects.contrast !== 100) parts.push(`contrast(${effects.contrast}%)`);
  if (effects.saturation !== 100) parts.push(`saturate(${effects.saturation}%)`);
  if (effects.grayscale) parts.push(`grayscale(${effects.grayscale}%)`);
  if (effects.sepia) parts.push(`sepia(${effects.sepia}%)`);
  if (effects.invert) parts.push(`invert(${effects.invert}%)`);
  if (effects.hue) parts.push(`hue-rotate(${effects.hue}deg)`);
  if (effects.blur) parts.push(`blur(${Math.round(((effects.blur * frameHeight) / 720) * 10) / 10}px)`);
  return parts.join(' ');
}
