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
  /** How the title comes in (and, for some, keeps moving). */
  animation?: TitleAnimation;
  font?: TitleFont;
  /** A dark outline around the letters. */
  outline?: boolean;
}

export type TitleAnimation = 'none' | 'fade-up' | 'typewriter' | 'pop' | 'slide' | 'zoom' | 'wave' | 'flip-3d' | 'extrude-3d';
export type TitleFont = 'sans' | 'serif' | 'mono' | 'impact' | 'hand';

export const TITLE_ANIMATIONS: readonly { id: TitleAnimation; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade-up', label: 'Fade up' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'pop', label: 'Pop' },
  { id: 'slide', label: 'Slide in' },
  { id: 'zoom', label: 'Zoom out' },
  { id: 'wave', label: 'Wave' },
  { id: 'flip-3d', label: '3D flip' },
  { id: 'extrude-3d', label: '3D extruded' },
];

export const TITLE_FONTS: readonly { id: TitleFont; label: string; css: string }[] = [
  { id: 'sans', label: 'Modern', css: "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'serif', label: 'Classic', css: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Code', css: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace" },
  { id: 'impact', label: 'Bold', css: "Impact, 'Anton', 'Arial Black', sans-serif" },
  { id: 'hand', label: 'Handwritten', css: "'Segoe Print', 'Comic Sans MS', 'Chalkboard SE', cursive" },
];

/** Smooth easing from 0 to 1. */
export const easeOut = (p: number) => 1 - (1 - p) ** 3;
/** Overshoots a little before settling, for a bouncy pop. */
export const easeOutBack = (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;

/** How far into its entrance animation a title is: 0 at the start, 1 when settled (within a second, or a third of the clip). */
export function titleEntrance(local: number, length: number, animation: TitleAnimation | undefined): number {
  if (!animation || animation === 'none') return 1;
  const duration = animation === 'typewriter' ? Math.min(2.5, length * 0.6) : Math.min(1, length / 3);
  return duration > 0 ? Math.min(1, Math.max(0, local / duration)) : 1;
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
  /** A speed ramp: the clip's time is bent so parts play slower or faster (length stays the same). */
  ramp?: SpeedRamp;
  /** A subtitle line (a title clip that is saved to and read from .srt files). */
  caption?: boolean;
}

export type RampShape = 'none' | 'speed-up' | 'slow-down' | 'slow-middle' | 'fast-middle';
export interface SpeedRamp {
  shape: RampShape;
  /** 0.1..0.9: how strong the change of speed is. */
  amount: number;
}

export const RAMP_SHAPES: readonly { id: RampShape; label: string }[] = [
  { id: 'none', label: 'Steady' },
  { id: 'speed-up', label: 'Speed up (slow → fast)' },
  { id: 'slow-down', label: 'Slow down (fast → slow)' },
  { id: 'slow-middle', label: 'Slow motion in the middle' },
  { id: 'fast-middle', label: 'Fast in the middle' },
];

/**
 * How far through its source a ramped clip is (0..1) when it is `p` (0..1) through its
 * time on the timeline. Always rises, starts at 0 and ends at 1.
 */
export function rampPosition(ramp: SpeedRamp | undefined, p: number): number {
  const x = Math.min(1, Math.max(0, p));
  if (!ramp || ramp.shape === 'none') return x;
  const a = Math.min(0.9, Math.max(0.1, ramp.amount));
  switch (ramp.shape) {
    case 'speed-up':
      // Slope rises from 1-a to 1+a.
      return (1 - a) * x + a * x * x;
    case 'slow-down':
      return (1 + a) * x - a * x * x;
    case 'slow-middle':
      // Slope 1+a at the ends, 1-a in the middle.
      return x + (a * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
    case 'fast-middle':
      return x - (a * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
  }
}

/** The speed factor (slope) of a ramp at `p`: 1 is normal speed for the clip. */
export function rampRate(ramp: SpeedRamp | undefined, p: number): number {
  const x = Math.min(1, Math.max(0, p));
  if (!ramp || ramp.shape === 'none') return 1;
  const a = Math.min(0.9, Math.max(0.1, ramp.amount));
  switch (ramp.shape) {
    case 'speed-up':
      return 1 - a + 2 * a * x;
    case 'slow-down':
      return 1 + a - 2 * a * x;
    case 'slow-middle':
      return 1 + a * Math.cos(2 * Math.PI * x);
    case 'fast-middle':
      return 1 - a * Math.cos(2 * Math.PI * x);
  }
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
  /** How the picture fills the frame: fit inside (default), crop to fill, stretch, or its own size. */
  fit?: ScaleMode;
}

export type ScaleMode = 'fit' | 'fill' | 'stretch' | 'none';
export const SCALE_MODES: readonly { id: ScaleMode; label: string }[] = [
  { id: 'fit', label: 'Fit (bars)' },
  { id: 'fill', label: 'Crop to fill' },
  { id: 'stretch', label: 'Stretch' },
  { id: 'none', label: 'Original size' },
];

export const NO_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };

export type KeyProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export interface Keyframe {
  /** Seconds from the start of the clip on the timeline. */
  t: number;
  v: number;
  /** How the value moves from this keyframe to the next one (straight line when unset). */
  ease?: KeyEase;
}
export type KeyEase = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'hold';
export const KEY_EASES: readonly { id: KeyEase; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease', label: 'Ease in & out' },
  { id: 'ease-in', label: 'Ease in (slow start)' },
  { id: 'ease-out', label: 'Ease out (slow end)' },
  { id: 'hold', label: 'Hold (jump)' },
];

/** Applies an easing curve to 0..1 progress. */
export function ease(kind: KeyEase | undefined, p: number): number {
  switch (kind) {
    case 'ease':
      return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
    case 'ease-in':
      return p * p * p;
    case 'ease-out':
      return 1 - (1 - p) ** 3;
    case 'hold':
      return 0;
    default:
      return p;
  }
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
  /** Decibels at 1 kHz (voices), -12..12. */
  mid?: number;
  /** Removes hum (50/60 Hz) and steady hiss. */
  denoise?: boolean;
  /** Evens out loud and quiet parts. */
  compressor?: boolean;
  /** 0..1 amount of crunchy distortion. */
  distortion?: number;
  /** Metallic robot voice. */
  robot?: boolean;
  /** Sounds like a telephone call. */
  phone?: boolean;
}

export const NO_AUDIO_FX: AudioFx = { echo: 0, bass: 0, treble: 0, clean: false };

export interface Track {
  id: number;
  name: string;
  muted: boolean;
  hidden: boolean;
  /** Locked tracks cannot be edited. */
  locked?: boolean;
  /** A captions track, and its lane (1 is the main one; 2 and 3 hold lines that overlap in time). */
  captions?: number;
}

export interface Project {
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  /** Times (seconds) marked on the timeline. */
  markers?: number[];
  /** What fills the frame where no picture is: black (default), a colour, or a blurred copy of the picture. */
  background?: Background;
}

export interface Background {
  kind: 'black' | 'colour' | 'blur';
  colour?: string;
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
  const into = clip.ramp && clip.ramp.shape !== 'none'
    ? rampPosition(clip.ramp, (time - clip.start) / (clipLength(clip) || 1)) * (clip.out - clip.in)
    : (time - clip.start) * (clip.speed ?? 1);
  return clip.reverse ? clip.out - into : clip.in + into;
}

/** The timeline time at which a clip shows source time `source` (the inverse of sourceTime, ramps included). */
export function timelineTime(clip: Clip, source: number): number {
  const length = clipLength(clip);
  // sourceTime only rises (or, reversed, only falls) across the clip, so halve the range until it is found.
  let lo = 0;
  let hi = length;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const at = sourceTime(clip, clip.start + mid);
    if (clip.reverse ? at > source : at < source) lo = mid;
    else hi = mid;
  }
  return clip.start + (lo + hi) / 2;
}

/** How fast the source plays at timeline `time` (speed times the ramp). */
export function rateAt(clip: Clip, time: number): number {
  return (clip.speed ?? 1) * rampRate(clip.ramp, (time - clip.start) / (clipLength(clip) || 1));
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
          Object.entries(clip.keyframes).map(([k, list]) => [k, (list ?? []).filter((f) => f.t >= from && f.t <= to).map((f) => ({ ...f, t: f.t - shift }))]),
        )
      : undefined;
  const leftSource = clip.reverse ? { in: cut, out: clip.out } : { in: clip.in, out: cut };
  const rightSource = clip.reverse ? { in: clip.in, out: cut } : { in: cut, out: clip.out };
  // A ramp bends the whole clip's time, so the parts play at a steady speed instead.
  const left: Clip = { ...clip, ...leftSource, transitionOut: undefined, keyframes: keys(0, local, 0), ramp: undefined };
  const right: Clip = { ...clip, ...rightSource, id: makeId('clip'), start: time, transitionIn: undefined, keyframes: keys(local, Infinity, local), ramp: undefined };
  return { ...project, clips: project.clips.flatMap((c) => (c.id === id ? [left, right] : [c])) };
}

/** Splits every clip under the playhead (like a razor across all tracks), except on locked tracks. */
export function splitAll(project: Project, time: number): Project {
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  return project.clips.filter((c) => time > c.start && time < clipEnd(c) && !locked.has(c.track)).reduce((p, c) => splitClip(p, c.id, time), project);
}

/**
 * Keyframes moved by `by` seconds (the clip's start moved later by `by`). Keyframes that
 * fall before the new start are dropped, and the value there is kept as a keyframe at 0.
 */
export function shiftKeyframes(keyframes: Keyframes | undefined, by: number): Keyframes | undefined {
  if (!keyframes || Math.abs(by) < 1e-9) return keyframes;
  const out: Keyframes = {};
  for (const [key, list] of Object.entries(keyframes) as [KeyProp, Keyframe[] | undefined][]) {
    if (!list?.length) continue;
    const moved = list.map((f) => ({ ...f, t: f.t - by }));
    const kept = moved.filter((f) => f.t >= -1e-9);
    if (kept.length < moved.length) {
      const first: Keyframe = { t: 0, v: valueAt(list, by, list[0].v) };
      const curve = list.find((f) => f.ease)?.ease;
      if (curve) first.ease = curve;
      if (!kept.some((f) => Math.abs(f.t) < 1 / 60)) kept.unshift(first);
    }
    out[key] = kept;
  }
  return out;
}

/** A clip's change for a new speed: keyframes stretch with the clip, so animations still line up with the picture. */
export function speedChange(clip: Clip, speed: number): Partial<Clip> {
  const ratio = (clip.speed ?? 1) / speed;
  const keyframes = clip.keyframes
    ? (Object.fromEntries(Object.entries(clip.keyframes).map(([k, list]) => [k, (list ?? []).map((f) => ({ ...f, t: f.t * ratio }))])) as Keyframes)
    : undefined;
  return { speed: speed === 1 ? undefined : speed, keyframes };
}

/**
 * Moves the left or right edge of a clip. Videos and sounds cannot be stretched past
 * their source; images and titles can be any length. Speed and reverse are honoured.
 */
export function trimClip(project: Project, id: string, edge: 'start' | 'end', time: number, sourceLength: number | null): Project {
  const next = trimRaw(project, id, edge, time, sourceLength);
  const before = project.clips.find((c) => c.id === id);
  const after = next.clips.find((c) => c.id === id);
  if (!before?.keyframes || !after || edge !== 'start' || after.start === before.start) return next;
  // Keyframes are timed from the clip's start: keep them on the same moment of the picture.
  return updateClip(next, id, { keyframes: shiftKeyframes(before.keyframes, after.start - before.start) });
}

function trimRaw(project: Project, id: string, edge: 'start' | 'end', time: number, sourceLength: number | null): Project {
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

/** Where a source sits in the frame for a scale mode (fit, crop to fill, stretch, original size), centred. */
export function scaleRect(mode: ScaleMode | undefined, sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number) {
  if (mode === 'stretch') return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const scale =
    mode === 'fill'
      ? Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight)
      : mode === 'none'
        ? 1
        : Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
}

// ---------- transitions ----------

export type TransitionType =
  | 'fade'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'slide-left'
  | 'slide-right'
  | 'circle'
  | 'zoom'
  | 'star'
  | 'heart'
  | 'diamond'
  | 'clock'
  | 'blinds'
  | 'checker'
  | 'barn-door';

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
  { type: 'star', label: 'Star', icon: '★' },
  { type: 'heart', label: 'Heart', icon: '♥' },
  { type: 'diamond', label: 'Diamond', icon: '◆' },
  { type: 'clock', label: 'Clock', icon: '🕒' },
  { type: 'blinds', label: 'Blinds', icon: '▤' },
  { type: 'checker', label: 'Checker', icon: '▦' },
  { type: 'barn-door', label: 'Barn door', icon: '▯' },
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
  /** 0..100 darkening towards the corners. */
  vignette?: number;
  /** 0..100 film grain (moving noise). */
  grain?: number;
  /** Flips the picture left to right. */
  mirror?: boolean;
  /** 0..100 wavy, rippling picture. */
  wave?: number;
  /** 0..100 pixels (at 720p) of red/blue colour shift. */
  rgbShift?: number;
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
  { name: 'Vignette', icon: '⭕', effects: { vignette: 60 } },
  { name: 'Film grain', icon: '🎞', effects: { grain: 35 } },
  { name: 'Old film', icon: '📽', effects: { sepia: 60, grain: 45, vignette: 55, contrast: 110 } },
  { name: 'Mirror', icon: '🪞', effects: { mirror: true } },
  { name: 'Wave', icon: '🌊', effects: { wave: 40 } },
  { name: 'Colour shift', icon: '🎨', effects: { rgbShift: 8 } },
  { name: 'Negative', icon: '🎞️', effects: { invert: 100, hue: 180 } },
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

/** A keyframed value at clip-local time `t`, following each keyframe's curve to the next; `base` when there are none. */
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
      return a.v + (b.v - a.v) * ease(a.ease, (t - a.t) / (b.t - a.t || 1));
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
  const old = clip.keyframes?.[prop] ?? [];
  const same = old.find((f) => Math.abs(f.t - t) <= 1 / 60);
  const list = old.filter((f) => f !== same);
  // A new keyframe follows the curve the clip's keyframes already use.
  const curve = same ? same.ease : keyframeEase(clip);
  const frame: Keyframe = curve && curve !== 'linear' ? { t, v, ease: curve } : { t, v };
  return { ...clip.keyframes, [prop]: [...list, frame].sort((a, b) => a.t - b.t) };
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

/** Gives every keyframe of a clip the same curve. */
export function easeKeyframes(clip: Clip, kind: KeyEase): Keyframes | undefined {
  if (!clip.keyframes) return undefined;
  return Object.fromEntries(Object.entries(clip.keyframes).map(([k, list]) => [k, (list ?? []).map((f) => ({ ...f, ease: kind }))])) as Keyframes;
}

/** The curve most of a clip's keyframes use (linear when none). */
export function keyframeEase(clip: Clip): KeyEase {
  const all = Object.values(clip.keyframes ?? {}).flat();
  return all.find((f) => f?.ease)?.ease ?? 'linear';
}

/** Places pictures one after another on a track: a slideshow, each `seconds` long, with a fade between. */
export function slideshow(project: Project, images: readonly MediaItem[], track: number, start: number, seconds: number, fade: boolean): { project: Project; ids: string[] } {
  let next = project;
  const ids: string[] = [];
  let at = freeStart(project, track, start, seconds * images.length);
  for (const image of images) {
    const clip: Clip = { id: makeId('clip'), track, start: at, in: 0, out: seconds, mediaId: image.id, volume: 1 };
    if (fade) {
      clip.transitionIn = { type: 'fade', duration: Math.min(0.5, seconds / 3) };
      clip.transitionOut = { type: 'fade', duration: Math.min(0.5, seconds / 3) };
    }
    next = { ...next, clips: [...next.clips, clip] };
    ids.push(clip.id);
    at += seconds;
  }
  return { project: next, ids };
}

/** A track's new name, cleaned up; the old name when it is empty. */
export function renameTrack(project: Project, id: number, name: string): Project {
  const clean = name.trim().slice(0, 30);
  if (!clean) return project;
  return { ...project, tracks: project.tracks.map((t) => (t.id === id ? { ...t, name: clean } : t)) };
}
