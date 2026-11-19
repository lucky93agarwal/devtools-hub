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
  /** Small pictures through a video, for the timeline (made after import). */
  thumbs?: { t: number; url: string }[];
  /** Loudness per 1/20 s, for the timeline waveform (made after import). */
  peaks?: number[];
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
  /** Size, place, rotation and crop of the picture. */
  transform?: Transform;
  /** Values that change over the clip's time, overriding the transform and opacity. */
  keyframes?: Keyframes;
  /** Playback speed: 0.25 to 4. */
  speed?: number;
  /** Plays the source backwards. */
  reverse?: boolean;
  /** Only the sound is used (made by "Separate audio"). */
  audioOnly?: boolean;
  /** The sound is not used (its audio was separated). */
  muted?: boolean;
  /** Echo, tone and clean-up for the clip's sound. */
  audio?: AudioFx;
}

export interface Transform {
  /** Centre of the picture, 0..1 across and down the frame. */
  x: number;
  y: number;
  /** 1 fits the frame. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** Share of the source cut off each side, 0..0.45. */
  cropLeft: number;
  cropRight: number;
  cropTop: number;
  cropBottom: number;
}

export const NO_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };

export type KeyProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export interface Keyframe {
  /** Seconds from the start of the clip on the timeline. */
  t: number;
  v: number;
}
export type Keyframes = Partial<Record<KeyProp, Keyframe[]>>;

export interface AudioFx {
  /** 0..1 amount of echo. */
  echo: number;
  /** Decibels, -12..12. */
  bass: number;
  treble: number;
  /** Cuts rumble and hiss to make speech clearer. */
  clean: boolean;
}

export const NO_AUDIO_FX: AudioFx = { echo: 0, bass: 0, treble: 0, clean: false };

export interface Track {
  id: number;
  name: string;
  muted: boolean;
  hidden: boolean;
  /** Locked tracks cannot be edited. */
  locked?: boolean;
}

export interface Project {
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  /** Times (seconds) marked on the timeline. */
  markers?: number[];
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

/** Length of the clip on the timeline (a faster clip is shorter). */
export const clipLength = (clip: Clip) => (clip.out - clip.in) / (clip.speed ?? 1);
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

/** The source time a clip shows at timeline `time`, taking speed and reverse into account. */
export function sourceTime(clip: Clip, time: number): number {
  const into = (time - clip.start) * (clip.speed ?? 1);
  return clip.reverse ? clip.out - into : clip.in + into;
}

/** Cuts a clip in two at a timeline time. Returns the project unchanged when the time is not inside the clip. */
export function splitClip(project: Project, id: string, time: number): Project {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || time <= clip.start + MIN_CLIP || time >= clipEnd(clip) - MIN_CLIP) return project;
  const cut = sourceTime(clip, time);
  // The opening transition stays on the first part and the closing one on the second.
  // Keyframes are kept on the part they fall in, shifted to its own start.
  const local = time - clip.start;
  const keys = (from: number, to: number, shift: number): Keyframes | undefined =>
    clip.keyframes
      ? Object.fromEntries(
          Object.entries(clip.keyframes).map(([k, list]) => [k, (list ?? []).filter((f) => f.t >= from && f.t <= to).map((f) => ({ t: f.t - shift, v: f.v }))]),
        )
      : undefined;
  const leftSource = clip.reverse ? { in: cut, out: clip.out } : { in: clip.in, out: cut };
  const rightSource = clip.reverse ? { in: clip.in, out: cut } : { in: cut, out: clip.out };
  const left: Clip = { ...clip, ...leftSource, transitionOut: undefined, keyframes: keys(0, local, 0) };
  const right: Clip = { ...clip, ...rightSource, id: makeId('clip'), start: time, transitionIn: undefined, keyframes: keys(local, Infinity, local) };
  return { ...project, clips: project.clips.flatMap((c) => (c.id === id ? [left, right] : [c])) };
}

/** Splits every clip under the playhead (like a razor across all tracks). */
export function splitAll(project: Project, time: number): Project {
  return project.clips.filter((c) => time > c.start && time < clipEnd(c)).reduce((p, c) => splitClip(p, c.id, time), project);
}

/**
 * Moves the left or right edge of a clip. Videos and sounds cannot be stretched past
 * their source; images and titles can be any length. Speed and reverse are honoured.
 */
export function trimClip(project: Project, id: string, edge: 'start' | 'end', time: number, sourceLength: number | null): Project {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) return project;
  const speed = clip.speed ?? 1;
  const end = clipEnd(clip);
  if (sourceLength === null) {
    // Stills and titles: just change the length.
    if (edge === 'end') return updateClip(project, id, { in: 0, out: Math.max(MIN_CLIP, time - clip.start) * speed });
    const start = Math.max(0, Math.min(time, end - MIN_CLIP));
    return updateClip(project, id, { start, in: 0, out: (end - start) * speed });
  }
  if (edge === 'end') {
    const span = Math.max(MIN_CLIP, time - clip.start) * speed;
    return clip.reverse
      ? updateClip(project, id, { in: Math.max(0, clip.out - span) })
      : updateClip(project, id, { out: Math.min(sourceLength, clip.in + span) });
  }
  // Moving the start edge keeps the end where it is.
  let start = Math.max(0, Math.min(time, end - MIN_CLIP));
  let span = (end - start) * speed;
  if (clip.reverse) {
    const out = Math.min(sourceLength, clip.in + span);
    span = out - clip.in;
    start = end - span / speed;
    return updateClip(project, id, { start, out });
  }
  const inPoint = Math.max(0, clip.out - span);
  start = end - (clip.out - inPoint) / speed;
  return updateClip(project, id, { start, in: inPoint });
}

/** Snaps `time` to the nearest clip edge or the playhead when it is within `tolerance` seconds. */
export function snap(project: Project, time: number, tolerance: number, ignore: string, extra: number[] = []): number {
  let best = time;
  let bestDistance = tolerance;
  const points = [0, ...extra, ...(project.markers ?? [])];
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
  /** Pixel block size at 720p; 0 is off. */
  pixelate?: number;
  /** 0..100. */
  sharpen?: number;
  /** Green screen: how close to `chromaColour` a pixel must be to become see-through, 0 (off)..100. */
  chroma?: number;
  chromaColour?: string;
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
  { name: 'Green screen', icon: '🟩', effects: { chroma: 40, chromaColour: '#00ff00' } },
  { name: 'Pixelate', icon: '🔲', effects: { pixelate: 12 } },
  { name: 'Sharpen', icon: '🔪', effects: { sharpen: 60 } },
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


// ---------- keyframes, transform ----------

/** A keyframed value at clip-local time `t`, straight lines between keyframes; `base` when there are none. */
export function valueAt(list: readonly Keyframe[] | undefined, t: number, base: number): number {
  if (!list?.length) return base;
  const sorted = [...list].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].v;
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    if (t <= b.t) {
      const a = sorted[i - 1];
      return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t || 1);
    }
  }
  return last.v;
}

/** The clip's transform and opacity at timeline `time`, with keyframes applied. */
export function transformAt(clip: Clip, time: number): Transform & { opacity: number } {
  const base = clip.transform ?? NO_TRANSFORM;
  const t = time - clip.start;
  const k = clip.keyframes ?? {};
  return {
    ...base,
    x: valueAt(k.x, t, base.x),
    y: valueAt(k.y, t, base.y),
    scale: valueAt(k.scale, t, base.scale),
    rotation: valueAt(k.rotation, t, base.rotation),
    opacity: valueAt(k.opacity, t, (clip.effects?.opacity ?? 100) / 100),
  };
}

/** Adds or replaces a keyframe at clip-local time `t` (frames closer than 1/60 s are the same keyframe). */
export function setKeyframe(clip: Clip, prop: KeyProp, t: number, v: number): Keyframes {
  const list = (clip.keyframes?.[prop] ?? []).filter((f) => Math.abs(f.t - t) > 1 / 60);
  return { ...clip.keyframes, [prop]: [...list, { t, v }].sort((a, b) => a.t - b.t) };
}

export function removeKeyframe(clip: Clip, prop: KeyProp, t: number): Keyframes {
  return { ...clip.keyframes, [prop]: (clip.keyframes?.[prop] ?? []).filter((f) => Math.abs(f.t - t) > 1 / 60) };
}

// ---------- audio, markers, copy and paste ----------

/** Puts a video clip's sound on its own clip on another track and mutes the original. */
export function separateAudio(project: Project, id: string, track: number): Project {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || clip.audioOnly || clip.muted) return project;
  const audio: Clip = {
    ...clip,
    id: makeId('clip'),
    track,
    audioOnly: true,
    muted: false,
    transform: undefined,
    keyframes: undefined,
    effects: undefined,
  };
  return { ...project, clips: [...project.clips.map((c) => (c.id === id ? { ...c, muted: true } : c)), audio] };
}

export function addMarker(project: Project, time: number): Project {
  const markers = (project.markers ?? []).filter((m) => Math.abs(m - time) > 0.05);
  return { ...project, markers: [...markers, time].sort((a, b) => a - b) };
}

export function removeMarker(project: Project, time: number): Project {
  return { ...project, markers: (project.markers ?? []).filter((m) => Math.abs(m - time) > 0.05) };
}

/** Pastes copies of clips at `time`, keeping their spacing and tracks, never covering other clips. */
export function pasteClips(project: Project, clips: readonly Clip[], time: number): { project: Project; ids: string[] } {
  if (!clips.length) return { project, ids: [] };
  const first = Math.min(...clips.map((c) => c.start));
  let next = project;
  const ids: string[] = [];
  for (const clip of clips) {
    const start = freeStart(next, clip.track, time + (clip.start - first), clipLength(clip));
    const copy: Clip = { ...structuredClone(clip), id: makeId('clip'), start };
    next = { ...next, clips: [...next.clips, copy] };
    ids.push(copy.id);
  }
  return { project: next, ids };
}

/** Moves several clips by the same amount, keeping them at or after 0. */
export function moveClips(project: Project, ids: readonly string[], by: number): Project {
  const chosen = project.clips.filter((c) => ids.includes(c.id));
  const shift = Math.max(by, -Math.min(...chosen.map((c) => c.start)));
  return { ...project, clips: project.clips.map((c) => (ids.includes(c.id) ? { ...c, start: c.start + shift } : c)) };
}
