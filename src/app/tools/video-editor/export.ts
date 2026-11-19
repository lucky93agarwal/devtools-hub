/**
 * Renders the project to a video file in the browser: every frame is drawn on a
 * canvas and encoded with WebCodecs (H.264 in MP4 where possible), and the sound of
 * all clips is mixed into one track.
 */
import type { VideoSample } from 'mediabunny';
import { decodeAudio, openMedia } from '../video/media';
import { connectAudioFx, reversed } from './audio-fx';
import { Clip, MediaItem, Project, clipEnd, clipLength, projectDuration, sourceTime } from './project';
import { FrameSource, drawFrame } from './render';

/** Source times of the frames a clip shows, one per output frame it covers. */
export function frameTimes(clip: Clip, fps: number): number[] {
  const times: number[] = [];
  const first = Math.ceil(clip.start * fps - 1e-6);
  for (let frame = first; frame / fps < clipEnd(clip) - 1e-6; frame++) times.push(sourceTime(clip, frame / fps));
  return times;
}

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'm4a' | 'mp3' | 'wav';
export type ExportQuality = 'low' | 'medium' | 'high' | 'very-high';

export interface ExportOptions {
  format: ExportFormat;
  quality: ExportQuality;
}

export const EXPORT_FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'mp4', label: 'MP4 video (H.264)' },
  { id: 'webm', label: 'WebM video (VP9)' },
  { id: 'gif', label: 'Animated GIF (no sound)' },
  { id: 'm4a', label: 'Audio only: M4A' },
  { id: 'mp3', label: 'Audio only: MP3' },
  { id: 'wav', label: 'Audio only: WAV' },
];

/** GIFs are kept small: at most this wide and this many frames a second. */
export const GIF_MAX_WIDTH = 480;
export const GIF_FPS = 12;

export async function exportProject(
  project: Project,
  media: readonly MediaItem[],
  onProgress: (fraction: number, stage: string) => void,
  options: ExportOptions = { format: 'mp4', quality: 'high' },
): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add something to the timeline first.');
  const byId = new Map(media.map((m) => [m.id, m]));
  const quality = { low: mb.QUALITY_LOW, medium: mb.QUALITY_MEDIUM, high: mb.QUALITY_HIGH, 'very-high': mb.QUALITY_VERY_HIGH }[options.quality];
  const { width, height } = project;
  const audioOnly = options.format === 'm4a' || options.format === 'mp3' || options.format === 'wav';
  const gif = options.format === 'gif';
  let mp4 = options.format === 'mp4';
  if (!audioOnly && !gif) {
    const ok = await mb.canEncodeVideo(mp4 ? 'avc' : 'vp9', { width, height });
    if (!ok) {
      if (mp4 && (await mb.canEncodeVideo('vp9', { width, height }))) mp4 = false;
      else throw new Error('This browser cannot encode this video format. Try Chrome or Edge, or choose WebM.');
    }
  }
  const audioCodec = mp4 && (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';

  // 1. Sound: mix every clip with audio, on tracks that are not muted.
  onProgress(0, 'Mixing the sound…');
  const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const soundClips = project.clips.filter((c) => {
    const m = c.mediaId ? byId.get(c.mediaId) : undefined;
    return m && m.hasAudio && !c.muted && !muted.has(c.track) && c.volume > 0;
  });
  let mix: AudioBuffer | null = null;
  if (soundClips.length) {
    const rate = 48_000;
    const context = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
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
      source.playbackRate.value = clip.speed ?? 1;
      const gain = context.createGain();
      // Transitions fade the sound together with the picture.
      const end = clipEnd(clip);
      const fadeIn = clip.transitionIn ? Math.min(clip.transitionIn.duration, clipLength(clip)) : 0;
      const fadeOut = clip.transitionOut ? Math.min(clip.transitionOut.duration, clipLength(clip)) : 0;
      gain.gain.setValueAtTime(fadeIn ? 0 : clip.volume, clip.start);
      if (fadeIn) gain.gain.linearRampToValueAtTime(clip.volume, clip.start + fadeIn);
      if (fadeOut) {
        gain.gain.setValueAtTime(clip.volume, Math.max(clip.start + fadeIn, end - fadeOut));
        gain.gain.linearRampToValueAtTime(0, end);
      }
      connectAudioFx(context, source, clip.audio).connect(gain).connect(context.destination);
      // Offsets are in source seconds; a reversed buffer runs from the end of the source.
      const offset = clip.reverse ? buffer.duration - clip.out : clip.in;
      source.start(clip.start, Math.max(0, offset), clip.out - clip.in);
    }
    mix = await context.startRendering();
  }

  if (audioOnly) {
    if (!mix) throw new Error('There is no sound on the timeline to export.');
    return exportAudio(mb, mix, options.format as 'm4a' | 'mp3' | 'wav', quality, onProgress);
  }

  // 2. Pictures: a frame source for every video clip, read in order.
  const fps = gif ? Math.min(GIF_FPS, project.fps) : project.fps;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  if (gif) return exportGif(project, byId, canvas, fps, duration, onProgress);
  const output = new mb.Output({
    format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const video = new mb.CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp9', quality });
  output.addVideoTrack(video, { frameRate: fps });
  const sound = mix ? new mb.AudioBufferSource({ codec: audioCodec, quality }) : null;
  if (sound) output.addAudioTrack(sound);
  await output.start();

  const inputs: { dispose(): void }[] = [];
  const readers = new Map<string, { samples: AsyncGenerator<VideoSample | null>; current: VideoSample | null }>();
  const images = new Map<string, ImageBitmap>();
  try {
    for (const clip of project.clips) {
      const item = clip.mediaId ? byId.get(clip.mediaId) : undefined;
      if (!item) continue;
      if (item.kind === 'image' && !images.has(item.id)) images.set(item.id, await createImageBitmap(item.file));
      if (item.kind === 'video' && !clip.audioOnly) {
        const input = await openMedia(item.file);
        inputs.push(input);
        const track = await input.getPrimaryVideoTrack();
        if (track) readers.set(clip.id, { samples: new mb.VideoSampleSink(track).samplesAtTimestamps(frameTimes(clip, fps)), current: null });
      }
    }
    // Sound is added in half-second pieces alongside the pictures, so the file is interleaved.
    let soundAt = 0;
    const addSound = async (until: number) => {
      if (!sound || !mix) return;
      const end = Math.min(mix.length, Math.ceil(until * mix.sampleRate));
      while (soundAt < end) {
        const length = Math.min(Math.ceil(mix.sampleRate / 2), mix.length - soundAt);
        const part = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: mix.sampleRate });
        for (let c = 0; c < 2; c++) part.copyToChannel(mix.getChannelData(c).subarray(soundAt, soundAt + length), c);
        await sound.add(part);
        soundAt += length;
      }
    };
    const total = Math.ceil(duration * fps);
    for (let frame = 0; frame < total; frame++) {
      const time = frame / fps;
      await addSound(time + 0.5);
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
          const bitmap = images.get(item.id)!;
          return { image: bitmap, width: bitmap.width, height: bitmap.height };
        }
        const sample = readers.get(clip.id)?.current;
        return sample ? { image: sample.toCanvasImageSource(), width: sample.displayWidth, height: sample.displayHeight } : null;
      });
      await video.add(time, 1 / fps);
      if (frame % 5 === 0) onProgress(frame / total, `Drawing frame ${frame + 1} of ${total}…`);
    }
    await addSound(Infinity);
    video.close();
    sound?.close();
    await output.finalize();
  } finally {
    for (const reader of readers.values()) {
      reader.current?.close();
      await reader.samples.return(undefined);
    }
    for (const bitmap of images.values()) bitmap.close();
    for (const input of inputs) input.dispose();
  }
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
  duration: number,
  onProgress: (fraction: number, stage: string) => void,
): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc/dist/gifenc.esm.js');
  const scale = Math.min(1, GIF_MAX_WIDTH / project.width);
  const small = document.createElement('canvas');
  small.width = Math.round(project.width * scale);
  small.height = Math.round(project.height * scale);
  const smallContext = small.getContext('2d', { willReadFrequently: true })!;
  const context = frameCanvas.getContext('2d')!;
  const gif = GIFEncoder();
  const inputs: { dispose(): void }[] = [];
  const readers = new Map<string, { samples: AsyncGenerator<VideoSample | null>; current: VideoSample | null }>();
  const images = new Map<string, ImageBitmap>();
  try {
    for (const clip of project.clips) {
      const item = clip.mediaId ? byId.get(clip.mediaId) : undefined;
      if (!item) continue;
      if (item.kind === 'image' && !images.has(item.id)) images.set(item.id, await createImageBitmap(item.file));
      if (item.kind === 'video' && !clip.audioOnly) {
        const input = await openMedia(item.file);
        inputs.push(input);
        const track = await input.getPrimaryVideoTrack();
        if (track) readers.set(clip.id, { samples: new mb.VideoSampleSink(track).samplesAtTimestamps(frameTimes(clip, fps)), current: null });
      }
    }
    const total = Math.ceil(duration * fps);
    for (let frame = 0; frame < total; frame++) {
      const time = frame / fps;
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
          const bitmap = images.get(item.id)!;
          return { image: bitmap, width: bitmap.width, height: bitmap.height };
        }
        const sample = readers.get(clip.id)?.current;
        return sample ? { image: sample.toCanvasImageSource(), width: sample.displayWidth, height: sample.displayHeight } : null;
      });
      smallContext.drawImage(frameCanvas, 0, 0, small.width, small.height);
      const { data } = smallContext.getImageData(0, 0, small.width, small.height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), small.width, small.height, { palette, delay: Math.round(1000 / fps) } as never);
      if (frame % 3 === 0) onProgress(frame / total, `Drawing frame ${frame + 1} of ${total}…`);
    }
    gif.finish();
  } finally {
    for (const reader of readers.values()) {
      reader.current?.close();
      await reader.samples.return(undefined);
    }
    for (const bitmap of images.values()) bitmap.close();
    for (const input of inputs) input.dispose();
  }
  onProgress(1, 'Done');
  return { blob: new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' }), extension: 'gif' };
}
