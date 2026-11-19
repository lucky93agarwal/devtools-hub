/**
 * Plays the project in the preview: one hidden <video>/<audio> element per clip,
 * kept in step with the timeline clock, and a canvas that composites the frame.
 */
import { Clip, MediaItem, Project, clipEnd } from './project';
import { FrameSource, drawFrame } from './render';

type Element = HTMLVideoElement | HTMLAudioElement;

export class Previewer {
  private readonly elements = new Map<string, Element>();
  private readonly images = new Map<string, HTMLImageElement>();
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
      }
    }
    if (!this.playing) void this.seek(this.time);
  }

  private elementFor(clip: Clip): Element | null {
    const media = clip.mediaId ? this.media.get(clip.mediaId) : undefined;
    if (!media || media.kind === 'image') return null;
    let element = this.elements.get(clip.id);
    if (!element) {
      element = document.createElement(media.kind === 'video' ? 'video' : 'audio');
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
      const target = clip.in + (this.time - clip.start);
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
      const target = clip.in + (this.time - clip.start);
      element.muted = muted.has(clip.track);
      element.volume = Math.min(1, clip.volume);
      if (element.paused) {
        element.currentTime = target;
        void element.play().catch(() => undefined);
      } else if (Math.abs(element.currentTime - target) > 0.25) {
        element.currentTime = target;
      }
    }
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
  }
}
