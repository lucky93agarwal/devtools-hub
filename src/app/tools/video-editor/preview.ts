/**
 * Plays the project in the preview: one hidden <video>/<audio> element per clip,
 * kept in step with the timeline clock, and a canvas that composites the frame.
 */
import { connectAudioFx } from './audio-fx';
import { Clip, MediaItem, Project, clipEnd, sourceTime, transitionGain } from './project';
import { FrameSource, drawFrame } from './render';

type Element = HTMLVideoElement | HTMLAudioElement;

export class Previewer {
  private readonly elements = new Map<string, Element>();
  private readonly images = new Map<string, HTMLImageElement>();
  /** Web Audio, made on the first play (browsers need a click first), for volume above 100% and sound effects. */
  private audio: AudioContext | null = null;
  private readonly chains = new Map<string, { source: MediaElementAudioSourceNode; gain: GainNode; fx: string }>();
  private project: Project | null = null;
  private media = new Map<string, MediaItem>();
  private playing = false;
  private frame = 0;
  private clockStart = 0;
  private timeAtStart = 0;
  private time = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onTime: (time: number) => void,
    private readonly onEnded: () => void,
  ) {}

  setProject(project: Project, media: readonly MediaItem[]): void {
    this.project = project;
    this.media = new Map(media.map((m) => [m.id, m]));
    if (this.canvas.width !== project.width || this.canvas.height !== project.height) {
      this.canvas.width = project.width;
      this.canvas.height = project.height;
    }
    // Drop elements of clips that no longer exist.
    for (const [id, element] of this.elements) {
      if (!project.clips.some((c) => c.id === id)) {
        element.pause();
        element.removeAttribute('src');
        element.load();
        this.elements.delete(id);
        this.chains.get(id)?.source.disconnect();
        this.chains.delete(id);
      }
    }
    if (!this.playing) void this.seek(this.time);
  }

  private elementFor(clip: Clip): Element | null {
    const media = clip.mediaId ? this.media.get(clip.mediaId) : undefined;
    if (!media || media.kind === 'image') return null;
    let element = this.elements.get(clip.id);
    if (!element) {
      // A separated sound plays from an <audio> element even when the file is a video.
      element = document.createElement(media.kind === 'video' && !clip.audioOnly ? 'video' : 'audio');
      element.src = media.url;
      element.preload = 'auto';
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      this.elements.set(clip.id, element);
    }
    return element;
  }

  private imageFor(media: MediaItem): HTMLImageElement {
    let image = this.images.get(media.id);
    if (!image) {
      image = new Image();
      image.src = media.url;
      image.onload = () => !this.playing && this.draw();
      this.images.set(media.id, image);
    }
    return image;
  }

  private source = (clip: Clip): FrameSource => {
    const media = clip.mediaId ? this.media.get(clip.mediaId) : undefined;
    if (!media) return null;
    if (media.kind === 'image') {
      const image = this.imageFor(media);
      return image.complete ? { image, width: image.naturalWidth, height: image.naturalHeight } : null;
    }
    const element = this.elements.get(clip.id);
    if (!(element instanceof HTMLVideoElement) || element.readyState < 2) return null;
    return { image: element, width: element.videoWidth, height: element.videoHeight };
  };

  draw(): void {
    if (!this.project) return;
    drawFrame(this.canvas.getContext('2d')!, this.project, this.time, this.source);
  }

  /** Shows the frame at `time` (seeking every clip there), without playing. */
  async seek(time: number): Promise<void> {
    if (!this.project) return;
    this.time = Math.max(0, time);
    const waits: Promise<void>[] = [];
    for (const clip of this.project.clips) {
      const element = this.elementFor(clip);
      if (!element) continue;
      const inside = this.time >= clip.start && this.time < clipEnd(clip);
      if (!inside) continue;
      const target = sourceTime(clip, this.time);
      if (Math.abs(element.currentTime - target) > 0.01) {
        waits.push(new Promise((resolve) => element.addEventListener('seeked', () => resolve(), { once: true })));
        element.currentTime = target;
      }
    }
    this.draw();
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 800))]);
    this.draw();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(end: number): void {
    if (!this.project || this.playing) return;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } catch {
      this.audio = null;
    }
    this.playing = true;
    this.clockStart = performance.now();
    this.timeAtStart = this.time >= end ? 0 : this.time;
    const tick = () => {
      if (!this.playing || !this.project) return;
      this.time = this.timeAtStart + (performance.now() - this.clockStart) / 1000;
      if (this.time >= end) {
        this.time = end;
        this.pause();
        this.onTime(end);
        this.onEnded();
        return;
      }
      this.sync();
      this.draw();
      this.onTime(this.time);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Starts, stops and corrects every clip's element to match the timeline clock. */
  private sync(): void {
    const project = this.project!;
    const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
    for (const clip of project.clips) {
      const element = this.elementFor(clip);
      if (!element) continue;
      const inside = this.time >= clip.start && this.time < clipEnd(clip);
      if (!inside) {
        if (!element.paused) element.pause();
        continue;
      }
      const target = sourceTime(clip, this.time);
      const silent = muted.has(clip.track) || !!clip.muted || !!clip.reverse;
      const level = clip.volume * transitionGain(clip, this.time);
      const chain = this.chainFor(clip, element);
      if (chain) {
        element.muted = false;
        element.volume = 1;
        chain.gain.gain.value = silent ? 0 : level;
      } else {
        element.muted = silent;
        element.volume = Math.min(1, level);
      }
      if (clip.reverse) {
        // Browsers cannot play backwards, so a reversed clip is shown by seeking frame by frame.
        if (!element.paused) element.pause();
        if (Math.abs(element.currentTime - target) > 0.04) element.currentTime = target;
        continue;
      }
      element.playbackRate = clip.speed ?? 1;
      if (element.paused) {
        element.currentTime = target;
        void element.play().catch(() => undefined);
      } else if (Math.abs(element.currentTime - target) > 0.25 * (clip.speed ?? 1)) {
        element.currentTime = target;
      }
    }
  }

  /** Routes a clip's element through Web Audio, rebuilding the chain when its effects change. */
  private chainFor(clip: Clip, element: Element): { gain: GainNode } | null {
    if (!this.audio) return null;
    const key = JSON.stringify(clip.audio ?? null);
    let chain = this.chains.get(clip.id);
    if (!chain) {
      const source = this.audio.createMediaElementSource(element);
      const gain = this.audio.createGain();
      chain = { source, gain, fx: '' };
      this.chains.set(clip.id, chain);
    }
    if (chain.fx !== key || chain.fx === '') {
      chain.source.disconnect();
      chain.gain.disconnect();
      connectAudioFx(this.audio, chain.source, clip.audio).connect(chain.gain);
      chain.gain.connect(this.audio.destination);
      chain.fx = key;
    }
    return chain;
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.frame);
    for (const element of this.elements.values()) element.pause();
  }

  get currentTime(): number {
    return this.time;
  }

  dispose(): void {
    this.pause();
    for (const element of this.elements.values()) {
      element.removeAttribute('src');
      element.load();
    }
    this.elements.clear();
    this.images.clear();
    this.chains.clear();
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }
}
