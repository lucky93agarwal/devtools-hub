import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { MAX_VIDEO_BYTES, describe } from '../video/media';
import { exportProject } from './export';
import {
  Clip,
  MediaItem,
  Project,
  TitleStyle,
  addMediaClip,
  addTitleClip,
  clipEnd,
  clipLength,
  makeId,
  newProject,
  projectDuration,
  removeClip,
  rulerStep,
  snap,
  splitAll,
  splitClip,
  timecode,
  trimClip,
  updateClip,
} from './project';
import { Previewer } from './preview';

const CONTENT: ToolContent = {
  aboutHeading: 'About this online video editor',
  about:
    'A free video editor that runs entirely in your browser, laid out like a classic desktop editor: project files on ' +
    'the left, a preview on the right and a multi-track timeline below. Import videos, music and images, drag them ' +
    'onto the tracks, trim their ends, split them at the playhead, layer them on top of each other and add titles. ' +
    'Higher tracks cover lower ones, and the sound of every clip is mixed. When you are done, export an MP4. Your ' +
    'files are never uploaded, so it works for private and large videos too.',
  steps: [
    'Click Import files (or drop files on Project Files) to add videos, audio and images.',
    'Drag files onto a track, or double-click them to add them at the playhead.',
    'Drag clips to move them, drag their edges to trim, and press S or the scissors to split at the playhead.',
    'Add titles from the Titles tab and edit them in Properties.',
    'Press Export video and download the MP4.',
  ],
  faq: [
    {
      question: 'Which keyboard shortcuts work?',
      answer:
        'Space plays and pauses, S splits at the playhead, Delete removes the selected clip, Ctrl or Cmd + Z undoes ' +
        'and Ctrl or Cmd + Shift + Z redoes, and the left and right arrows step one frame.',
    },
    {
      question: 'How long can my video be?',
      answer:
        'There is no fixed limit, but everything runs on your device, so exporting takes roughly as long as the video ' +
        'plays on a laptop, and longer on phones. Keep projects under about 10 minutes for the smoothest experience.',
    },
    {
      question: 'Does the project save itself?',
      answer: 'Not yet. Keep the tab open while you edit; closing it clears the project. Your files stay on your device either way.',
    },
    { question: 'Are my videos uploaded?', answer: 'No. Importing, editing and exporting all happen in your browser.' },
  ],
};

const TITLE_PRESETS: { name: string; style: TitleStyle }[] = [
  { name: 'Centre title', style: { text: 'Your title', size: 10, colour: '#ffffff', x: 0.5, y: 0.5, background: false } },
  { name: 'Lower third', style: { text: 'Name Surname\nRole or place', size: 5, colour: '#ffffff', x: 0.3, y: 0.82, background: true } },
  { name: 'Subtitle', style: { text: 'Subtitle text', size: 5, colour: '#ffffff', x: 0.5, y: 0.9, background: true } },
  { name: 'Big yellow', style: { text: 'WOW!', size: 18, colour: '#facc15', x: 0.5, y: 0.45, background: false } },
];

const PROFILES = [
  { label: 'HD 720p (1280×720)', width: 1280, height: 720 },
  { label: 'Full HD 1080p (1920×1080)', width: 1920, height: 1080 },
  { label: 'Vertical 1080×1920 (Reels, Shorts)', width: 1080, height: 1920 },
  { label: 'Square 1080×1080', width: 1080, height: 1080 },
];

const ROW = 52;
const HEADER = 116;

type Drag =
  | { kind: 'move'; id: string; grabOffset: number; pointer: number }
  | { kind: 'trim'; id: string; edge: 'start' | 'end'; pointer: number }
  | { kind: 'scrub'; pointer: number };

@Component({
  selector: 'app-video-editor',
  imports: [ToolPage],
  host: { '(document:keydown)': 'key($event)' },
  styles: `
    .editor { background: #1b1d23; color: #d7dae0; }
    .panel { background: #23262e; border: 1px solid #343842; }
    .tool { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; font-size: 0.8rem; color: #d7dae0; }
    .tool:hover:not(:disabled) { background: #343842; }
    .tool:disabled { opacity: 0.4; }
    .tab { padding: 0.4rem 0.8rem; font-size: 0.8rem; border-bottom: 2px solid transparent; color: #9aa0ab; }
    .tab[aria-selected='true'] { color: #fff; border-color: #6d83f2; }
    .input { background: #15171c; border: 1px solid #3a3f4a; border-radius: 0.3rem; padding: 0.2rem 0.4rem; color: #e5e7eb; }
  `,
  template: `
    <app-tool-page path="video-editor" [content]="content" [wide]="true" privacy="Your videos are edited on your device and never uploaded.">
      <div class="editor overflow-hidden rounded-xl select-none" (dragover)="$event.preventDefault()">
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-1 border-b border-[#343842] px-2 py-1.5" role="toolbar" aria-label="Editor">
          <button type="button" class="tool" (click)="newProjectClick()">＋ New project</button>
          <button type="button" class="tool" (click)="fileInput.click()">📂 Import files</button>
          <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" multiple accept="video/*,audio/*,image/*,.mkv,.mov" (change)="importFiles(fileInput)" />
          <span class="mx-1 h-5 w-px bg-[#343842]"></span>
          <button type="button" class="tool" [disabled]="!history().length" aria-label="Undo" (click)="undo()">↶ Undo</button>
          <button type="button" class="tool" [disabled]="!future().length" aria-label="Redo" (click)="redo()">↷ Redo</button>
          <span class="mx-1 h-5 w-px bg-[#343842]"></span>
          <label class="tool">Profile
            <select class="input" aria-label="Profile" [disabled]="exporting()" (change)="setProfile(+$any($event.target).value)">
              @for (p of profiles; track p.label; let i = $index) { <option [value]="i" [selected]="p.width === project().width && p.height === project().height">{{ p.label }}</option> }
            </select>
          </label>
          <span class="flex-1"></span>
          <button type="button" class="tool !bg-[#6d83f2] !text-white" [disabled]="exporting() || !project().clips.length" (click)="exportVideo()">⬇ Export video</button>
        </div>

        <div class="grid gap-1 p-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <!-- Left: project files / titles / properties -->
          <div class="panel flex min-h-72 flex-col rounded">
            <div class="flex border-b border-[#343842]" role="tablist" aria-label="Panels">
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'files'" (click)="tab.set('files')">Project Files</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'titles'" (click)="tab.set('titles')">Titles</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'properties'" (click)="tab.set('properties')">Properties</button>
            </div>
            <div class="flex-1 overflow-auto p-2" (drop)="dropFiles($event)">
              @switch (tab()) {
                @case ('files') {
                  @if (!media().length) {
                    <button type="button" class="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-[#3a3f4a] text-sm text-[#9aa0ab]" (click)="fileInput.click()">
                      <span class="text-3xl">🎬</span>
                      Drop videos, audio and images here, or click to import
                    </button>
                  } @else {
                    <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Project files">
                      @for (m of media(); track m.id) {
                        <li draggable="true" class="cursor-grab rounded border border-[#343842] bg-[#1b1d23] p-1 text-xs hover:border-[#6d83f2]" [attr.aria-label]="m.name" (dragstart)="dragMedia($event, m)" (dblclick)="addAtPlayhead(m)" [title]="'Double-click to add at the playhead'">
                          <div class="grid aspect-video place-items-center overflow-hidden rounded bg-black">
                            @if (m.kind === 'video') { <video [src]="m.url + '#t=0.5'" muted preload="metadata" class="h-full w-full object-contain"></video> }
                            @else if (m.kind === 'image') { <img [src]="m.url" alt="" class="h-full w-full object-contain" /> }
                            @else { <span class="text-2xl">🎵</span> }
                          </div>
                          <p class="mt-1 truncate">{{ m.name }}</p>
                          <p class="text-[#9aa0ab]">{{ m.kind === 'image' ? 'Image' : timecodeShort(m.duration) }}</p>
                        </li>
                      }
                    </ul>
                  }
                  @if (importing()) { <p class="mt-2 text-xs text-[#9aa0ab]" role="status">Importing…</p> }
                  @if (error()) { <p class="mt-2 text-xs text-red-400" role="alert">{{ error() }}</p> }
                }
                @case ('titles') {
                  <ul class="grid grid-cols-2 gap-2" aria-label="Title templates">
                    @for (t of titles; track t.name) {
                      <li>
                        <button type="button" class="w-full rounded border border-[#343842] bg-[#1b1d23] p-2 text-left text-xs hover:border-[#6d83f2]" (click)="addTitle(t.style)">
                          <div class="grid aspect-video place-items-center rounded bg-black font-bold" [style.color]="t.style.colour">{{ t.style.text.split('\\n')[0] }}</div>
                          <p class="mt-1">{{ t.name }}</p>
                        </button>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[#9aa0ab]">Click a template to add it at the playhead, then edit it in Properties.</p>
                }
                @case ('properties') {
                  @if (selected(); as clip) {
                    <div class="flex flex-col gap-2 text-xs">
                      <p class="font-semibold text-white">{{ clipName(clip) }}</p>
                      <label class="flex items-center justify-between gap-2">Start (s)
                        <input type="number" min="0" step="0.1" class="input w-24" aria-label="Clip start" [value]="round(clip.start)" (change)="setStart(clip, $any($event.target).valueAsNumber)" />
                      </label>
                      <label class="flex items-center justify-between gap-2">Length (s)
                        <input type="number" min="0.1" step="0.1" class="input w-24" aria-label="Clip length" [value]="round(length(clip))" (change)="setLength(clip, $any($event.target).valueAsNumber)" />
                      </label>
                      @if (hasSound(clip)) {
                        <label class="flex items-center justify-between gap-2">Volume {{ Math.round(clip.volume * 100) }}%
                          <input type="range" min="0" max="2" step="0.05" class="w-32" aria-label="Clip volume" [value]="clip.volume" (change)="change(clip.id, { volume: $any($event.target).valueAsNumber })" />
                        </label>
                      }
                      @if (clip.title; as t) {
                        <label class="flex flex-col gap-1">Text
                          <textarea class="input h-16" aria-label="Title text" [value]="t.text" (input)="setTitle(clip, { text: $any($event.target).value }, false)" (change)="setTitle(clip, {}, true)"></textarea>
                        </label>
                        <label class="flex items-center justify-between gap-2">Size
                          <input type="range" min="2" max="30" class="w-32" aria-label="Title size" [value]="t.size" (change)="setTitle(clip, { size: $any($event.target).valueAsNumber }, true)" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Colour
                          <input type="color" class="h-6 w-10" aria-label="Title colour" [value]="t.colour" (change)="setTitle(clip, { colour: $any($event.target).value }, true)" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Across
                          <input type="range" min="0" max="1" step="0.01" class="w-32" aria-label="Title position across" [value]="t.x" (change)="setTitle(clip, { x: $any($event.target).valueAsNumber }, true)" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Down
                          <input type="range" min="0" max="1" step="0.01" class="w-32" aria-label="Title position down" [value]="t.y" (change)="setTitle(clip, { y: $any($event.target).valueAsNumber }, true)" />
                        </label>
                        <label class="flex items-center gap-2"><input type="checkbox" [checked]="t.background" (change)="setTitle(clip, { background: $any($event.target).checked }, true)" /> Dark box behind text</label>
                      }
                      <button type="button" class="tool self-start !bg-[#4a2a2a]" (click)="deleteSelected()">🗑 Remove clip</button>
                    </div>
                  } @else {
                    <p class="text-xs text-[#9aa0ab]">Select a clip on the timeline to see its properties.</p>
                  }
                }
              }
            </div>
          </div>

          <!-- Right: preview -->
          <div class="panel flex flex-col rounded">
            <div class="grid flex-1 place-items-center bg-black p-1">
              <canvas #preview class="max-h-[46vh] max-w-full" role="img" aria-label="Video preview"></canvas>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-1 border-t border-[#343842] px-2 py-1.5">
              <button type="button" class="tool" aria-label="Jump to start" (click)="seek(0)">⏮</button>
              <button type="button" class="tool" aria-label="Back one second" (click)="seek(time() - 1)">⏪</button>
              <button type="button" class="tool text-base" [attr.aria-label]="playing() ? 'Pause' : 'Play'" (click)="togglePlay()">{{ playing() ? '⏸' : '▶' }}</button>
              <button type="button" class="tool" aria-label="Forward one second" (click)="seek(time() + 1)">⏩</button>
              <button type="button" class="tool" aria-label="Jump to end" (click)="seek(duration())">⏭</button>
              <span class="ml-2 font-mono text-xs" aria-label="Current time">{{ timecode(time(), project().fps) }}</span>
              <span class="font-mono text-xs text-[#9aa0ab]">/ {{ timecode(duration(), project().fps) }}</span>
            </div>
          </div>
        </div>

        @if (exporting() || exported()) {
          <div class="panel mx-1 mb-1 flex flex-wrap items-center gap-3 rounded px-3 py-2 text-sm" role="status">
            @if (exporting()) {
              <span>{{ exportStage() }}</span>
              <div class="h-2 w-48 overflow-hidden rounded bg-[#15171c]" role="progressbar" aria-label="Export progress" [attr.aria-valuenow]="exportPercent()" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-[#6d83f2]" [style.width.%]="exportPercent()"></div>
              </div>
            } @else if (exported(); as e) {
              <span>Video ready: {{ e.name }} ({{ formatBytes(e.blob.size) }})</span>
              <button type="button" class="tool !bg-[#6d83f2] !text-white" (click)="downloadExport()">Download {{ e.name }}</button>
              <button type="button" class="tool" (click)="exported.set(null)">Close</button>
            }
          </div>
        }

        <!-- Timeline -->
        <div class="panel m-1 mt-0 rounded">
          <div class="flex flex-wrap items-center gap-1 border-b border-[#343842] px-2 py-1" role="toolbar" aria-label="Timeline">
            <span class="mr-2 text-xs font-semibold">Timeline</span>
            <button type="button" class="tool" aria-label="Add track" (click)="addTrack()">＋ Track</button>
            <button type="button" class="tool" [class.!bg-[#343842]]="snapping()" [attr.aria-pressed]="snapping()" aria-label="Snapping" (click)="snapping.set(!snapping())">🧲 Snap</button>
            <button type="button" class="tool" aria-label="Split at playhead" (click)="splitAtPlayhead()">✂ Split</button>
            <button type="button" class="tool" [disabled]="!selectedId()" aria-label="Delete clip" (click)="deleteSelected()">🗑 Delete</button>
            <span class="flex-1"></span>
            <label class="tool">Zoom
              <input type="range" min="10" max="300" class="w-28" aria-label="Timeline zoom" [value]="pps()" (input)="pps.set($any($event.target).valueAsNumber)" />
            </label>
          </div>
          <div #scroller class="relative max-h-80 overflow-auto" aria-label="Timeline tracks">
            <div class="relative" [style.width.px]="HEADER + timelineWidth()">
              <!-- Ruler -->
              <div class="sticky top-0 z-20 flex h-6 bg-[#1b1d23]">
                <div class="sticky left-0 z-10 shrink-0 border-r border-[#343842] bg-[#1b1d23]" [style.width.px]="HEADER"></div>
                <div class="relative flex-1 cursor-pointer" (pointerdown)="scrubStart($event)">
                  @for (tick of ticks(); track tick) {
                    <span class="absolute top-0 h-full border-l border-[#4a4f5a] pl-1 font-mono text-[10px] text-[#9aa0ab]" [style.left.px]="tick * pps()">{{ timecodeShort(tick) }}</span>
                  }
                </div>
              </div>
              <!-- Tracks, highest on top as in desktop editors -->
              @for (track of tracksTopDown(); track track.id) {
                <div class="flex border-b border-[#2c3038]" [style.height.px]="ROW">
                  <div class="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-r border-[#343842] bg-[#23262e] px-2 text-xs" [style.width.px]="HEADER">
                    <span class="font-semibold">{{ track.name }}</span>
                    <span class="flex gap-1">
                      <button type="button" class="rounded px-1" [class.opacity-40]="track.hidden" [attr.aria-label]="(track.hidden ? 'Show ' : 'Hide ') + track.name" (click)="toggleTrack(track.id, 'hidden')">👁</button>
                      <button type="button" class="rounded px-1" [class.opacity-40]="track.muted" [attr.aria-label]="(track.muted ? 'Unmute ' : 'Mute ') + track.name" (click)="toggleTrack(track.id, 'muted')">🔊</button>
                    </span>
                  </div>
                  <div class="relative flex-1 bg-[#1f2228]" [attr.data-track]="track.id" (pointerdown)="emptyDown($event)" (drop)="dropOnTrack($event, track.id)" (dragover)="$event.preventDefault()">
                    @for (clip of clipsOn(track.id); track clip.id) {
                      <div
                        class="absolute top-1 bottom-1 overflow-hidden rounded border text-[11px] leading-tight"
                        [class]="clipClass(clip)"
                        [class.ring-2]="clip.id === selectedId()"
                        [style.left.px]="clip.start * pps()"
                        [style.width.px]="Math.max(4, length(clip) * pps())"
                        role="button"
                        [attr.aria-label]="'Clip ' + clipName(clip)"
                        (pointerdown)="clipDown($event, clip)"
                      >
                        <span class="pointer-events-none block truncate px-2 pt-1 font-semibold">{{ clipName(clip) }}</span>
                        <span class="pointer-events-none block truncate px-2 opacity-70">{{ timecodeShort(length(clip)) }}</span>
                        <span class="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/20" [attr.aria-label]="'Trim start of ' + clipName(clip)" (pointerdown)="trimDown($event, clip, 'start')"></span>
                        <span class="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/20" [attr.aria-label]="'Trim end of ' + clipName(clip)" (pointerdown)="trimDown($event, clip, 'end')"></span>
                      </div>
                    }
                  </div>
                </div>
              }
              <!-- Playhead -->
              <div class="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500" [style.left.px]="HEADER + time() * pps()">
                <span class="absolute -top-0 -left-1.5 h-3 w-3 rotate-45 bg-red-500"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </app-tool-page>
  `,
})
export class VideoEditor {
  protected readonly content = CONTENT;
  protected readonly titles = TITLE_PRESETS;
  protected readonly profiles = PROFILES;
  protected readonly ROW = ROW;
  protected readonly HEADER = HEADER;
  protected readonly Math = Math;
  protected readonly timecode = timecode;
  protected readonly formatBytes = formatBytes;
  protected readonly length = clipLength;

  protected readonly project = signal<Project>(newProject());
  protected readonly media = signal<MediaItem[]>([]);
  protected readonly history = signal<Project[]>([]);
  protected readonly future = signal<Project[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly tab = signal<'files' | 'titles' | 'properties'>('files');
  protected readonly time = signal(0);
  protected readonly playing = signal(false);
  protected readonly pps = signal(60);
  protected readonly snapping = signal(true);
  protected readonly importing = signal(false);
  protected readonly error = signal('');
  protected readonly exporting = signal(false);
  protected readonly exportStage = signal('');
  protected readonly exportPercent = signal(0);
  protected readonly exported = signal<{ blob: Blob; name: string } | null>(null);

  protected readonly duration = computed(() => projectDuration(this.project()));
  protected readonly selected = computed(() => this.project().clips.find((c) => c.id === this.selectedId()) ?? null);
  protected readonly tracksTopDown = computed(() => [...this.project().tracks].sort((a, b) => b.id - a.id));
  protected readonly timelineWidth = computed(() => Math.max(1200, (this.duration() + 30) * this.pps()));
  protected readonly ticks = computed(() => {
    const step = rulerStep(this.pps());
    const end = this.timelineWidth() / this.pps();
    return Array.from({ length: Math.ceil(end / step) }, (_, i) => i * step);
  });

  private readonly previewCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('preview');
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private previewer: Previewer | null = null;
  private drag: Drag | null = null;
  private dragStartProject: Project | null = null;
  private readonly mediaById = computed(() => new Map(this.media().map((m) => [m.id, m])));

  constructor() {
    afterNextRender(() => {
      this.previewer = new Previewer(
        this.previewCanvas().nativeElement,
        (t) => this.time.set(t),
        () => this.playing.set(false),
      );
      this.previewer.setProject(this.project(), this.media());
      addEventListener('pointermove', this.onMove);
      addEventListener('pointerup', this.onUp);
    });
    effect(() => {
      const project = this.project();
      const media = this.media();
      untracked(() => this.previewer?.setProject(project, media));
    });
    inject(DestroyRef).onDestroy(() => {
      if (typeof window === 'undefined') return;
      removeEventListener('pointermove', this.onMove);
      removeEventListener('pointerup', this.onUp);
      this.previewer?.dispose();
      for (const m of this.media()) URL.revokeObjectURL(m.url);
    });
  }

  // ---------- helpers for the template ----------
  protected round(n: number): number {
    return Math.round(n * 100) / 100;
  }

  protected timecodeShort(seconds: number): string {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(rest % 1 ? 1 : 0)}`;
  }

  protected clipsOn(track: number): Clip[] {
    return this.project().clips.filter((c) => c.track === track);
  }

  protected clipName(clip: Clip): string {
    if (clip.title) return `Title: ${clip.title.text.split('\n')[0]}`;
    return this.mediaById().get(clip.mediaId!)?.name ?? 'Clip';
  }

  protected clipClass(clip: Clip): string {
    if (clip.title) return 'border-amber-300/60 bg-amber-600/70 text-white ring-amber-200';
    const kind = this.mediaById().get(clip.mediaId!)?.kind;
    if (kind === 'audio') return 'border-emerald-300/60 bg-emerald-700/70 text-white ring-emerald-200';
    if (kind === 'image') return 'border-fuchsia-300/60 bg-fuchsia-700/70 text-white ring-fuchsia-200';
    return 'border-sky-300/60 bg-sky-700/70 text-white ring-sky-200';
  }

  protected hasSound(clip: Clip): boolean {
    return !!this.mediaById().get(clip.mediaId ?? '')?.hasAudio;
  }

  private sourceLength(clip: Clip): number | null {
    const media = clip.mediaId ? this.mediaById().get(clip.mediaId) : undefined;
    return media && media.kind !== 'image' ? media.duration : null;
  }

  // ---------- history ----------
  private commit(next: Project, before = this.project()): void {
    if (next === before) return;
    this.history.update((h) => [...h.slice(-99), before]);
    this.future.set([]);
    this.project.set(next);
  }

  protected undo(): void {
    const previous = this.history().at(-1);
    if (!previous) return;
    this.future.update((f) => [this.project(), ...f]);
    this.history.update((h) => h.slice(0, -1));
    this.project.set(previous);
  }

  protected redo(): void {
    const next = this.future()[0];
    if (!next) return;
    this.history.update((h) => [...h, this.project()]);
    this.future.update((f) => f.slice(1));
    this.project.set(next);
  }

  protected change(id: string, change: Partial<Clip>): void {
    this.commit(updateClip(this.project(), id, change));
  }

  // ---------- files ----------
  protected importFiles(element: HTMLInputElement): void {
    void this.import(Array.from(element.files ?? []));
    element.value = '';
  }

  protected dropFiles(event: DragEvent): void {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void this.import(Array.from(event.dataTransfer.files));
  }

  private async import(files: File[]): Promise<void> {
    this.importing.set(true);
    this.error.set('');
    const added: MediaItem[] = [];
    for (const file of files) {
      try {
        if (file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name} is over ${formatBytes(MAX_VIDEO_BYTES)}.`);
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('image/')) {
          const bitmap = await createImageBitmap(file);
          added.push({ id: makeId('media'), name: file.name, kind: 'image', duration: 0, width: bitmap.width, height: bitmap.height, hasAudio: false, url, file });
          bitmap.close();
        } else {
          const info = await describe(file);
          added.push({
            id: makeId('media'),
            name: file.name,
            kind: info.hasVideo ? 'video' : 'audio',
            duration: info.duration,
            width: info.width,
            height: info.height,
            hasAudio: !!info.audioCodec,
            url,
            file,
          });
        }
      } catch (e) {
        this.error.set(e instanceof Error && e.message ? e.message : `${file.name} could not be read.`);
      }
    }
    this.media.update((list) => [...list, ...added]);
    // The first video sets the project's shape, as desktop editors suggest.
    const firstVideo = added.find((m) => m.kind === 'video');
    if (firstVideo && !this.project().clips.length && firstVideo.height > firstVideo.width) this.setProfile(2);
    this.importing.set(false);
    this.tab.set('files');
  }

  protected dragMedia(event: DragEvent, media: MediaItem): void {
    event.dataTransfer?.setData('application/x-media-id', media.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  protected dropOnTrack(event: DragEvent, track: number): void {
    const id = event.dataTransfer?.getData('application/x-media-id');
    if (!id) return;
    event.preventDefault();
    const media = this.mediaById().get(id);
    if (!media) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const time = Math.max(0, (event.clientX - box.left) / this.pps());
    this.place(media, track, this.snapping() ? snap(this.project(), time, 10 / this.pps(), '', [this.time()]) : time);
  }

  /** Double-click: audio goes on the lowest track, pictures on the lowest track that is free at the playhead. */
  protected addAtPlayhead(media: MediaItem): void {
    const track = media.kind === 'audio' ? 1 : this.freeTrackAt(this.time(), media.kind === 'image' ? 5 : media.duration);
    this.place(media, track, this.time());
  }

  private freeTrackAt(time: number, length: number): number {
    const tracks = [...this.project().tracks].sort((a, b) => a.id - b.id);
    for (const track of tracks) {
      const busy = this.project().clips.some((c) => c.track === track.id && time < clipEnd(c) && time + length > c.start);
      if (!busy) return track.id;
    }
    return tracks[0].id;
  }

  private place(media: MediaItem, track: number, time: number): void {
    const { project, clip } = addMediaClip(this.project(), media, track, time);
    this.commit(project);
    this.selectedId.set(clip.id);
  }

  protected addTitle(style: TitleStyle): void {
    const top = Math.max(...this.project().tracks.map((t) => t.id));
    const { project, clip } = addTitleClip(this.project(), { ...style }, top, this.time());
    this.commit(project);
    this.selectedId.set(clip.id);
    this.tab.set('properties');
  }

  protected setTitle(clip: Clip, change: Partial<TitleStyle>, save: boolean): void {
    const current = this.project().clips.find((c) => c.id === clip.id);
    if (!current?.title) return;
    const next = updateClip(this.project(), clip.id, { title: { ...current.title, ...change } });
    // Typing updates the preview straight away; the undo step is saved when the field is left.
    if (save) this.commit(next, this.titleEditStart ?? this.project());
    else {
      this.titleEditStart ??= this.project();
      this.project.set(next);
    }
    if (save) this.titleEditStart = null;
  }
  private titleEditStart: Project | null = null;

  protected setStart(clip: Clip, value: number): void {
    if (Number.isFinite(value)) this.change(clip.id, { start: Math.max(0, value) });
  }

  protected setLength(clip: Clip, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.commit(trimClip(this.project(), clip.id, 'end', clip.start + value, this.sourceLength(clip)));
  }

  // ---------- project ----------
  protected newProjectClick(): void {
    if (this.project().clips.length && !confirm('Start a new project? The timeline will be cleared.')) return;
    this.commit({ ...newProject(), width: this.project().width, height: this.project().height });
    this.selectedId.set(null);
    void this.seek(0);
  }

  protected setProfile(index: number): void {
    const profile = PROFILES[index];
    this.commit({ ...this.project(), width: profile.width, height: profile.height });
  }

  protected addTrack(): void {
    const id = Math.max(...this.project().tracks.map((t) => t.id)) + 1;
    this.commit({ ...this.project(), tracks: [...this.project().tracks, { id, name: `Track ${id}`, muted: false, hidden: false }] });
  }

  protected toggleTrack(id: number, field: 'muted' | 'hidden'): void {
    this.commit({ ...this.project(), tracks: this.project().tracks.map((t) => (t.id === id ? { ...t, [field]: !t[field] } : t)) });
  }

  // ---------- playback ----------
  protected togglePlay(): void {
    if (!this.previewer) return;
    if (this.previewer.isPlaying) {
      this.previewer.pause();
      this.playing.set(false);
    } else if (this.duration() > 0) {
      this.previewer.play(this.duration());
      this.playing.set(true);
    }
  }

  protected async seek(time: number): Promise<void> {
    const t = Math.max(0, Math.min(time, Math.max(this.duration(), 0)));
    if (this.previewer?.isPlaying) {
      this.previewer.pause();
      this.playing.set(false);
    }
    this.time.set(t);
    await this.previewer?.seek(t);
  }

  protected splitAtPlayhead(): void {
    const id = this.selectedId();
    const next = id ? splitClip(this.project(), id, this.time()) : splitAll(this.project(), this.time());
    this.commit(next === this.project() && id ? splitAll(this.project(), this.time()) : next);
  }

  protected deleteSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.commit(removeClip(this.project(), id));
    this.selectedId.set(null);
  }

  protected key(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === ' ') {
      event.preventDefault();
      this.togglePlay();
    } else if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    } else if (!mod && event.key.toLowerCase() === 's') {
      this.splitAtPlayhead();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedId()) {
        event.preventDefault();
        this.deleteSelected();
      }
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      void this.seek(this.time() + (event.key === 'ArrowRight' ? 1 : -1) / this.project().fps);
    }
  }

  // ---------- timeline pointer work ----------
  private timeAt(clientX: number): number {
    const box = this.scroller().nativeElement.getBoundingClientRect();
    return Math.max(0, (clientX - box.left - HEADER + this.scroller().nativeElement.scrollLeft) / this.pps());
  }

  private trackAt(clientY: number): number | null {
    const rows = this.scroller().nativeElement.querySelectorAll<HTMLElement>('[data-track]');
    for (const row of Array.from(rows)) {
      const box = row.getBoundingClientRect();
      if (clientY >= box.top && clientY < box.bottom) return Number(row.dataset['track']);
    }
    return null;
  }

  protected scrubStart(event: PointerEvent): void {
    event.preventDefault();
    this.drag = { kind: 'scrub', pointer: event.pointerId };
    void this.seek(this.timeAt(event.clientX));
  }

  protected emptyDown(event: PointerEvent): void {
    if (event.target !== event.currentTarget) return;
    this.selectedId.set(null);
    this.scrubStart(event);
  }

  protected clipDown(event: PointerEvent, clip: Clip): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedId.set(clip.id);
    this.dragStartProject = this.project();
    this.drag = { kind: 'move', id: clip.id, grabOffset: this.timeAt(event.clientX) - clip.start, pointer: event.pointerId };
  }

  protected trimDown(event: PointerEvent, clip: Clip, edge: 'start' | 'end'): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedId.set(clip.id);
    this.dragStartProject = this.project();
    this.drag = { kind: 'trim', id: clip.id, edge, pointer: event.pointerId };
  }

  private readonly onMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const time = this.timeAt(event.clientX);
    const tolerance = 10 / this.pps();
    if (drag.kind === 'scrub') {
      void this.seek(time);
      return;
    }
    const base = this.dragStartProject!;
    const clip = base.clips.find((c) => c.id === drag.id);
    if (!clip) return;
    if (drag.kind === 'move') {
      let start = Math.max(0, time - drag.grabOffset);
      if (this.snapping()) {
        const snappedStart = snap(base, start, tolerance, clip.id, [this.time()]);
        const snappedEnd = snap(base, start + clipLength(clip), tolerance, clip.id, [this.time()]) - clipLength(clip);
        start = snappedStart !== start ? snappedStart : snappedEnd !== start ? snappedEnd : start;
      }
      const track = this.trackAt(event.clientY) ?? clip.track;
      this.project.set(updateClip(base, clip.id, { start: Math.max(0, start), track }));
    } else {
      const edgeTime = this.snapping() ? snap(base, time, tolerance, clip.id, [this.time()]) : time;
      this.project.set(trimClip(base, clip.id, drag.edge, edgeTime, this.sourceLength(clip)));
    }
  };

  private readonly onUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    this.drag = null;
    if (drag.kind !== 'scrub' && this.dragStartProject) {
      const after = this.project();
      if (after !== this.dragStartProject) this.commit(after, this.dragStartProject);
      this.dragStartProject = null;
      void this.previewer?.seek(this.time());
    }
  };

  // ---------- export ----------
  protected async exportVideo(): Promise<void> {
    if (this.exporting()) return;
    this.previewer?.pause();
    this.playing.set(false);
    this.exporting.set(true);
    this.exported.set(null);
    this.error.set('');
    try {
      const { blob, extension } = await exportProject(this.project(), this.media(), (fraction, stage) => {
        this.exportPercent.set(Math.round(fraction * 100));
        this.exportStage.set(stage);
      });
      const first = this.media()[0];
      this.exported.set({ blob, name: `${first ? baseName(first.name) : 'video'}-edit.${extension}` });
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'The video could not be exported.');
      this.tab.set('files');
    } finally {
      this.exporting.set(false);
    }
  }

  protected downloadExport(): void {
    const e = this.exported();
    if (e) downloadBlob(e.blob, e.name);
  }
}
