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
