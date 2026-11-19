/**
 * Renders the project to a video file in the browser: every frame is drawn on a
 * canvas and encoded with WebCodecs (H.264 in MP4 where possible), and the sound of
 * all clips is mixed into one track.
 */
import type { VideoSample } from 'mediabunny';
import { decodeAudio, openMedia } from '../video/media';
import { Clip, MediaItem, Project, clipEnd, clipLength, projectDuration } from './project';
import { FrameSource, drawFrame } from './render';

/** Source times of the frames a clip shows, one per output frame it covers. */
export function frameTimes(clip: Clip, fps: number): number[] {
  const times: number[] = [];
  const first = Math.ceil(clip.start * fps - 1e-6);
  for (let frame = first; frame / fps < clipEnd(clip) - 1e-6; frame++) times.push(clip.in + (frame / fps - clip.start));
  return times;
}

export async function exportProject(
  project: Project,
  media: readonly MediaItem[],
  onProgress: (fraction: number, stage: string) => void,
): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add something to the timeline first.');
  const byId = new Map(media.map((m) => [m.id, m]));
  const { width, height, fps } = project;
  const mp4 = await mb.canEncodeVideo('avc', { width, height });
  if (!mp4 && !(await mb.canEncodeVideo('vp9', { width, height }))) throw new Error('This browser cannot encode video. Try Chrome, Edge or Safari.');
  const audioCodec = mp4 && (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';

  // 1. Sound: mix every clip with audio, on tracks that are not muted.
  onProgress(0, 'Mixing the sound…');
  const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const soundClips = project.clips.filter((c) => {
    const m = c.mediaId ? byId.get(c.mediaId) : undefined;
    return m && m.hasAudio && !muted.has(c.track) && c.volume > 0;
  });
  let mix: AudioBuffer | null = null;
  if (soundClips.length) {
    const rate = 48_000;
    const context = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
    const decoded = new Map<string, AudioBuffer | null>();
    for (const clip of soundClips) {
      const item = byId.get(clip.mediaId!)!;
      if (!decoded.has(item.id)) decoded.set(item.id, await decodeAudio(item.file, context));
      const buffer = decoded.get(item.id);
      if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = clip.volume;
      source.connect(gain).connect(context.destination);
      source.start(clip.start, clip.in, clipLength(clip));
    }
    mix = await context.startRendering();
  }

  // 2. Pictures: a frame source for every video clip, read in order.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const output = new mb.Output({
    format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const video = new mb.CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp9', quality: mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  const sound = mix ? new mb.AudioBufferSource({ codec: audioCodec, quality: mb.QUALITY_HIGH }) : null;
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
      if (item.kind === 'video') {
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
