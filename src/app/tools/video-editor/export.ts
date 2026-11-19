/**
 * Renders the project to a video file in the browser: every frame is drawn on a
 * canvas and encoded with WebCodecs (H.264 in MP4 where possible), and the sound of
 * all clips is mixed into one track. Also saves single frames, picture sequences,
 * GIFs and the sound alone.
 */
import type { VideoSample } from 'mediabunny';
import { audioBitrate, decodeAudio, openMedia, videoBitrate } from '../video/media';
import { connectAudioFx, reversed } from './audio-fx';
import { Clip, MediaItem, Project, clipEnd, clipLength, projectDuration, rateAt, sourceTime } from './project';
import { FrameSource, drawFrame } from './render';

/** Source times of the frames a clip shows, one per output frame it covers (inside `from`..`to` when given). */
export function frameTimes(clip: Clip, fps: number, from = 0, to = Infinity): number[] {
  const times: number[] = [];
  const first = Math.ceil(Math.max(clip.start, from) * fps - 1e-6);
  const end = Math.min(clipEnd(clip), to);
  for (let frame = first; frame / fps < end - 1e-6; frame++) times.push(sourceTime(clip, frame / fps));
  return times;
}

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'm4a' | 'mp3' | 'wav' | 'png-sequence';
export type ExportQuality = 'low' | 'medium' | 'high' | 'very-high';
/** Output height of the shorter side, or the project's own size. */
export type ExportResolution = 'project' | 480 | 720 | 1080;

export interface ExportOptions {
  format: ExportFormat;
  quality: ExportQuality;
  /** Overrides the project size (keeping its shape). */
  resolution?: ExportResolution;
  /** Overrides the project frame rate. */
  fps?: number;
  /** Only this part of the timeline, in seconds. */
  range?: { start: number; end: number };
  /** Stops the export (Cancel). */
  signal?: AbortSignal;
}

/** The error thrown when an export is cancelled. */
export const CANCELLED = 'Export cancelled.';
function checkCancel(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error(CANCELLED);
}

export const EXPORT_FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'mp4', label: 'MP4 video (H.264)' },
  { id: 'webm', label: 'WebM video (VP9)' },
  { id: 'gif', label: 'Animated GIF (no sound)' },
  { id: 'png-sequence', label: 'Photos: PNG frames (.zip)' },
  { id: 'm4a', label: 'Audio only: M4A' },
  { id: 'mp3', label: 'Audio only: MP3' },
  { id: 'wav', label: 'Audio only: WAV' },
];

export const EXPORT_RESOLUTIONS: readonly { id: ExportResolution; label: string }[] = [
  { id: 'project', label: 'Project size' },
  { id: 480, label: '480p' },
  { id: 720, label: '720p HD' },
  { id: 1080, label: '1080p Full HD' },
];

export const EXPORT_FPS: readonly number[] = [24, 25, 30, 50, 60];

/** GIFs are kept small: at most this wide and this many frames a second. */
export const GIF_MAX_WIDTH = 480;
export const GIF_FPS = 12;
/** Picture sequences take at most this many frames a second. */
export const SEQUENCE_MAX_FPS = 10;

/** The output size for a resolution: the shorter side becomes `resolution`, sizes stay even (encoders need that). */
export function outputSize(project: Pick<Project, 'width' | 'height'>, resolution: ExportResolution | undefined): { width: number; height: number } {
  if (!resolution || resolution === 'project') return { width: project.width, height: project.height };
  const scale = resolution / Math.min(project.width, project.height);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(project.width * scale), height: even(project.height * scale) };
}

/** The part of the timeline to export: the given range, clamped, or everything. */
export function exportRange(project: Project, range: ExportOptions['range']): { start: number; end: number } {
  const duration = projectDuration(project);
  if (!range) return { start: 0, end: duration };
  const start = Math.max(0, Math.min(range.start, duration));
  const end = Math.max(start, Math.min(range.end, duration));
  return { start, end };
}

/** A rough file size in bytes before exporting, so people know what to expect. */
export function estimateSize(project: Project, options: ExportOptions, hasSound = true): number {
  const { start, end } = exportRange(project, options.range);
  const seconds = end - start;
  const { width, height } = outputSize(project, options.resolution);
  const fps = options.fps ?? project.fps;
  const sound = (codec: 'aac' | 'opus' | 'mp3') => (hasSound ? (audioBitrate(codec, options.quality) * seconds) / 8 : 0);
  switch (options.format) {
    case 'wav':
      return seconds * 48_000 * 2 * 2;
    case 'mp3':
      return sound('mp3');
    case 'm4a':
      return sound('aac');
    case 'gif': {
      const scale = Math.min(1, GIF_MAX_WIDTH / width);
      return width * scale * height * scale * Math.min(GIF_FPS, fps) * seconds * 0.35;
    }
    case 'png-sequence':
      return width * height * 1.2 * Math.ceil(seconds * Math.min(SEQUENCE_MAX_FPS, fps));
    default: {
      const webm = options.format === 'webm';
      return (videoBitrate(width, height, options.quality, webm ? 'vp9' : 'avc') * seconds) / 8 + sound(webm ? 'opus' : 'aac');
    }
  }
}

/** "12.4 MB" style size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** The project drawn at another size: every position and size is relative, so only the frame changes. */
function resized(project: Project, size: { width: number; height: number }): Project {
  return size.width === project.width && size.height === project.height ? project : { ...project, ...size };
}

/** Mixes the sound of all clips from 0 to `end`; null when nothing makes a sound. */
async function mixSound(project: Project, byId: Map<string, MediaItem>, end: number): Promise<AudioBuffer | null> {
  const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const soundClips = project.clips.filter((c) => {
    const m = c.mediaId ? byId.get(c.mediaId) : undefined;
    return m && m.hasAudio && !c.muted && !muted.has(c.track) && c.volume > 0 && c.start < end;
  });
  if (!soundClips.length || end <= 0) return null;
  const rate = 48_000;
  const context = new OfflineAudioContext(2, Math.ceil(end * rate), rate);
  const decoded = new Map<string, AudioBuffer | null>();
  const backwards = new Map<string, AudioBuffer>();
  for (const clip of soundClips) {
    const item = byId.get(clip.mediaId!)!;
    if (!decoded.has(item.id)) decoded.set(item.id, await decodeAudio(item.file, context));
    let buffer = decoded.get(item.id);
    if (!buffer) continue;
    if (clip.reverse) {
      if (!backwards.has(item.id)) backwards.set(item.id, reversed(context, buffer));
      buffer = backwards.get(item.id)!;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const length = clipLength(clip);
    if (clip.ramp && clip.ramp.shape !== 'none') {
      // The speed ramp changes the playback rate smoothly over the clip.
      const curve = Float32Array.from({ length: 64 }, (_, i) => rateAt(clip, clip.start + (length * i) / 63));
      source.playbackRate.setValueCurveAtTime(curve, clip.start, length);
    } else {
      source.playbackRate.value = clip.speed ?? 1;
    }
    const gain = context.createGain();
    // Transitions fade the sound together with the picture.
    const clipEndTime = clipEnd(clip);
    const fadeIn = clip.transitionIn ? Math.min(clip.transitionIn.duration, length) : 0;
    const fadeOut = clip.transitionOut ? Math.min(clip.transitionOut.duration, length) : 0;
    gain.gain.setValueAtTime(fadeIn ? 0 : clip.volume, clip.start);
    if (fadeIn) gain.gain.linearRampToValueAtTime(clip.volume, clip.start + fadeIn);
    if (fadeOut) {
      gain.gain.setValueAtTime(clip.volume, Math.max(clip.start + fadeIn, clipEndTime - fadeOut));
      gain.gain.linearRampToValueAtTime(0, clipEndTime);
    }
    connectAudioFx(context, source, clip.audio).connect(gain).connect(context.destination);
    // Offsets are in source seconds; a reversed buffer runs from the end of the source.
    const offset = clip.reverse ? buffer.duration - clip.out : clip.in;
    source.start(clip.start, Math.max(0, offset), clip.out - clip.in);
  }
  return context.startRendering();
}

/** The part of a mixed buffer from `start` seconds on. */
function sliceBuffer(buffer: AudioBuffer, start: number): AudioBuffer {
  const from = Math.min(buffer.length - 1, Math.round(start * buffer.sampleRate));
  if (from <= 0) return buffer;
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length - from, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(from), c);
  return out;
}

/**
 * Draws every frame from `start` to `end` at `fps` on `canvas`, reading each video in
 * order, and calls `onFrame` after each one.
 */
async function renderFrames(
  project: Project,
  byId: Map<string, MediaItem>,
  canvas: HTMLCanvasElement,
  fps: number,
  start: number,
  end: number,
  onFrame: (index: number, total: number, time: number) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  const mb = await import('mediabunny');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const inputs: { dispose(): void }[] = [];
  const readers = new Map<string, { samples: AsyncGenerator<VideoSample | null>; current: VideoSample | null }>();
  const images = new Map<string, ImageBitmap>();
  try {
    for (const clip of project.clips) {
      const item = clip.mediaId ? byId.get(clip.mediaId) : undefined;
      if (!item || clipEnd(clip) <= start || clip.start >= end) continue;
      if (item.kind === 'image' && !images.has(item.id)) images.set(item.id, await createImageBitmap(item.file));
      if (item.kind === 'video' && !clip.audioOnly) {
        const input = await openMedia(item.file);
        inputs.push(input);
        const track = await input.getPrimaryVideoTrack();
        if (track) readers.set(clip.id, { samples: new mb.VideoSampleSink(track).samplesAtTimestamps(frameTimes(clip, fps, start, end)), current: null });
      }
    }
    const first = Math.ceil(start * fps - 1e-6);
    const total = Math.max(1, Math.ceil(end * fps - 1e-6) - first);
    for (let index = 0; index < total; index++) {
      checkCancel(signal);
      const time = (first + index) / fps;
      // Advance the reader of every video clip showing in this frame.
      for (const clip of project.clips) {
        const reader = readers.get(clip.id);
        if (!reader || time < clip.start - 1e-6 || time >= clipEnd(clip) - 1e-6) continue;
        const next = await reader.samples.next();
        if (!next.done) {
          reader.current?.close();
          reader.current = next.value;
        }
      }
      drawFrame(context, project, time, (clip): FrameSource => {
        const item = clip.mediaId ? byId.get(clip.mediaId) : undefined;
        if (!item) return null;
        if (item.kind === 'image') {
          const bitmap = images.get(item.id);
          return bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : null;
        }
        const sample = readers.get(clip.id)?.current;
        return sample ? { image: sample.toCanvasImageSource(), width: sample.displayWidth, height: sample.displayHeight } : null;
      });
      await onFrame(index, total, time);
    }
  } finally {
    for (const reader of readers.values()) {
      reader.current?.close();
      await reader.samples.return(undefined);
    }
    for (const bitmap of images.values()) bitmap.close();
    for (const input of inputs) input.dispose();
  }
}

export async function exportProject(
  original: Project,
  media: readonly MediaItem[],
  onProgress: (fraction: number, stage: string) => void,
  options: ExportOptions = { format: 'mp4', quality: 'high' },
): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  if (projectDuration(original) <= 0) throw new Error('Add something to the timeline first.');
  const { start, end } = exportRange(original, options.range);
  if (end - start <= 0) throw new Error('The part to export is empty. Check the From and To times.');
  const project = resized(original, outputSize(original, options.resolution));
  const byId = new Map(media.map((m) => [m.id, m]));
  const quality = { low: mb.QUALITY_LOW, medium: mb.QUALITY_MEDIUM, high: mb.QUALITY_HIGH, 'very-high': mb.QUALITY_VERY_HIGH }[options.quality];
  const { width, height } = project;
  const audioOnly = options.format === 'm4a' || options.format === 'mp3' || options.format === 'wav';
  const gif = options.format === 'gif';
  const sequence = options.format === 'png-sequence';
  let mp4 = options.format === 'mp4';
  if (!audioOnly && !gif && !sequence) {
    const ok = await mb.canEncodeVideo(mp4 ? 'avc' : 'vp9', { width, height });
    if (!ok) {
      if (mp4 && (await mb.canEncodeVideo('vp9', { width, height }))) mp4 = false;
      else throw new Error('This browser cannot encode this video format. Try Chrome or Edge, or choose WebM.');
    }
  }
  const audioCodec = mp4 && (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';
  const baseFps = options.fps ?? project.fps;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (gif) return exportGif(project, byId, canvas, Math.min(GIF_FPS, baseFps), start, end, onProgress, options.signal);
  if (sequence) return exportSequence(project, byId, canvas, Math.min(SEQUENCE_MAX_FPS, baseFps), start, end, onProgress, options.signal);

  // 1. Sound: mix every clip with audio, on tracks that are not muted.
  onProgress(0, 'Mixing the sound…');
  const fullMix = await mixSound(project, byId, end);
  const mix = fullMix ? sliceBuffer(fullMix, start) : null;
  checkCancel(options.signal);

  if (audioOnly) {
    if (!mix) throw new Error('There is no sound on the timeline to export.');
    return exportAudio(mb, mix, options.format as 'm4a' | 'mp3' | 'wav', quality, onProgress);
  }

  // 2. Pictures, with the sound added in half-second pieces alongside, so the file is interleaved.
  const fps = baseFps;
  const output = new mb.Output({
    format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const video = new mb.CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp9', quality });
  output.addVideoTrack(video, { frameRate: fps });
  const sound = mix ? new mb.AudioBufferSource({ codec: audioCodec, quality }) : null;
  if (sound) output.addAudioTrack(sound);
  await output.start();
  let soundAt = 0;
  const addSound = async (until: number) => {
    if (!sound || !mix) return;
    const stop = Math.min(mix.length, Math.ceil(until * mix.sampleRate));
    while (soundAt < stop) {
      const length = Math.min(Math.ceil(mix.sampleRate / 2), mix.length - soundAt);
      const part = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: mix.sampleRate });
      for (let c = 0; c < 2; c++) part.copyToChannel(mix.getChannelData(c).subarray(soundAt, soundAt + length), c);
      await sound.add(part);
      soundAt += length;
    }
  };
  try {
    await renderFrames(
      project,
      byId,
      canvas,
      fps,
      start,
      end,
      async (index, total) => {
        const at = index / fps;
        await addSound(at + 0.5);
        await video.add(at, 1 / fps);
        if (index % 5 === 0) onProgress(index / total, `Drawing frame ${index + 1} of ${total}…`);
      },
      options.signal,
    );
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  await addSound(Infinity);
  video.close();
  sound?.close();
  await output.finalize();
  onProgress(1, 'Done');
  return { blob: new Blob([output.target.buffer!], { type: mp4 ? 'video/mp4' : 'video/webm' }), extension: mp4 ? 'mp4' : 'webm' };
}

type Mediabunny = typeof import('mediabunny');

/** Encodes the mixed sound alone as M4A, MP3 or WAV. */
async function exportAudio(
  mb: Mediabunny,
  mix: AudioBuffer,
  format: 'm4a' | 'mp3' | 'wav',
  quality: import('mediabunny').Quality,
  onProgress: (fraction: number, stage: string) => void,
): Promise<{ blob: Blob; extension: string }> {
  onProgress(0.5, 'Saving the sound…');
  let codec: 'aac' | 'opus' | 'mp3' | 'pcm-s16' = 'pcm-s16';
  if (format === 'mp3') {
    if (!(await mb.canEncodeAudio('mp3'))) (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
    codec = 'mp3';
  } else if (format === 'm4a') {
    codec = (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';
  }
  const output = new mb.Output({
    format: format === 'mp3' ? new mb.Mp3OutputFormat() : format === 'wav' ? new mb.WavOutputFormat() : new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new mb.BufferTarget(),
  });
  const source = new mb.AudioBufferSource(codec === 'pcm-s16' ? { codec } : { codec, quality });
  output.addAudioTrack(source);
  await output.start();
  await source.add(mix);
  source.close();
  await output.finalize();
  onProgress(1, 'Done');
  const mime = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }[format];
  return { blob: new Blob([output.target.buffer!], { type: mime }), extension: format };
}

/** Draws the project frame by frame into an animated GIF (no sound), small enough to share. */
async function exportGif(
  project: Project,
  byId: Map<string, MediaItem>,
  frameCanvas: HTMLCanvasElement,
  fps: number,
  start: number,
  end: number,
  onProgress: (fraction: number, stage: string) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; extension: string }> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc/dist/gifenc.esm.js');
  const scale = Math.min(1, GIF_MAX_WIDTH / project.width);
  const small = document.createElement('canvas');
  small.width = Math.round(project.width * scale);
  small.height = Math.round(project.height * scale);
  const smallContext = small.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  await renderFrames(project, byId, frameCanvas, fps, start, end, (index, total) => {
    smallContext.drawImage(frameCanvas, 0, 0, small.width, small.height);
    const { data } = smallContext.getImageData(0, 0, small.width, small.height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), small.width, small.height, { palette, delay: Math.round(1000 / fps) } as never);
    if (index % 3 === 0) onProgress(index / total, `Drawing frame ${index + 1} of ${total}…`);
  }, signal);
  gif.finish();
  onProgress(1, 'Done');
  return { blob: new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' }), extension: 'gif' };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), type, quality));
}

/** Saves every frame (at most 10 a second) as numbered PNG pictures in a .zip. */
async function exportSequence(
  project: Project,
  byId: Map<string, MediaItem>,
  canvas: HTMLCanvasElement,
  fps: number,
  start: number,
  end: number,
  onProgress: (fraction: number, stage: string) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; extension: string }> {
  const { zipSync } = await import('fflate');
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  await renderFrames(project, byId, canvas, fps, start, end, async (index, total) => {
    const png = await canvasBlob(canvas, 'image/png');
    files[`frame-${String(index + 1).padStart(5, '0')}.png`] = [new Uint8Array(await png.arrayBuffer()), { level: 0 }];
    if (index % 3 === 0) onProgress(index / total, `Saving picture ${index + 1} of ${total}…`);
  }, signal);
  onProgress(1, 'Done');
  return { blob: new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), extension: 'zip' };
}

/** The frame at `time` as a PNG or JPG picture, at the project size. */
export async function exportFrame(project: Project, media: readonly MediaItem[], time: number, type: 'png' | 'jpg'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const fps = project.fps;
  // One frame long, starting at the frame under the playhead.
  const at = Math.floor(time * fps + 1e-6) / fps;
  await renderFrames(project, new Map(media.map((m) => [m.id, m])), canvas, fps, at, at + 1 / fps, () => undefined);
  return canvasBlob(canvas, type === 'png' ? 'image/png' : 'image/jpeg', 0.92);
}
