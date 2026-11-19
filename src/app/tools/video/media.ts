/**
 * Video and audio work in the browser with Mediabunny (MPL-2.0): reading MP4, MOV,
 * WebM, MKV, MP3, WAV, OGG and more, copying video without re-encoding it, and
 * encoding audio with the browser's own WebCodecs encoders.
 */
import type { AudioCodec, Input as MediaInput } from 'mediabunny';

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
/** Longer media is refused, because mixing holds every sample in memory. */
export const MAX_MIX_SECONDS = 30 * 60;

export const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.ts,.mts';
export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.weba,video/*,.mp4,.mov,.webm,.mkv';

export type AudioFormat = 'original' | 'mp3' | 'wav' | 'm4a';

/** Container and file extension that hold an audio codec without re-encoding it. */
export function containerFor(codec: AudioCodec | null): { container: 'mp4' | 'mp3' | 'ogg' | 'wav' | 'flac' | 'webm'; extension: string } | null {
  switch (codec) {
    case 'aac':
      return { container: 'mp4', extension: 'm4a' };
    case 'mp3':
      return { container: 'mp3', extension: 'mp3' };
    case 'opus':
    case 'vorbis':
      return { container: 'ogg', extension: 'ogg' };
    case 'flac':
      return { container: 'flac', extension: 'flac' };
    case null:
      return null;
    default:
      return codec.startsWith('pcm') ? { container: 'wav', extension: 'wav' } : null;
  }
}

/** Start times (seconds) at which an added sound plays, repeating it when `loop` is on, within the video length. */
export function placements(offset: number, length: number, total: number, loop: boolean): number[] {
  if (length <= 0 || offset >= total) return [];
  if (!loop) return [Math.max(0, offset)];
  const starts: number[] = [];
  for (let t = Math.max(0, offset); t < total; t += length) starts.push(t);
  return starts;
}

/** "1:05" style time for labels. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

export async function openMedia(file: Blob): Promise<MediaInput> {
  const { Input, ALL_FORMATS, BlobSource } = await import('mediabunny');
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export interface MediaInfo {
  duration: number;
  hasVideo: boolean;
  audioCodec: AudioCodec | null;
  videoCodec: string | null;
  width: number;
  height: number;
}

export async function describe(file: Blob): Promise<MediaInfo> {
  const input = await openMedia(file);
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    return {
      duration: await input.computeDuration(),
      hasVideo: !!video,
      audioCodec: audio ? audio.codec : null,
      videoCodec: video ? video.codec : null,
      width: video ? video.displayWidth : 0,
      height: video ? video.displayHeight : 0,
    };
  } finally {
    input.dispose();
  }
}

/** Saves the audio track of a video (or any media file) on its own. */
export async function extractAudio(
  file: Blob,
  format: AudioFormat,
  trim: { start?: number; end?: number },
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; extension: string; reencoded: boolean }> {
  const mb = await import('mediabunny');
  const input = await openMedia(file);
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new Error('This video has no sound to extract.');
    let target = format === 'original' ? containerFor(audio.codec) : null;
    let codec: AudioCodec | undefined;
    if (format === 'mp3' || (format === 'original' && !target)) {
      if (!(await mb.canEncodeAudio('mp3'))) (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
      target = { container: 'mp3', extension: 'mp3' };
      codec = 'mp3';
    } else if (format === 'wav') {
      target = { container: 'wav', extension: 'wav' };
      codec = 'pcm-s16';
    } else if (format === 'm4a') {
      target = { container: 'mp4', extension: 'm4a' };
      codec = (await mb.canEncodeAudio('aac')) ? 'aac' : undefined;
      if (!codec) throw new Error('This browser cannot make M4A (AAC) files. Choose MP3 or WAV.');
    }
    const formats = {
      mp4: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      mp3: () => new mb.Mp3OutputFormat(),
      ogg: () => new mb.OggOutputFormat(),
      wav: () => new mb.WavOutputFormat(),
      flac: () => new mb.FlacOutputFormat(),
      webm: () => new mb.WebMOutputFormat(),
    };
    const output = new mb.Output({ format: formats[target!.container](), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: codec ? { codec, quality: mb.QUALITY_HIGH } : {},
      trim: trim.start || trim.end ? { start: trim.start || undefined, end: trim.end || undefined } : undefined,
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('This sound could not be saved in that format. Try MP3 or WAV.');
    conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    const mime = { mp4: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm' }[target!.container];
    return { blob: new Blob([output.target.buffer!], { type: mime }), extension: target!.extension, reencoded: !!codec };
  } finally {
    input.dispose();
  }
}

/** Decodes the whole audio track of a file into one AudioBuffer (null when it has no sound). */
export async function decodeAudio(file: Blob, context: BaseAudioContext): Promise<AudioBuffer | null> {
  const mb = await import('mediabunny');
  const input = await openMedia(file);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const duration = await track.computeDuration();
    if (duration > MAX_MIX_SECONDS) throw new Error(`Sounds longer than ${MAX_MIX_SECONDS / 60} minutes are not supported.`);
    const sink = new mb.AudioBufferSink(track);
    let out: AudioBuffer | null = null;
    for await (const { buffer, timestamp } of sink.buffers()) {
      out ??= context.createBuffer(Math.min(2, buffer.numberOfChannels), Math.max(1, Math.ceil((duration + 1) * buffer.sampleRate)), buffer.sampleRate);
      const at = Math.max(0, Math.round(timestamp * buffer.sampleRate));
      for (let channel = 0; channel < out.numberOfChannels; channel++) {
        const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        out.copyToChannel(data.subarray(0, Math.max(0, out.length - at)), channel, at);
      }
    }
    return out;
  } finally {
    input.dispose();
  }
}

export interface AddedSound {
  file: Blob;
  /** Where it starts in the video, in seconds. */
  offset: number;
  /** 0 to 2 (200%). */
  volume: number;
  loop: boolean;
  /** Fade in and out over this many seconds. */
  fade: number;
}

/** Mixes the video's own sound (at `originalVolume`) with the added sounds into one stereo buffer of the video's length. */
export async function mixSounds(
  video: Blob,
  duration: number,
  originalVolume: number,
  sounds: readonly AddedSound[],
  onStage: (text: string) => void,
): Promise<AudioBuffer> {
  const rate = 48_000;
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * rate)), rate);
  const play = (buffer: AudioBuffer, start: number, volume: number, fade: number) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const end = Math.min(duration, start + buffer.duration);
    gain.gain.setValueAtTime(fade > 0 ? 0 : volume, start);
    if (fade > 0) {
      const length = Math.min(fade, (end - start) / 2);
      gain.gain.linearRampToValueAtTime(volume, start + length);
      gain.gain.setValueAtTime(volume, end - length);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    source.connect(gain).connect(context.destination);
    source.start(start);
  };
  if (originalVolume > 0) {
    onStage('Reading the video\'s own sound…');
    const own = await decodeAudio(video, context);
    if (own) play(own, 0, originalVolume, 0);
  }
  for (const [i, sound] of sounds.entries()) {
    onStage(`Reading sound ${i + 1} of ${sounds.length}…`);
    const buffer = await decodeAudio(sound.file, context);
    if (!buffer) throw new Error(`Sound ${i + 1} has no audio in it.`);
    for (const start of placements(sound.offset, buffer.duration, duration, sound.loop)) play(buffer, start, sound.volume, sound.fade);
  }
  onStage('Mixing the sound…');
  return context.startRendering();
}

/**
 * Writes a new file with the video copied as it is (no quality loss, fast) and
 * `audio` as its only sound track.
 */
export async function replaceAudio(
  video: Blob,
  audio: AudioBuffer,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  const input = await openMedia(video);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video.');
    // MP4 holds H.264, H.265 and AV1; VP8 and VP9 go into WebM.
    const webm = track.codec === 'vp8' || track.codec === 'vp9';
    const audioCodec: AudioCodec = !webm && (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';
    if (!(await mb.canEncodeAudio(audioCodec))) throw new Error('This browser cannot encode audio. Try Chrome, Edge or Safari.');
    const output = new mb.Output({
      format: webm ? new mb.WebMOutputFormat() : new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({ input, output, audio: { discard: true }, composable: true, showWarnings: false });
    const sound = new mb.AudioBufferSource({ codec: audioCodec, quality: mb.QUALITY_HIGH });
    output.addAudioTrack(sound);
    conversion.onProgress = (p) => onProgress(p * 0.9);
    await output.start();
    await Promise.all([
      conversion.execute(),
      (async () => {
        // Feed the mixed sound in pieces of about one second so the encoder can keep up.
        const piece = audio.sampleRate;
        for (let at = 0; at < audio.length; at += piece) {
          const length = Math.min(piece, audio.length - at);
          const part = new AudioBuffer({ numberOfChannels: audio.numberOfChannels, length, sampleRate: audio.sampleRate });
          for (let c = 0; c < audio.numberOfChannels; c++) part.copyToChannel(audio.getChannelData(c).subarray(at, at + length), c);
          await sound.add(part);
        }
        sound.close();
      })(),
    ]);
    await output.finalize();
    onProgress(1);
    return { blob: new Blob([output.target.buffer!], { type: webm ? 'video/webm' : 'video/mp4' }), extension: webm ? 'webm' : 'mp4' };
  } finally {
    input.dispose();
  }
}

/** Small pictures of a video every `every` seconds, for the timeline. */
export async function thumbnails(file: Blob, duration: number, height = 54): Promise<{ t: number; url: string }[]> {
  const mb = await import('mediabunny');
  const input = await openMedia(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const every = Math.max(1, duration / 30);
    const times = Array.from({ length: Math.max(1, Math.floor(duration / every)) }, (_, i) => i * every);
    const width = Math.max(1, Math.round((height * track.displayWidth) / Math.max(1, track.displayHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const out: { t: number; url: string }[] = [];
    let i = 0;
    for await (const sample of new mb.VideoSampleSink(track).samplesAtTimestamps(times)) {
      if (sample) {
        sample.draw(context, 0, 0, width, height);
        sample.close();
        out.push({ t: times[i], url: canvas.toDataURL('image/jpeg', 0.6) });
      }
      i++;
    }
    return out;
  } finally {
    input.dispose();
  }
}

/** Loudness peaks of a file's sound, one value (0..1) per 1/20 s, for drawing a waveform. */
export async function peaks(file: Blob): Promise<number[]> {
  const context = new OfflineAudioContext(1, 1, 48_000);
  const buffer = await decodeAudio(file, context);
  if (!buffer) return [];
  const step = Math.max(1, Math.round(buffer.sampleRate / 20));
  const data = buffer.getChannelData(0);
  const out: number[] = [];
  for (let i = 0; i < data.length; i += step) {
    let max = 0;
    const end = Math.min(data.length, i + step);
    for (let j = i; j < end; j += 4) max = Math.max(max, Math.abs(data[j]));
    out.push(Math.min(1, max));
  }
  return out;
}

// ---------- compress and convert ----------

export type QualityName = 'low' | 'medium' | 'high' | 'very-high';
/** The quality levels as Mediabunny defines them (0..1). */
const QUALITY_LEVEL: Record<QualityName, number> = { low: 0.25, medium: 0.5, high: 0.75, 'very-high': 1 };
const qualityFactor = (quality: QualityName) => 0.3 * Math.exp(2.5538 * QUALITY_LEVEL[quality]);

/** The video bitrate Mediabunny picks for a size and quality (it does not depend on the frame rate). */
export function videoBitrate(width: number, height: number, quality: QualityName, codec: 'avc' | 'vp9' | 'hevc' | 'av1' | 'vp8'): number {
  const scale = Math.pow((width * height) / (1920 * 1080), 0.95);
  const efficiency = { avc: 1, hevc: 0.6, vp9: 0.6, av1: 0.4, vp8: 1.2 }[codec];
  return 3_000_000 * scale * efficiency * qualityFactor(quality);
}

/** The sound bitrate Mediabunny picks: AAC snaps to 96–192 kbit/s, Opus and MP3 scale with quality. */
export function audioBitrate(codec: 'aac' | 'opus' | 'mp3', quality: QualityName): number {
  const raw = { aac: 128_000, opus: 64_000, mp3: 160_000 }[codec] * qualityFactor(quality);
  const snap = (rates: number[]) => rates.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  if (codec === 'aac') return snap([96_000, 128_000, 160_000, 192_000]);
  if (codec === 'mp3') return snap([64_000, 80_000, 96_000, 112_000, 128_000, 160_000, 192_000, 224_000, 256_000, 320_000]);
  return Math.max(6000, raw);
}

export type VideoContainer = 'mp4' | 'webm' | 'mov' | 'mkv';
export type CompressLevel = 'smaller' | 'balanced' | 'better' | 'target';

export interface CompressOptions {
  container: VideoContainer;
  level: CompressLevel;
  /** For level 'target': the file size wanted, in bytes. */
  targetBytes?: number;
  /** Height of the shorter side, or 0 to keep the size. */
  height: number;
  /** Frames a second, or 0 to keep. */
  fps: number;
  removeSound: boolean;
  start?: number;
  end?: number;
  /** Stops the work (Cancel). */
  signal?: AbortSignal;
}

/** The error thrown when compressing is cancelled. */
export const COMPRESS_CANCELLED = 'Compressing was cancelled.';

/** Sound bitrate used when compressing (bits a second). */
export const COMPRESS_AUDIO_BITRATE = 96_000;

/**
 * The video bitrate (bits a second) that makes a file of `targetBytes` for `seconds` of video,
 * leaving room for the sound and the container. At least 100 kbit/s, so the picture stays visible.
 */
export function targetVideoBitrate(targetBytes: number, seconds: number, withSound: boolean): number {
  if (seconds <= 0) return 1_000_000;
  const total = (targetBytes * 8 * 0.95) / seconds;
  return Math.max(100_000, Math.round(total - (withSound ? COMPRESS_AUDIO_BITRATE : 0)));
}

/** The output size keeping the shape, with the shorter side `height` (never larger than the source), even numbers. */
export function scaledSize(width: number, height: number, shorter: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (!shorter || !width || !height || shorter >= Math.min(width, height)) return { width: even(width), height: even(height) };
  const scale = shorter / Math.min(width, height);
  return { width: even(width * scale), height: even(height * scale) };
}

/** Makes a video smaller or changes its format, on this device. */
export async function compressVideo(file: File, options: CompressOptions, onProgress: (fraction: number) => void): Promise<{ blob: Blob; extension: string }> {
  const mb = await import('mediabunny');
  const input = await openMedia(file);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video picture.');
    const fullDuration = await input.computeDuration();
    const start = Math.max(0, options.start ?? 0);
    if (start >= fullDuration) throw new Error(`Start is after the end of the video (${clock(fullDuration)}).`);
    if (options.end !== undefined && options.end <= start) throw new Error('End must be after Start.');
    const end = Math.min(fullDuration, options.end ?? fullDuration);
    const seconds = Math.max(0.1, end - start);
    // Never ask for more bits than the source has: that only makes the file bigger.
    const sourceBitrate = (file.size * 8) / Math.max(0.1, fullDuration);
    const webmLike = options.container === 'webm';
    const codecs: ('avc' | 'vp9' | 'vp8' | 'av1' | 'hevc')[] = webmLike ? ['vp9', 'vp8', 'av1'] : ['avc', 'hevc', 'vp9'];
    const size = scaledSize(video.displayWidth, video.displayHeight, options.height);
    let codec: (typeof codecs)[number] | null = null;
    for (const c of codecs) {
      // QuickTime players do not play VP9.
      if (options.container === 'mov' && c === 'vp9') continue;
      if (await mb.canEncodeVideo(c, size)) {
        codec = c;
        break;
      }
    }
    if (!codec) throw new Error('This browser cannot encode video. Try Chrome or Edge.');
    const audioCodec = webmLike ? 'opus' : (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';
    const format = {
      mp4: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      mov: () => new mb.MovOutputFormat({ fastStart: 'in-memory' }),
      webm: () => new mb.WebMOutputFormat(),
      mkv: () => new mb.MkvOutputFormat(),
    }[options.container]();
    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    const hasSound = !options.removeSound && !!(await input.getPrimaryAudioTrack());
    const wanted =
      options.level === 'target' && options.targetBytes
        ? targetVideoBitrate(options.targetBytes, seconds, hasSound)
        : videoBitrate(size.width, size.height, ({ smaller: 'low', balanced: 'medium', better: 'high', target: 'medium' } as const)[options.level], codec);
    const bitrate = Math.max(100_000, Math.round(Math.min(wanted, sourceBitrate * 0.85 - (hasSound ? COMPRESS_AUDIO_BITRATE : 0))));
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        codec,
        bitrate,
        width: size.width,
        height: size.height,
        fit: 'contain',
        frameRate: options.fps || undefined,
        forceTranscode: true,
      },
      audio: options.removeSound ? { discard: true } : { codec: audioCodec, bitrate: COMPRESS_AUDIO_BITRATE, forceTranscode: true },
      trim: start > 0 || end < fullDuration ? { start, end } : undefined,
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('This video could not be converted to that format. Try MP4 or WebM.');
    conversion.onProgress = (p) => onProgress(p);
    const cancel = () => void conversion.cancel();
    options.signal?.addEventListener('abort', cancel);
    try {
      await conversion.execute();
    } catch (e) {
      if (options.signal?.aborted) throw new Error(COMPRESS_CANCELLED);
      throw e;
    } finally {
      options.signal?.removeEventListener('abort', cancel);
    }
    onProgress(1);
    const mime = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' }[options.container];
    return { blob: new Blob([output.target.buffer!], { type: mime }), extension: options.container };
  } finally {
    input.dispose();
  }
}
