import { Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { MAX_VIDEO_BYTES, describe, openMedia, peaks, thumbnails } from '../video/media';
import { ago, clearProject, loadProject, saveProject } from './autosave';
import {
  EXPORT_FORMATS,
  EXPORT_FPS,
  EXPORT_RESOLUTIONS,
  ExportFormat,
  ExportQuality,
  ExportResolution,
  CANCELLED,
  estimateSize,
  exportFrame,
  exportProject,
  formatBytes as sizeText,
  outputSize,
} from './export';
import { addCues, captionsLocked, parseSrt, projectCues, toSrt } from './captions';
import { toEdl, toFcpXml } from './interchange';
import { openProjectFile, saveProjectFile } from './project-file';
import {
  KEY_EASES,
  KeyEase,
  RAMP_SHAPES,
  RampShape,
  SCALE_MODES,
  ScaleMode,
  Background,
  easeKeyframes,
  keyframeEase,
  renameTrack,
  timelineTime,
  speedChange,
  fitAudio,
  rippleDelete,
  slideshow,
  TITLE_ANIMATIONS,
  TITLE_FONTS,
  TitleFont,
  AudioFx,
  KeyProp,
  NO_AUDIO_FX,
  NO_TRANSFORM,
  Transform,
  addMarker,
  moveClips,
  pasteClips,
  removeKeyframe,
  removeMarker,
  separateAudio,
  setKeyframe,
  sourceTime,
  transformAt,
  EFFECT_PRESETS,
  Effects,
  NO_EFFECTS,
  TRANSITIONS,
  Transition,
  TransitionType,
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
        'Space plays and pauses, S or C splits at the playhead, Delete removes the selected clip, Ctrl or Cmd + Z undoes ' +
        'and Ctrl or Cmd + Shift + Z redoes, the left and right arrows step one frame, and M adds a marker. The ⌨ button lists them all.',
    },
    {
      question: 'How long can my video be?',
      answer:
        'There is no fixed limit, but everything runs on your device, so exporting takes roughly as long as the video ' +
        'plays on a laptop, and longer on phones. Keep projects under about 10 minutes for the smoothest experience.',
    },
    {
      question: 'Does the project save itself?',
      answer:
        'Yes. Every change is saved in this browser, with copies of your files, and offered back when you return. Use Save ' +
        'project to keep a .zip you can open on another computer.',
    },
    {
      question: 'Can I add subtitles?',
      answer:
        'Yes. Add caption lines from the Titles tab, or import an .srt file, and save them back as .srt. Captions are ' +
        'burned into the exported video.',
    },
    {
      question: 'Can I continue in Premiere, Resolve or Final Cut?',
      answer:
        'Export an EDL or a Final Cut XML from Export settings. They carry the cuts (files, in and out points, places ' +
        'on the timeline); relink them to your original files in the other editor.',
    },
    { question: 'Are my videos uploaded?', answer: 'No. Importing, editing and exporting all happen in your browser.' },
  ],
};

const TITLE_PRESETS: { name: string; style: TitleStyle }[] = [
  { name: 'Centre title', style: { text: 'Your title', size: 10, colour: '#ffffff', x: 0.5, y: 0.5, background: false, animation: 'fade-up' } },
  { name: 'Lower third', style: { text: 'Name Surname\nRole or place', size: 5, colour: '#ffffff', x: 0.3, y: 0.82, background: true, animation: 'slide' } },
  { name: 'Subtitle', style: { text: 'Subtitle text', size: 5, colour: '#ffffff', x: 0.5, y: 0.9, background: true } },
  { name: 'Big yellow', style: { text: 'WOW!', size: 18, colour: '#facc15', x: 0.5, y: 0.45, background: false, animation: 'pop', font: 'impact', outline: true } },
  { name: '3D extruded', style: { text: '3D TITLE', size: 16, colour: '#38bdf8', x: 0.5, y: 0.5, background: false, animation: 'extrude-3d', font: 'impact' } },
  { name: '3D flip', style: { text: 'Chapter One', size: 12, colour: '#ffffff', x: 0.5, y: 0.5, background: false, animation: 'flip-3d', font: 'serif' } },
  { name: 'Typewriter', style: { text: 'Once upon a time…', size: 7, colour: 'var(--ve-text)', x: 0.5, y: 0.5, background: false, animation: 'typewriter', font: 'mono' } },
  { name: 'Wave', style: { text: 'Have fun!', size: 12, colour: '#f472b6', x: 0.5, y: 0.5, background: false, animation: 'wave', font: 'hand', outline: true } },
  { name: 'Zoom out', style: { text: 'BIG NEWS', size: 14, colour: '#ffffff', x: 0.5, y: 0.5, background: false, animation: 'zoom', font: 'impact', outline: true } },
];

const PROFILES = [
  { label: 'HD 720p (1280×720)', width: 1280, height: 720 },
  { label: 'Full HD 1080p (1920×1080)', width: 1920, height: 1080 },
  { label: 'Vertical 1080×1920 (Reels, Shorts)', width: 1080, height: 1920 },
  { label: 'Square 1080×1080', width: 1080, height: 1080 },
  { label: 'Portrait 4:5 1080×1350 (Instagram)', width: 1080, height: 1350 },
];

/** A reason a file could not be imported, worded for people. */
class ImportProblem extends Error {}

const PICTURE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico)$/i;
const MEDIA_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|ts|mts|mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i;
const isPicture = (file: File) => file.type.startsWith('image/') || PICTURE_EXTENSIONS.test(file.name);
const isMedia = (file: File) => file.type.startsWith('video/') || file.type.startsWith('audio/') || MEDIA_EXTENSIONS.test(file.name);

/** Reads any picture into a file the canvas can draw: PNG/JPG/WebP as they are, HEIC, TIFF and SVG converted to PNG. */
async function readPicture(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  const toPng = async (draw: (canvas: HTMLCanvasElement) => void | Promise<void>) => {
    const canvas = document.createElement('canvas');
    await draw(canvas);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('no picture');
    return new File([blob], `${baseName(file.name)}.png`, { type: 'image/png' });
  };
  const fromPixels = (image: ImageData) =>
    toPng((canvas) => {
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d')!.putImageData(image, 0, 0);
    });
  if (/\.(heic|heif)$/.test(name) || /hei[cf]/.test(file.type)) {
    try {
      // Safari opens HEIC itself; other browsers use the decoder.
      (await createImageBitmap(file)).close();
      return file;
    } catch {
      const { readHeic } = await import('../image-converter/image-formats');
      return fromPixels(await readHeic(await file.arrayBuffer()));
    }
  }
  if (/\.tiff?$/.test(name) || file.type === 'image/tiff') {
    const { readTiff } = await import('../image-converter/image-formats');
    return fromPixels(await readTiff(await file.arrayBuffer()));
  }
  if (/\.svg$/.test(name) || file.type === 'image/svg+xml') {
    // SVGs are drawn at a sharp size: the long side at least 1920 px.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const w = image.naturalWidth || 1920;
      const h = image.naturalHeight || 1080;
      const scale = Math.max(1, 1920 / Math.max(w, h));
      return await toPng((canvas) => {
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return file;
}

const TITLE_EFFECTS = new Set<keyof Effects>(['brightness', 'contrast', 'saturation', 'grayscale', 'sepia', 'invert', 'hue', 'blur', 'opacity']);

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['S or C', 'Split at the playhead'],
  ['← / →', 'One frame back / forward'],
  ['Delete', 'Remove the selected clips'],
  ['Ctrl/Cmd + Z', 'Undo'],
  ['Ctrl/Cmd + Shift + Z or Y', 'Redo'],
  ['Ctrl/Cmd + C / V', 'Copy / paste clips'],
  ['Ctrl/Cmd + D', 'Duplicate after the selection'],
  ['M', 'Add or remove a marker'],
  ['Shift/Ctrl + click', 'Select several clips'],
  ['Double-click a file', 'Add it at the playhead'],
  ['Double-click a track name', 'Rename the track'],
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
    /* The editor follows the site's light and dark theme through its colour tokens. */
    .editor {
      --ve-bg: var(--surface);
      --ve-panel: var(--page);
      --ve-line: var(--line);
      --ve-text: var(--ink);
      --ve-muted: var(--muted);
      --ve-hover: color-mix(in srgb, var(--ink) 9%, transparent);
      --ve-input: var(--page);
      --ve-input-line: color-mix(in srgb, var(--ink) 22%, transparent);
      --ve-accent: var(--brand);
      --ve-on-accent: var(--on-brand);
      --ve-lane: color-mix(in srgb, var(--ink) 4%, var(--page));
      --ve-lane-2: color-mix(in srgb, var(--ink) 9%, var(--page));
      --ve-action: color-mix(in srgb, var(--brand) 14%, var(--page));
      --ve-warn: color-mix(in srgb, var(--warning) 20%, var(--page));
      --ve-info: color-mix(in srgb, var(--brand) 10%, var(--page));
      --ve-danger: color-mix(in srgb, var(--danger) 16%, var(--page));
      background: var(--ve-bg);
      color: var(--ve-text);
      border: 1px solid var(--ve-line);
    }
    .panel { background: var(--ve-panel); border: 1px solid var(--ve-line); }
    .tool { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; font-size: 0.8rem; color: var(--ve-text); }
    .tool:hover:not(:disabled) { background: var(--ve-hover); }
    .tool:disabled { opacity: 0.4; }
    .tab { padding: 0.4rem 0.8rem; font-size: 0.8rem; border-bottom: 2px solid transparent; color: var(--ve-muted); }
    .tab[aria-selected='true'] { color: var(--ve-text); border-color: var(--ve-accent); }
    .input { background: var(--ve-input); border: 1px solid var(--ve-input-line); border-radius: 0.3rem; padding: 0.2rem 0.4rem; color: var(--ve-text); font-size: 0.8rem; }
    /* Fingers need bigger targets than a mouse pointer. */
    @media (pointer: coarse) {
      .tool { min-height: 2.5rem; min-width: 2.5rem; justify-content: center; }
      .tap { min-width: 2.25rem; min-height: 2rem; display: inline-grid; place-items: center; }
      .tap-track { min-width: 1.75rem; min-height: 2rem; display: inline-grid; place-items: center; }
    }
  `,
  template: `
    <app-tool-page path="video-editor" [content]="content" [wide]="true" privacy="Your videos are edited on your device and never uploaded.">
      <div #editorRoot class="editor flex flex-col overflow-hidden rounded-xl select-none" (dragover)="$event.preventDefault()" (change)="releaseFocus($event)">
        <!-- Controls wait until the editor has started, so a very early click is not lost. -->
        <fieldset class="contents" [disabled]="!ready()">
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-1 border-b border-[var(--ve-line)] px-2 py-1.5" role="toolbar" aria-label="Editor">
          <button type="button" class="tool" aria-label="New project" title="New project" (click)="newProjectClick()">＋<span class="max-sm:hidden"> New project</span></button>
          <button type="button" class="tool" aria-label="Import files" title="Import files" (click)="fileInput.click()">📂<span class="max-sm:hidden"> Import files</span></button>
          <button type="button" class="tool" aria-label="Save project" title="Save project" (click)="saveProjectZip()">💾<span class="max-sm:hidden"> Save project</span></button>
          <button type="button" class="tool" aria-label="Open project" title="Open project" (click)="projectInput.click()">📁<span class="max-sm:hidden"> Open project</span></button>
          <input #projectInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept=".zip,application/zip" (change)="openProjectZip(projectInput)" />
          <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" multiple accept="video/*,audio/*,image/*,.mkv,.mov,.heic,.heif,.tif,.tiff,.svg" (change)="importFiles(fileInput)" />
          <span class="mx-1 h-5 w-px bg-[var(--ve-line)] max-sm:hidden"></span>
          <button type="button" class="tool" [disabled]="!history().length" aria-label="Undo" title="Undo" (click)="undo()">↶<span class="max-sm:hidden"> Undo</span></button>
          <button type="button" class="tool" [disabled]="!future().length" aria-label="Redo" title="Redo" (click)="redo()">↷<span class="max-sm:hidden"> Redo</span></button>
          <span class="mx-1 h-5 w-px bg-[var(--ve-line)] max-sm:hidden"></span>
          <label class="tool"><span class="max-sm:hidden">Profile</span>
            <select class="input max-sm:max-w-[8.5rem]" aria-label="Profile" [disabled]="exporting()" (change)="setProfile(+$any($event.target).value)">
              @for (p of profiles; track p.label; let i = $index) { <option [value]="i" [selected]="p.width === project().width && p.height === project().height">{{ p.label }}</option> }
            </select>
          </label>
          <label class="tool"><span class="max-sm:hidden">Empty space</span>
            <select class="input max-sm:max-w-[6.5rem]" aria-label="Empty space" (change)="setBackground($any($event.target).value)">
              <option value="black" [selected]="(project().background?.kind ?? 'black') === 'black'">Black</option>
              <option value="colour" [selected]="project().background?.kind === 'colour'">Colour</option>
              <option value="blur" [selected]="project().background?.kind === 'blur'">Blurred picture</option>
            </select>
            @if (project().background?.kind === 'colour') {
              <input type="color" class="h-6 w-8" aria-label="Background colour" [value]="project().background?.colour ?? '#000000'" (change)="setBackground('colour', $any($event.target).value)" />
            }
          </label>
          <button type="button" class="tool" aria-label="Video editor shortcuts" title="Keyboard shortcuts" (click)="showShortcuts.set(true)"><span class="text-base leading-none">⌨</span><span class="max-sm:hidden"> Keys</span></button>
          <span class="flex-1"></span>
          <span class="mr-2 text-xs text-[var(--ve-muted)] max-sm:hidden" role="status" aria-label="Save status">
            @switch (saveState()) {
              @case ('saving') { Saving… }
              @case ('saved') { ✓ Saved in this browser }
              @case ('failed') { <span class="text-red-400">Not saved: browser storage is full</span> }
            }
          </span>
          <select class="input max-sm:max-w-[8.5rem]" aria-label="Export format" [disabled]="exporting()" (change)="exportFormat.set($any($event.target).value)">
            @for (f of exportFormats; track f.id) { <option [value]="f.id" [selected]="f.id === exportFormat()">{{ f.label }}</option> }
          </select>
          <select class="input max-sm:max-w-[5.5rem]" aria-label="Export quality" [disabled]="exporting()" (change)="exportQuality.set($any($event.target).value)">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high" selected>High</option>
            <option value="very-high">Very high</option>
          </select>
          <button type="button" class="tool" [class.!bg-[var(--ve-hover)]]="showExportSettings()" [attr.aria-expanded]="showExportSettings()" aria-label="Export settings" (click)="showExportSettings.set(!showExportSettings())"><span class="text-base leading-none">⚙</span><span class="max-sm:hidden"> Settings</span></button>
          <span class="text-xs text-[var(--ve-muted)]" aria-label="Estimated file size" title="A guess: calm, still scenes come out near the smaller number, busy ones near the larger">≈ {{ estimate() }}</span>
          <button type="button" class="tool !bg-[var(--ve-accent)] !text-[var(--ve-on-accent)]" [disabled]="exporting() || !project().clips.length" (click)="exportVideo()">⬇ Export video</button>
        </div>
        @if (showExportSettings()) {
          <div class="flex flex-wrap items-center gap-2 border-b border-[var(--ve-line)] bg-[var(--ve-bg)] px-3 py-2 text-xs" role="group" aria-label="Export settings panel">
            <label class="flex items-center gap-1">Resolution
              <select class="input" aria-label="Export resolution" (change)="setResolution($any($event.target).value)">
                @for (r of exportResolutions; track r.id) { <option [value]="r.id" [selected]="r.id === exportResolution()">{{ r.label }}</option> }
              </select>
            </label>
            <span class="text-[var(--ve-muted)]">{{ exportSize().width }}×{{ exportSize().height }}</span>
            <label class="flex items-center gap-1">Frame rate
              <select class="input" aria-label="Export frame rate" (change)="exportFps.set(+$any($event.target).value)">
                <option value="0" [selected]="!exportFps()">Project ({{ project().fps }} fps)</option>
                @for (f of exportFpsList; track f) { <option [value]="f" [selected]="f === exportFps()">{{ f }} fps</option> }
              </select>
            </label>
            <label class="flex items-center gap-1"><input type="checkbox" aria-label="Export only a part" [checked]="useRange()" (change)="setUseRange($any($event.target).checked)" /> Only a part</label>
            @if (useRange()) {
              <label class="flex items-center gap-1">From (s)
                <input type="number" min="0" step="0.1" class="input w-20" aria-label="Export from" [value]="round(rangeStart())" (change)="rangeStart.set(Math.max(0, $any($event.target).valueAsNumber || 0))" />
              </label>
              <label class="flex items-center gap-1">To (s)
                <input type="number" min="0" step="0.1" class="input w-20" aria-label="Export to" [value]="round(rangeEnd())" (change)="rangeEnd.set(Math.max(0, $any($event.target).valueAsNumber || 0))" />
              </label>
              <button type="button" class="tool !py-0.5" (click)="rangeFromPlayhead('start')">From playhead</button>
              <button type="button" class="tool !py-0.5" (click)="rangeFromPlayhead('end')">To playhead</button>
            }
            <span class="mx-1 h-5 w-px bg-[var(--ve-line)]"></span>
            <button type="button" class="tool !py-0.5" [disabled]="!project().clips.length" (click)="saveFrame('png')">📷 Frame PNG</button>
            <button type="button" class="tool !py-0.5" [disabled]="!project().clips.length" (click)="saveFrame('jpg')">📷 Frame JPG</button>
            <button type="button" class="tool !py-0.5" [disabled]="!hasCaptions()" (click)="saveSrt()">💬 Subtitles .srt</button>
            <button type="button" class="tool !py-0.5" [disabled]="!project().clips.length" (click)="saveEdl()">🎞 EDL</button>
            <button type="button" class="tool !py-0.5" [disabled]="!project().clips.length" (click)="saveXml()">🎞 Final Cut XML</button>
            <span class="text-[var(--ve-muted)]">EDL and XML carry the cuts only, not titles, captions or effects.</span>
          </div>
        }
        @if (showShortcuts()) {
          <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" (click)="showShortcuts.set(false)">
            <div class="panel w-full max-w-md rounded-lg p-4 text-sm" role="dialog" aria-modal="true" aria-label="Video editor shortcuts" (click)="$event.stopPropagation()">
              <p class="mb-2 flex items-center justify-between font-semibold text-[var(--ve-text)]">⌨ Keyboard shortcuts
                <button type="button" class="tool" aria-label="Close shortcuts" (click)="showShortcuts.set(false)">✕</button>
              </p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                @for (s of shortcuts; track s[0]) {
                  <dt><kbd class="rounded border border-[var(--ve-input-line)] bg-[var(--ve-input)] px-1.5 font-mono text-xs">{{ s[0] }}</kbd></dt>
                  <dd class="text-[var(--ve-text)]">{{ s[1] }}</dd>
                }
              </dl>
            </div>
          </div>
        }
        @if (otherTab()) {
          <div class="flex flex-wrap items-center gap-2 border-b border-[var(--ve-line)] bg-[var(--ve-warn)] px-3 py-2 text-sm" role="alert">
            <span>The video editor is open in another tab. To keep that tab's work safe, changes here are not saved.</span>
            <button type="button" class="tool !bg-[var(--ve-accent)] !text-[var(--ve-on-accent)]" (click)="useThisTab()">Save in this tab instead</button>
          </div>
        }
        @if (notice()) {
          <div class="flex items-center gap-2 border-b border-[var(--ve-line)] bg-[var(--ve-info)] px-3 py-2 text-sm" role="alert">
            <span class="flex-1">{{ notice() }}</span>
            <button type="button" class="tool" aria-label="Close message" (click)="notice.set('')">✕</button>
          </div>
        }
        @if (restoreOffer(); as offer) {
          <div class="flex flex-wrap items-center gap-2 border-b border-[var(--ve-line)] bg-[var(--ve-info)] px-3 py-2 text-sm" role="alert">
            <span>You have a project saved {{ ago(offer.saved.savedAt) }} ({{ offer.saved.project.clips.length }} clips, {{ offer.media.length }} files).</span>
            <button type="button" class="tool !bg-[var(--ve-accent)] !text-[var(--ve-on-accent)]" (click)="restore()">Restore it</button>
            <button type="button" class="tool" (click)="discardSaved()">Start fresh</button>
          </div>
        }

        <div class="grid gap-1 p-1 max-lg:contents lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <!-- Left: project files / titles / properties -->
          <div class="panel flex min-h-72 flex-col rounded max-lg:order-3 max-lg:m-1 lg:h-[calc(40vh+4rem)] lg:min-h-80">
            <div class="flex border-b border-[var(--ve-line)]" role="tablist" aria-label="Panels">
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'files'" (click)="tab.set('files')">Project Files</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'transitions'" (click)="tab.set('transitions')">Transitions</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'effects'" (click)="tab.set('effects')">Effects</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'titles'" (click)="tab.set('titles')">Titles</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'properties'" (click)="tab.set('properties')">Properties</button>
              <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'history'" (click)="tab.set('history')">History</button>
            </div>
            <div class="flex-1 overflow-auto p-2" (drop)="dropFiles($event)">
              @switch (tab()) {
                @case ('files') {
                  @if (!media().length) {
                    <button type="button" class="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-[var(--ve-input-line)] text-sm text-[var(--ve-muted)]" (click)="fileInput.click()">
                      <span class="text-3xl">🎬</span>
                      Drop videos, audio and images here, or click to import
                      <ol class="mt-2 list-inside list-decimal text-left text-xs leading-6">
                        <li>Import your videos, music and photos</li>
                        <li>Press ＋ on a file to put it on the timeline</li>
                        <li>Cut with ✂ Split, add titles, then ⬇ Export video</li>
                      </ol>
                    </button>
                  } @else {
                    <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Project files">
                      @for (m of media(); track m.id) {
                        <li draggable="true" class="cursor-grab rounded border border-[var(--ve-line)] bg-[var(--ve-bg)] p-1 text-xs hover:border-[var(--ve-accent)]" [attr.aria-label]="m.name" (dragstart)="dragMedia($event, m)" (pointerdown)="lastPointer = $event.pointerType" (click)="tapFile(m, $event)" (dblclick)="lastPointer !== 'touch' && addAtPlayhead(m)" title="Press ＋ (or double-click, or drag) to add it to the timeline">
                          <div class="grid aspect-video place-items-center overflow-hidden rounded bg-black">
                            @if (m.kind === 'video') { <video [src]="m.url + '#t=0.5'" muted preload="metadata" class="h-full w-full object-contain"></video> }
                            @else if (m.kind === 'image') { <img [src]="m.url" alt="" class="h-full w-full object-contain" /> }
                            @else { <span class="text-2xl">🎵</span> }
                          </div>
                          <p class="mt-1 flex items-center justify-between gap-1"><span class="truncate">{{ m.name }}</span>
                            <span class="flex shrink-0">
                              <button type="button" class="tap rounded bg-[var(--ve-accent)] px-1.5 font-bold text-[var(--ve-on-accent)] hover:bg-[var(--brand-strong)]" [attr.aria-label]="'Add ' + m.name + ' to the timeline'" title="Add to the timeline" (click)="$event.stopPropagation(); addAtPlayhead(m)" (dblclick)="$event.stopPropagation()">＋</button>
                              <button type="button" class="tap rounded px-1 text-[var(--ve-muted)] hover:bg-[var(--ve-hover)] hover:text-[var(--ve-text)]" [attr.aria-label]="'Remove ' + m.name + ' from the project'" (click)="$event.stopPropagation(); removeMedia(m.id)" (dblclick)="$event.stopPropagation()">✕</button>
                            </span>
                          </p>
                          <p class="text-[var(--ve-muted)]">{{ m.kind === 'image' ? 'Image' : timecodeShort(m.duration) }}</p>
                        </li>
                      }
                    </ul>
                  }
                  @if (imageCount() > 0) {
                    <div class="mt-2 flex flex-wrap items-center gap-2 rounded border border-[var(--ve-line)] p-2 text-xs">
                      <span>🖼 Photos to slideshow:</span>
                      <label class="flex items-center gap-1"><input type="number" min="0.5" max="30" step="0.5" class="input w-16" aria-label="Seconds per photo" [value]="slideSeconds()" (change)="slideSeconds.set(Math.max(0.5, $any($event.target).valueAsNumber || 3))" /> s each</label>
                      <label class="flex items-center gap-1"><input type="checkbox" aria-label="Fade between photos" [checked]="slideFade()" (change)="slideFade.set($any($event.target).checked)" /> Fade</label>
                      <button type="button" class="tool !bg-[var(--ve-action)]" (click)="makeSlideshow()">Add {{ imageCount() }} photo{{ imageCount() === 1 ? '' : 's' }} to the timeline</button>
                    </div>
                  }
                  @if (importing()) { <p class="mt-2 text-xs text-[var(--ve-muted)]" role="status">Importing…</p> }
                  @if (error()) { <p class="mt-2 text-xs text-red-400" role="alert">{{ error() }}</p> }
                }
                @case ('transitions') {
                  <p class="mb-2 text-xs text-[var(--ve-muted)]">{{ selected() ? 'Add to the selected clip: ' + clipName(selected()!) : 'Select a clip on the timeline first.' }}</p>
                  <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Transitions">
                    @for (t of transitions; track t.type) {
                      <li class="rounded border border-[var(--ve-line)] bg-[var(--ve-bg)] p-2 text-center text-xs">
                        <div class="grid aspect-video place-items-center rounded bg-gradient-to-r from-[#111] to-[var(--ve-accent)] text-2xl">{{ t.icon }}</div>
                        <p class="mt-1 font-semibold">{{ t.label }}</p>
                        <span class="mt-1 flex justify-center gap-1">
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!selected()" [attr.aria-label]="t.label + ' at start'" (click)="setTransition('in', t.type)">Start</button>
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!selected()" [attr.aria-label]="t.label + ' at end'" (click)="setTransition('out', t.type)">End</button>
                        </span>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[var(--ve-muted)]">Tip: overlap two clips on different tracks and fade the upper one in for a cross-fade.</p>
                }
                @case ('effects') {
                  <p class="mb-2 text-xs text-[var(--ve-muted)]">{{ selected() ? 'Apply to the selected clip: ' + clipName(selected()!) : 'Select a clip on the timeline first.' }}</p>
                  <ul class="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Effects">
                    @for (e of effectPresets; track e.name) {
                      <li>
                        <button type="button" class="w-full rounded border border-[var(--ve-line)] bg-[var(--ve-bg)] p-2 text-center text-xs hover:border-[var(--ve-accent)] disabled:opacity-40" [disabled]="!selected()" (click)="applyEffect(e.effects)">
                          <div class="text-2xl">{{ e.icon }}</div>
                          {{ e.name }}
                        </button>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[var(--ve-muted)]">Fine-tune every effect in Properties.</p>
                }
                @case ('titles') {
                  <ul class="grid grid-cols-2 gap-2" aria-label="Title templates">
                    @for (t of titles; track t.name) {
                      <li>
                        <button type="button" class="w-full rounded border border-[var(--ve-line)] bg-[var(--ve-bg)] p-2 text-left text-xs hover:border-[var(--ve-accent)]" (click)="addTitle(t.style)">
                          <div class="grid aspect-video place-items-center rounded bg-black font-bold" [style.color]="t.style.colour" [style.font-family]="fontCss(t.style.font)" [style.text-shadow]="t.style.animation === 'extrude-3d' ? '2px 2px 0 #0369a1, 4px 4px 0 #075985' : null">{{ t.style.text.split('\\n')[0] }}</div>
                          <p class="mt-1">{{ t.name }}</p>
                        </button>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[var(--ve-muted)]">Click a template to add it at the playhead, then edit it in Properties.</p>
                  <div class="mt-3 flex flex-col gap-2 rounded border border-[var(--ve-line)] p-2 text-xs">
                    <p class="font-semibold text-[var(--ve-text)]">💬 Captions / subtitles</p>
                    <span class="flex flex-wrap gap-1">
                      <button type="button" class="tool !bg-[var(--ve-action)]" (click)="addCaption()">＋ Caption at playhead</button>
                      <button type="button" class="tool !bg-[var(--ve-action)]" (click)="srtInput.click()">📥 Import .srt</button>
                      <button type="button" class="tool !bg-[var(--ve-action)]" [disabled]="!hasCaptions()" (click)="saveSrt()">📤 Export .srt</button>
                      <input #srtInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept=".srt,.vtt,text/plain" (change)="importSrt(srtInput)" />
                    </span>
                    <p class="text-[var(--ve-muted)]">Captions go on their own Captions track. Edit the text in Properties; they are drawn into the exported video.</p>
                  </div>
                }
                @case ('history') {
                  <ol class="flex flex-col gap-0.5 text-xs" aria-label="History">
                    <li><button type="button" class="w-full rounded px-2 py-1 text-left hover:bg-[var(--ve-hover)]" [class.text-[var(--ve-muted)]]="history().length > 0" (click)="goToHistory(0)">Start</button></li>
                    @for (h of history(); track $index; let i = $index) {
                      <li><button type="button" class="w-full rounded px-2 py-1 text-left hover:bg-[var(--ve-hover)]" (click)="goToHistory(i + 1)">{{ i + 1 }}. {{ h.label }}</button></li>
                    }
                    @for (f of future(); track $index; let i = $index) {
                      <li><button type="button" class="w-full rounded px-2 py-1 text-left text-[var(--ve-muted)] line-through hover:bg-[var(--ve-hover)]" (click)="redoTo(i)">{{ f.label }}</button></li>
                    }
                  </ol>
                  <p class="mt-2 text-xs text-[var(--ve-muted)]">Click a step to go back to it. Crossed-out steps can be redone.</p>
                }
                @case ('properties') {
                  @if (selected(); as clip) {
                    @if (isLocked(clip.track)) { <p class="mb-2 rounded bg-[var(--ve-warn)] px-2 py-1 text-xs">🔒 This clip is on a locked track. Unlock the track to change it.</p> }
                    <fieldset class="flex flex-col gap-2 text-xs" [disabled]="isLocked(clip.track)">
                      <p class="font-semibold text-[var(--ve-text)]">{{ clipName(clip) }}</p>
                      <label class="flex items-center justify-between gap-2">Start (s)
                        <input type="number" min="0" step="0.1" class="input w-24" aria-label="Clip start" [value]="round(clip.start)" (change)="setStart(clip, $any($event.target).valueAsNumber)" />
                      </label>
                      <label class="flex items-center justify-between gap-2">Length (s)
                        <input type="number" min="0.1" step="0.1" class="input w-24" aria-label="Clip length" [value]="round(length(clip))" (change)="setLength(clip, $any($event.target).valueAsNumber)" />
                      </label>
                      @if (isTimed(clip)) {
                        <label class="flex items-center justify-between gap-2">Speed
                          <select class="input" aria-label="Clip speed" (change)="setSpeed(clip, +$any($event.target).value)">
                            @for (sp of speeds; track sp) { <option [value]="sp" [selected]="(clip.speed ?? 1) === sp">{{ sp }}×</option> }
                          </select>
                        </label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Play backwards" [checked]="!!clip.reverse" (change)="change(clip.id, { reverse: $any($event.target).checked }, 'Reverse')" /> Play backwards (reverse)</label>
                        <label class="flex items-center justify-between gap-2">Speed ramp
                          <select class="input" aria-label="Speed ramp" (change)="setRamp(clip, $any($event.target).value, clip.ramp?.amount ?? 0.6)">
                            @for (r of rampShapes; track r.id) { <option [value]="r.id" [selected]="(clip.ramp?.shape ?? 'none') === r.id">{{ r.label }}</option> }
                          </select>
                        </label>
                        @if (clip.ramp && clip.ramp.shape !== 'none') {
                          <label class="flex items-center justify-between gap-2">Ramp strength {{ Math.round(clip.ramp.amount * 100) }}%
                            <input type="range" min="0.1" max="0.9" step="0.05" class="w-32" aria-label="Ramp strength" [value]="clip.ramp.amount" (change)="setRamp(clip, clip.ramp.shape, $any($event.target).valueAsNumber)" />
                          </label>
                          <p class="text-[var(--ve-muted)]">Splitting this clip removes the ramp: both parts then play at a steady speed.</p>
                        }
                      }
                      @if (hasSound(clip) && !clip.muted) {
                        <label class="flex items-center justify-between gap-2">Volume {{ Math.round(clip.volume * 100) }}%
                          <input type="range" min="0" max="2" step="0.05" class="w-32" aria-label="Clip volume" [value]="clip.volume" (change)="change(clip.id, { volume: $any($event.target).valueAsNumber })" />
                        </label>
                        <div class="flex items-center justify-between gap-2">
                          <label class="flex items-center gap-1">Fade in
                            <input type="number" min="0" max="10" step="0.5" class="input w-14" aria-label="Fade in seconds" [value]="fadeOf(clip, 'in')" (change)="setFade(clip, 'in', $any($event.target).valueAsNumber)" /> s
                          </label>
                          <label class="flex items-center gap-1">Fade out
                            <input type="number" min="0" max="10" step="0.5" class="input w-14" aria-label="Fade out seconds" [value]="fadeOf(clip, 'out')" (change)="setFade(clip, 'out', $any($event.target).valueAsNumber)" /> s
                          </label>
                        </div>
                        @if ((clip.audioOnly || isAudioMedia(clip)) && pictureEnd() > clip.start) {
                          <button type="button" class="tool self-start !bg-[var(--ve-action)]" (click)="fitToVideo(clip)" title="Cuts a long song, or repeats a short one, so it ends with the video, and fades it out">🎵 Fit to video length ({{ timecodeShort(pictureEnd()) }})</button>
                        }
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
                        <label class="flex items-center gap-2"><input type="checkbox" [checked]="!!t.outline" aria-label="Title outline" (change)="setTitle(clip, { outline: $any($event.target).checked }, true)" /> Outline</label>
                        <label class="flex items-center gap-2"><input type="checkbox" [checked]="!!clip.caption" aria-label="Subtitle line" (change)="change(clip.id, { caption: $any($event.target).checked || undefined }, 'Caption')" /> Subtitle line (saved in .srt)</label>
                        <label class="flex items-center justify-between gap-2">Font
                          <select class="input" aria-label="Title font" (change)="setTitle(clip, { font: $any($event.target).value }, true)">
                            @for (f of titleFonts; track f.id) { <option [value]="f.id" [selected]="(t.font ?? 'sans') === f.id">{{ f.label }}</option> }
                          </select>
                        </label>
                        <label class="flex items-center justify-between gap-2">Animation
                          <select class="input" aria-label="Title animation" (change)="setTitle(clip, { animation: $any($event.target).value }, true)">
                            @for (a of titleAnimations; track a.id) { <option [value]="a.id" [selected]="(t.animation ?? 'none') === a.id">{{ a.label }}</option> }
                          </select>
                        </label>
                      }
                      @if (hasSound(clip) && !clip.muted) {
                        <p class="mt-2 font-semibold text-[var(--ve-text)]">Sound effects</p>
                        <label class="flex items-center justify-between gap-2">Echo {{ Math.round(audioFx(clip).echo * 100) }}%
                          <input type="range" min="0" max="1" step="0.05" class="w-32" aria-label="Echo" [value]="audioFx(clip).echo" (change)="setAudioFx(clip, { echo: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Bass {{ audioFx(clip).bass }} dB
                          <input type="range" min="-12" max="12" step="1" class="w-32" aria-label="Bass" [value]="audioFx(clip).bass" (change)="setAudioFx(clip, { bass: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Treble {{ audioFx(clip).treble }} dB
                          <input type="range" min="-12" max="12" step="1" class="w-32" aria-label="Treble" [value]="audioFx(clip).treble" (change)="setAudioFx(clip, { treble: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Mid (voice) {{ audioFx(clip).mid ?? 0 }} dB
                          <input type="range" min="-12" max="12" step="1" class="w-32" aria-label="Mid" [value]="audioFx(clip).mid ?? 0" (change)="setAudioFx(clip, { mid: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Distortion {{ Math.round((audioFx(clip).distortion ?? 0) * 100) }}%
                          <input type="range" min="0" max="1" step="0.05" class="w-32" aria-label="Distortion" [value]="audioFx(clip).distortion ?? 0" (change)="setAudioFx(clip, { distortion: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Clean up voice" [checked]="audioFx(clip).clean" (change)="setAudioFx(clip, { clean: $any($event.target).checked })" /> Clean up voice (cut rumble and hiss)</label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Noise reduction" [checked]="!!audioFx(clip).denoise" (change)="setAudioFx(clip, { denoise: $any($event.target).checked })" /> Noise reduction (hum and hiss)</label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Compressor" [checked]="!!audioFx(clip).compressor" (change)="setAudioFx(clip, { compressor: $any($event.target).checked })" /> Compressor (even out loud and quiet)</label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Robot voice" [checked]="!!audioFx(clip).robot" (change)="setAudioFx(clip, { robot: $any($event.target).checked })" /> 🤖 Robot voice</label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Phone voice" [checked]="!!audioFx(clip).phone" (change)="setAudioFx(clip, { phone: $any($event.target).checked })" /> ☎ Phone call voice</label>
                      }
                      @if (!clip.audioOnly && !isAudioMedia(clip)) {
                        <p class="mt-2 flex items-center justify-between font-semibold text-[var(--ve-text)]">Transform
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!clip.transform && !clip.keyframes" (click)="resetTransform(clip)">Reset</button>
                        </p>
                        @if (!clip.title) {
                          <label class="flex items-center justify-between gap-2">Scale mode
                            <select class="input" aria-label="Scale mode" (change)="setScaleMode(clip, $any($event.target).value)">
                              @for (m of scaleModes; track m.id) { <option [value]="m.id" [selected]="(clip.transform?.fit ?? 'fit') === m.id">{{ m.label }}</option> }
                            </select>
                          </label>
                        }
                        <p class="text-[var(--ve-muted)]">◆ adds a keyframe at the playhead, so the value can change over time.</p>
                        @if (clip.keyframes) {
                          <label class="flex items-center justify-between gap-2">Keyframe curve
                            <select class="input" aria-label="Keyframe curve" (change)="setKeyEase(clip, $any($event.target).value)">
                              @for (k of keyEases; track k.id) { <option [value]="k.id" [selected]="keyEaseOf(clip) === k.id">{{ k.label }}</option> }
                            </select>
                          </label>
                        }
                        @for (f of transformFields; track f.key) {
                          <div class="flex items-center justify-between gap-2">
                            <span>{{ f.label }} {{ round(transformValue(clip, f.key)) }}</span>
                            <span class="flex items-center gap-1">
                              <input type="range" class="w-28" [min]="f.min" [max]="f.max" [step]="f.step" [attr.aria-label]="'Transform ' + f.label" [value]="transformValue(clip, f.key)" (input)="setTransformValue(clip, f.key, $any($event.target).valueAsNumber, false)" (change)="setTransformValue(clip, f.key, $any($event.target).valueAsNumber, true)" />
                              <button type="button" class="rounded px-1" [class.text-amber-300]="hasKeyframeHere(clip, f.key)" [attr.aria-label]="'Keyframe ' + f.label" (click)="toggleKeyframe(clip, f.key)">◆</button>
                              <span class="w-4 text-[10px] text-[var(--ve-muted)]">{{ clip.keyframes?.[f.key]?.length || '' }}</span>
                            </span>
                          </div>
                        }
                        @if (!clip.title) {
                          @for (c of cropFields; track c.key) {
                            <label class="flex items-center justify-between gap-2">{{ c.label }} {{ Math.round((clip.transform ?? noTransform)[c.key] * 100) }}%
                              <input type="range" min="0" max="0.45" step="0.01" class="w-32" [attr.aria-label]="c.label" [value]="(clip.transform ?? noTransform)[c.key]" (change)="setCrop(clip, c.key, $any($event.target).valueAsNumber)" />
                            </label>
                          }
                        }
                      }
                      <p class="mt-2 font-semibold text-[var(--ve-text)]">Transitions</p>
                      @for (side of sides; track side.key) {
                        <div class="flex items-center justify-between gap-2">
                          <span>{{ side.label }}</span>
                          <span class="flex gap-1">
                            <select class="input" [attr.aria-label]="side.label + ' transition'" (change)="setTransition(side.key, $any($event.target).value)">
                              <option value="" [selected]="!transitionOf(clip, side.key)">None</option>
                              @for (t of transitions; track t.type) { <option [value]="t.type" [selected]="transitionOf(clip, side.key)?.type === t.type">{{ t.label }}</option> }
                            </select>
                            @if (transitionOf(clip, side.key); as tr) {
                              <input type="number" min="0.1" max="10" step="0.1" class="input w-16" [attr.aria-label]="side.label + ' duration'" [value]="tr.duration" (change)="setTransitionDuration(side.key, $any($event.target).valueAsNumber)" />
                            }
                          </span>
                        </div>
                      }
                      @if (!clip.audioOnly && !isAudioMedia(clip)) {
                      <p class="mt-2 flex items-center justify-between font-semibold text-[var(--ve-text)]">Effects
                        <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!clip.effects" (click)="resetEffects()">Reset</button>
                      </p>
                      @if (clip.title) { <p class="text-[var(--ve-muted)]">Titles take the colour, blur and opacity effects.</p> }
                      @if (!clip.title && effectValue(clip, 'chroma')) {
                        <label class="flex items-center justify-between gap-2">Green screen colour
                          <input type="color" class="h-6 w-10" aria-label="Green screen colour" [value]="clip.effects?.chromaColour ?? '#00ff00'" (change)="setChromaColour(clip, $any($event.target).value)" />
                        </label>
                      }
                      @if (!clip.title) {
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Mirror" [checked]="!!clip.effects?.mirror" (change)="setMirror(clip, $any($event.target).checked)" /> 🪞 Mirror (flip left to right)</label>
                      }
                      @for (f of effectFieldsFor(clip); track f.key) {
                        <label class="flex items-center justify-between gap-2">{{ f.label }} {{ effectValue(clip, f.key) }}{{ f.unit }}
                          <input type="range" class="w-32" [min]="f.min" [max]="f.max" [step]="f.step" [attr.aria-label]="'Effect ' + f.label" [value]="effectValue(clip, f.key)" (input)="setEffect(f.key, $any($event.target).valueAsNumber, false)" (change)="setEffect(f.key, $any($event.target).valueAsNumber, true)" />
                        </label>
                      }
                      }
                      <span class="mt-2 flex flex-wrap gap-1">
                        @if (canSeparate(clip)) { <button type="button" class="tool !bg-[var(--ve-action)]" (click)="separate(clip)">🔈 Separate audio</button> }
                        @if (isVideo(clip)) { <button type="button" class="tool !bg-[var(--ve-action)]" (click)="freezeFrame(clip)">❄ Freeze frame</button> }
                        <button type="button" class="tool !bg-[var(--ve-danger)]" (click)="deleteSelected()">🗑 Remove clip</button>
                      </span>
                    </fieldset>
                  } @else {
                    <p class="text-xs text-[var(--ve-muted)]">Select a clip on the timeline to see its properties.</p>
                  }
                }
              }
            </div>
          </div>

          <!-- Right: preview -->
          <div class="panel flex flex-col rounded max-lg:order-1 max-lg:m-1">
            <div #previewBox class="grid flex-1 place-items-center bg-black p-1">
              <div class="relative max-w-full">
                <canvas #preview class="block max-h-[40vh] max-w-full [:fullscreen_&]:max-h-screen" role="img" aria-label="Video preview" (dblclick)="fullscreen()"></canvas>
                @if (safeZones()) {
                  <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Safe zones">
                    @if (project().height / project().width >= 1.6) {
                      <!-- Reels / Shorts / TikTok: the app's buttons and captions cover these parts. -->
                      <rect x="0" y="0" width="100" height="13" fill="rgba(239,68,68,0.28)" />
                      <rect x="0" y="72" width="100" height="28" fill="rgba(239,68,68,0.28)" />
                      <rect x="84" y="13" width="16" height="59" fill="rgba(239,68,68,0.2)" />
                      <rect x="6" y="13" width="78" height="59" fill="none" stroke="#22c55e" stroke-width="0.4" stroke-dasharray="1.5 1" vector-effect="non-scaling-stroke" />
                    } @else {
                      <rect x="5" y="5" width="90" height="90" fill="none" stroke="#22c55e" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
                      <rect x="10" y="10" width="80" height="80" fill="none" stroke="#facc15" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
                    }
                    <line x1="50" y1="48" x2="50" y2="52" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line x1="48" y1="50" x2="52" y2="50" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" />
                  </svg>
                }
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-1 border-t border-[var(--ve-line)] px-2 py-1.5">
              <button type="button" class="tool" aria-label="Jump to start" (click)="seek(0)">⏮</button>
              <button type="button" class="tool" aria-label="Back one second" (click)="seek(time() - 1)">⏪</button>
              <button type="button" class="tool" aria-label="Previous frame" title="Previous frame (←)" (click)="stepFrame(-1)">◁|</button>
              <button type="button" class="tool text-base" [attr.aria-label]="playing() ? 'Pause' : 'Play'" (click)="togglePlay()">{{ playing() ? '⏸' : '▶' }}</button>
              <button type="button" class="tool" aria-label="Next frame" title="Next frame (→)" (click)="stepFrame(1)">|▷</button>
              <button type="button" class="tool" aria-label="Forward one second" (click)="seek(time() + 1)">⏩</button>
              <button type="button" class="tool" aria-label="Jump to end" (click)="seek(duration())">⏭</button>
              <span class="ml-2 whitespace-nowrap font-mono text-xs"><span aria-label="Current time">{{ timecode(time(), project().fps) }}</span>
                <span class="text-[var(--ve-muted)]">/ {{ timecode(duration(), project().fps) }}</span></span>
              <span class="ml-2 flex h-6 w-16 flex-col justify-center gap-0.5" role="meter" aria-label="Sound level" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="Math.round(Math.max(levels()[0], levels()[1]) * 100)" title="Sound level (left and right)">
                @for (l of levels(); track $index) {
                  <span class="block h-1.5 overflow-hidden rounded bg-[var(--ve-line)]"><span class="block h-full" [style.width.%]="l * 100" [style.background]="l > 0.95 ? '#ef4444' : l > 0.7 ? '#facc15' : '#22c55e'"></span></span>
                }
              </span>
              <button type="button" class="tool" [class.!bg-[var(--ve-hover)]]="safeZones()" [attr.aria-pressed]="safeZones()" aria-label="Safe zones" title="Safe zones for titles and for Reels/Shorts buttons" (click)="safeZones.set(!safeZones())">▣</button>
              <button type="button" class="tool" aria-label="Full screen preview" (click)="fullscreen()">⛶</button>
            </div>
          </div>
        </div>

        @if (exporting() || exported()) {
          <div class="panel mx-1 mb-1 flex flex-wrap items-center gap-3 rounded px-3 py-2 text-sm max-lg:order-2" role="status">
            @if (exporting()) {
              <span>{{ exportStage() }}</span>
              <div class="h-2 w-48 overflow-hidden rounded bg-[var(--ve-line)]" role="progressbar" aria-label="Export progress" [attr.aria-valuenow]="exportPercent()" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-[var(--ve-accent)]" [style.width.%]="exportPercent()"></div>
              </div>
              <button type="button" class="tool" (click)="cancelExport()">Cancel</button>
            } @else if (exported(); as e) {
              <span>Ready: {{ e.name }} ({{ formatBytes(e.blob.size) }})</span>
              <button type="button" class="tool !bg-[var(--ve-accent)] !text-[var(--ve-on-accent)]" (click)="downloadExport()">Download {{ e.name }}</button>
              <button type="button" class="tool" (click)="exported.set(null)">Close</button>
            }
          </div>
        }

        <!-- Timeline -->
        <div class="panel m-1 mt-0 rounded max-lg:order-2">
          <div class="flex flex-wrap items-center gap-1 border-b border-[var(--ve-line)] px-2 py-1" role="toolbar" aria-label="Timeline">
            <span class="mr-2 text-xs font-semibold">Timeline</span>
            <button type="button" class="tool" aria-label="Add track" (click)="addTrack()">＋ Track</button>
            <button type="button" class="tool" [class.!bg-[var(--ve-hover)]]="snapping()" [attr.aria-pressed]="snapping()" aria-label="Snapping" (click)="snapping.set(!snapping())">🧲 Snap</button>
            <button type="button" class="tool" aria-label="Split at playhead" (click)="splitAtPlayhead()">✂ Split</button>
            <button type="button" class="tool" [disabled]="!selectedId()" aria-label="Delete clip" (click)="deleteSelected()">🗑 Delete</button>
            <button type="button" class="tool" [class.!bg-[var(--ve-hover)]]="ripple()" [attr.aria-pressed]="ripple()" aria-label="Close gaps" title="When on, deleting a video or photo on the main track takes its time out of the whole project: the gap closes and music, titles and captions stay in step" (click)="ripple.set(!ripple())">⇤ Close gaps</button>
            <button type="button" class="tool" [disabled]="!selectedIds().length" aria-label="Copy clips" (click)="copy()">⧉ Copy</button>
            <button type="button" class="tool" [disabled]="!clipboard().length" aria-label="Paste clips" (click)="paste()">📋 Paste</button>
            <button type="button" class="tool" aria-label="Add marker" (click)="toggleMarker()">⚑ Marker</button>
            @if (selectedIds().length > 1) { <span class="text-xs text-[var(--ve-muted)]">{{ selectedIds().length }} clips selected</span> }
            <span class="flex-1"></span>
            <label class="tool">Zoom
              <input type="range" min="10" max="300" class="w-28" aria-label="Timeline zoom" [value]="pps()" (input)="pps.set($any($event.target).valueAsNumber)" />
            </label>
          </div>
          <div #scroller class="relative max-h-80 overflow-auto" aria-label="Timeline tracks">
            <div class="relative" [style.width.px]="header() + timelineWidth()">
              <!-- Ruler -->
              <div class="sticky top-0 z-20 flex h-6 bg-[var(--ve-bg)]">
                <div class="sticky left-0 z-10 shrink-0 border-r border-[var(--ve-line)] bg-[var(--ve-bg)]" [style.width.px]="header()"></div>
                <div class="relative flex-1 cursor-pointer touch-none" (pointerdown)="scrubStart($event)">
                  @for (tick of ticks(); track tick) {
                    <span class="absolute top-0 h-full border-l border-[var(--ve-input-line)] pl-1 font-mono text-[10px] text-[var(--ve-muted)]" [style.left.px]="tick * pps()">{{ timecodeShort(tick) }}</span>
                  }
                  @for (m of project().markers ?? []; track m) {
                    <button type="button" class="absolute top-0 z-10 -ml-1.5 text-xs leading-none text-amber-500" [style.left.px]="m * pps()" [attr.aria-label]="'Marker at ' + timecodeShort(m)" title="Click to jump, double-click to remove" (pointerdown)="$event.stopPropagation()" (click)="seek(m)" (dblclick)="removeMarkerAt(m)">⚑</button>
                  }
                </div>
              </div>
              <!-- Tracks, highest on top as in desktop editors -->
              @for (track of tracksTopDown(); track track.id) {
                <div class="flex border-b border-[var(--ve-line)]" [style.height.px]="ROW">
                  <div class="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-r border-[var(--ve-line)] bg-[var(--ve-panel)] px-2 text-xs [@media(pointer:coarse)]:px-1" [style.width.px]="header()">
                    @if (renaming() === track.id) {
                      <input class="input w-full !py-0 text-xs" [attr.aria-label]="'Rename ' + track.name" [value]="track.name" maxlength="30" (keydown.enter)="$any($event.target).blur()" (keydown.escape)="renaming.set(null)" (blur)="finishRename(track.id, $any($event.target).value)" (pointerdown)="$event.stopPropagation()" />
                    } @else {
                      <span class="cursor-text truncate font-semibold" title="Double-click to rename" (dblclick)="startRename(track.id)">{{ track.name }}</span>
                    }
                    <span class="flex gap-1 [@media(pointer:coarse)]:gap-0">
                      <button type="button" class="tap-track rounded px-1 [@media(pointer:coarse)]:px-0" [class.opacity-40]="track.hidden" [attr.aria-label]="(track.hidden ? 'Show ' : 'Hide ') + track.name" (click)="toggleTrack(track.id, 'hidden')">👁</button>
                      <button type="button" class="tap-track rounded px-1 [@media(pointer:coarse)]:px-0" [class.opacity-40]="track.muted" [attr.aria-label]="(track.muted ? 'Unmute ' : 'Mute ') + track.name" (click)="toggleTrack(track.id, 'muted')">🔊</button>
                      <button type="button" class="tap rounded px-1" [class.opacity-40]="!track.locked" [attr.aria-label]="(track.locked ? 'Unlock ' : 'Lock ') + track.name" (click)="toggleTrack(track.id, 'locked')">🔒</button>
                    </span>
                  </div>
                  <div class="relative flex-1" [class]="track.locked ? 'bg-[repeating-linear-gradient(45deg,var(--ve-lane)_0_8px,var(--ve-lane-2)_8px_16px)]' : 'bg-[var(--ve-lane)]'" [attr.data-track]="track.id" (pointerdown)="emptyDown($event)" (drop)="dropOnTrack($event, track.id)" (dragover)="$event.preventDefault()">
                    @for (clip of clipsOn(track.id); track clip.id) {
                      <div
                        class="absolute top-1 bottom-1 touch-none overflow-hidden rounded border text-[11px] leading-tight"
                        [class]="clipClass(clip)"
                        [class.ring-2]="selectedIds().includes(clip.id)"
                        [style.left.px]="clip.start * pps()"
                        [style.width.px]="Math.max(4, length(clip) * pps())"
                        role="button"
                        [attr.aria-label]="'Clip ' + clipName(clip)"
                        (pointerdown)="clipDown($event, clip)"
                      >
                        @for (th of clipThumbs(clip); track th.left) {
                          <img [src]="th.url" alt="" class="pointer-events-none absolute top-0 h-full opacity-50" [style.left.px]="th.left" />
                        }
                        @if (waveform(clip); as wave) {
                          <svg class="pointer-events-none absolute inset-0 h-full w-full opacity-60" [attr.viewBox]="'0 0 ' + wave.width + ' 100'" preserveAspectRatio="none" aria-hidden="true"><path [attr.d]="wave.path" fill="currentColor" /></svg>
                        }
                        <span class="pointer-events-none relative block truncate px-2 pt-1 font-semibold">{{ clipName(clip) }}</span>
                        <span class="pointer-events-none relative block truncate px-2 opacity-80">{{ timecodeShort(length(clip)) }}@if ((clip.speed ?? 1) !== 1) { · {{ clip.speed }}× }@if (clip.reverse) { · ⟲ }@if (clip.effects) { · fx }@if (clip.keyframes) { · ◆ }@if (clip.muted) { · 🔇 }@if (clip.caption) { · CC }@if (clip.ramp && clip.ramp.shape !== 'none') { · ramp }</span>
                        @if (clip.transitionIn) {
                          <span class="pointer-events-none absolute top-0 bottom-0 left-0 bg-gradient-to-r from-black/60 to-transparent" [style.width.px]="Math.min(length(clip), clip.transitionIn.duration) * pps()"></span>
                        }
                        @if (clip.transitionOut) {
                          <span class="pointer-events-none absolute top-0 right-0 bottom-0 bg-gradient-to-l from-black/60 to-transparent" [style.width.px]="Math.min(length(clip), clip.transitionOut.duration) * pps()"></span>
                        }
                        <span class="absolute inset-y-0 left-0 w-2 touch-none cursor-ew-resize bg-white/20 [@media(pointer:coarse)]:w-4" [attr.aria-label]="'Trim start of ' + clipName(clip)" (pointerdown)="trimDown($event, clip, 'start')"></span>
                        <span class="absolute inset-y-0 right-0 w-2 touch-none cursor-ew-resize bg-white/20 [@media(pointer:coarse)]:w-4" [attr.aria-label]="'Trim end of ' + clipName(clip)" (pointerdown)="trimDown($event, clip, 'end')"></span>
                      </div>
                    }
                  </div>
                </div>
              }
              @if (!project().clips.length) {
                <p class="pointer-events-none absolute top-14 z-10 text-xs text-[var(--ve-muted)]" [style.left.px]="header() + 12">Your clips appear here. Press ＋ on a file in Project Files to add it.</p>
              }
              <!-- Playhead -->
              <div class="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500" [style.left.px]="header() + time() * pps()">
                <span class="absolute -top-0 -left-1.5 h-3 w-3 rotate-45 bg-red-500"></span>
              </div>
            </div>
          </div>
        </div>
        </fieldset>
      </div>
    </app-tool-page>
  `,
})
export class VideoEditor {
  protected readonly content = CONTENT;
  protected readonly titles = TITLE_PRESETS;
  protected readonly profiles = PROFILES;
  protected readonly ROW = ROW;
  /** Width of the track-name column (narrower on phones). */
  protected readonly header = signal(HEADER);
  protected readonly Math = Math;
  protected readonly timecode = timecode;
  protected readonly formatBytes = formatBytes;
  protected readonly length = clipLength;

  protected readonly project = signal<Project>(newProject());
  protected readonly media = signal<MediaItem[]>([]);
  protected readonly history = signal<{ project: Project; label: string }[]>([]);
  protected readonly future = signal<{ project: Project; label: string }[]>([]);
  protected readonly selectedIds = signal<string[]>([]);
  /** The clip shown in Properties: the last one selected. */
  protected readonly selectedId = computed(() => this.selectedIds().at(-1) ?? null);
  protected readonly clipboard = signal<Clip[]>([]);
  protected readonly tab = signal<'files' | 'transitions' | 'effects' | 'titles' | 'properties' | 'history'>('files');
  protected readonly exportFormats = EXPORT_FORMATS;
  protected readonly exportFormat = signal<ExportFormat>('mp4');
  protected readonly exportQuality = signal<ExportQuality>('high');
  protected readonly titleFonts = TITLE_FONTS;
  protected readonly titleAnimations = TITLE_ANIMATIONS;
  protected fontCss(font: TitleFont | undefined): string {
    return (TITLE_FONTS.find((f) => f.id === font) ?? TITLE_FONTS[0]).css;
  }
  protected readonly speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  protected readonly noTransform = NO_TRANSFORM;
  protected readonly transformFields: { key: KeyProp; label: string; min: number; max: number; step: number }[] = [
    { key: 'x', label: 'Across', min: -0.5, max: 1.5, step: 0.01 },
    { key: 'y', label: 'Down', min: -0.5, max: 1.5, step: 0.01 },
    { key: 'scale', label: 'Size', min: 0.05, max: 4, step: 0.05 },
    { key: 'rotation', label: 'Rotate', min: -180, max: 180, step: 1 },
    { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05 },
  ];
  protected readonly cropFields: { key: 'cropLeft' | 'cropRight' | 'cropTop' | 'cropBottom'; label: string }[] = [
    { key: 'cropLeft', label: 'Crop left' },
    { key: 'cropRight', label: 'Crop right' },
    { key: 'cropTop', label: 'Crop top' },
    { key: 'cropBottom', label: 'Crop bottom' },
  ];
  protected readonly transitions = TRANSITIONS;
  protected readonly effectPresets = EFFECT_PRESETS;
  protected readonly sides: { key: 'in' | 'out'; label: string }[] = [
    { key: 'in', label: 'Start' },
    { key: 'out', label: 'End' },
  ];
  protected readonly effectFields: { key: keyof Effects; label: string; min: number; max: number; step: number; unit: string }[] = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 5, unit: '%' },
    { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 5, unit: '%' },
    { key: 'saturation', label: 'Saturation', min: 0, max: 300, step: 5, unit: '%' },
    { key: 'grayscale', label: 'Black & white', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'invert', label: 'Invert', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'hue', label: 'Hue', min: 0, max: 360, step: 5, unit: '°' },
    { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
    { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'pixelate', label: 'Pixelate', min: 0, max: 40, step: 1, unit: 'px' },
    { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'chroma', label: 'Green screen', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'grain', label: 'Film grain', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'wave', label: 'Wave', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'rgbShift', label: 'Colour shift', min: 0, max: 30, step: 1, unit: 'px' },
  ];
  protected readonly rampShapes = RAMP_SHAPES;
  protected readonly scaleModes = SCALE_MODES;
  protected readonly keyEases = KEY_EASES;
  protected readonly shortcuts = SHORTCUTS;
  protected readonly exportResolutions = EXPORT_RESOLUTIONS;
  protected readonly exportFpsList = EXPORT_FPS;
  protected readonly showExportSettings = signal(false);
  protected readonly showShortcuts = signal(false);
  protected readonly exportResolution = signal<ExportResolution>('project');
  protected readonly exportFps = signal(0);
  protected readonly useRange = signal(false);
  protected readonly rangeStart = signal(0);
  protected readonly rangeEnd = signal(0);
  protected readonly safeZones = signal(false);
  protected readonly levels = signal<[number, number]>([0, 0]);
  protected readonly renaming = signal<number | null>(null);
  protected readonly slideSeconds = signal(3);
  protected readonly slideFade = signal(true);
  protected readonly imageCount = computed(() => this.media().filter((m) => m.kind === 'image').length);
  protected readonly hasCaptions = computed(() => this.project().clips.some((c) => c.caption && c.title));
  protected readonly exportSize = computed(() => outputSize(this.project(), this.exportResolution()));
  protected readonly estimate = computed(() => {
    const project = this.project();
    if (!project.clips.length) return '0 MB';
    const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
    const sound = project.clips.some((c) => !c.muted && !muted.has(c.track) && c.volume > 0 && this.mediaById().get(c.mediaId ?? '')?.hasAudio);
    const bytes = estimateSize(project, this.exportOptions(), sound);
    // The encoder spends fewer bits on calm pictures, so videos show a range.
    return ['mp4', 'webm'].includes(this.exportFormat()) ? `${sizeText(bytes * 0.3)}–${sizeText(bytes)}` : sizeText(bytes);
  });
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
  protected readonly saveState = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  protected readonly otherTab = signal(false);
  /** False until the page has started in the browser: controls wait, so an early click is not lost. */
  protected readonly ready = signal(false);
  /** Deleting a clip closes the gap it leaves (on by default, as phone editors do). */
  protected readonly ripple = signal(true);
  protected lastPointer = '';
  /** Where the pictures (videos, photos, titles) end: music is fitted to this. */
  protected readonly pictureEnd = computed(() => {
    const media = this.mediaById();
    return Math.max(0, ...this.project().clips.filter((c) => !c.audioOnly && (c.title || media.get(c.mediaId ?? '')?.kind !== 'audio')).map(clipEnd));
  });
  /** A short message shown under the toolbar (for example why something could not be done). */
  protected readonly notice = signal('');
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private tell(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 6000);
  }
  protected readonly restoreOffer = signal<{ saved: { project: Project; savedAt: number }; media: MediaItem[] } | null>(null);
  protected readonly ago = ago;
  /** Auto-save waits until any saved project has been restored or discarded. */
  private canSave = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly savedMedia = new Set<string>();

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
  private readonly previewBox = viewChild.required<ElementRef<HTMLElement>>('previewBox');
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly editorRoot = viewChild.required<ElementRef<HTMLElement>>('editorRoot');
  private previewer: Previewer | null = null;
  private drag: Drag | null = null;
  private dragStartProject: Project | null = null;
  private readonly mediaById = computed(() => new Map(this.media().map((m) => [m.id, m])));

  constructor() {
    afterNextRender(() => {
      this.previewer = new Previewer(
        this.previewCanvas().nativeElement,
        (t) => {
          this.time.set(t);
          this.levels.set(this.previewer?.levels() ?? [0, 0]);
        },
        () => {
          this.playing.set(false);
          this.levels.set([0, 0]);
        },
      );
      this.previewer.setProject(this.project(), this.media());
      // Phones show more of the timeline at a time, with a narrower track column.
      if (innerWidth < 640) {
        this.pps.set(30);
        this.header.set(92);
      }
      this.ready.set(true);
      addEventListener('pointermove', this.onMove);
      addEventListener('pointerup', this.onUp);
      void this.checkSaved();
    });
    effect(() => {
      const project = this.project();
      const media = this.media();
      untracked(() => this.scheduleSave(project, media));
    });
    effect(() => {
      const project = this.project();
      const media = this.media();
      untracked(() => this.previewer?.setProject(project, media));
    });
    // The timeline scrolls to keep the playhead in view (after jumps, adding clips and while playing).
    afterRenderEffect(() => {
      const x = this.time() * this.pps();
      const playing = this.playing();
      if (this.drag) return;
      const el = this.scroller().nativeElement;
      const view = el.clientWidth - this.header();
      if (view <= 0) return;
      if (x < el.scrollLeft || x > el.scrollLeft + view - 24) el.scrollLeft = Math.max(0, x - (playing ? 24 : view / 3));
    });
    inject(DestroyRef).onDestroy(() => {
      if (typeof window === 'undefined') return;
      removeEventListener('pointermove', this.onMove);
      removeEventListener('pointerup', this.onUp);
      clearTimeout(this.saveTimer);
      this.releaseLock?.();
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

  // ---------- auto-save ----------
  /**
   * Only one tab saves the project: the first to hold the lock. Another tab shows a warning
   * and can take over, which makes the first tab stop saving.
   */
  private async claimSaving(steal: boolean): Promise<boolean> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return true;
    return new Promise<boolean>((resolve) => {
      locks
        .request('devtools24-video-editor', steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          // Held until the page closes, or until another tab takes it over.
          return new Promise<void>((release) => (this.releaseLock = release));
        })
        .catch(() => {
          // Another tab took the lock over: stop saving here.
          this.canSave = false;
          clearTimeout(this.saveTimer);
          this.otherTab.set(true);
        });
    });
  }
  private releaseLock: (() => void) | null = null;

  protected async useThisTab(): Promise<void> {
    if (!(await this.claimSaving(true))) return;
    this.otherTab.set(false);
    this.canSave = true;
    this.savedMedia.clear();
    this.scheduleSave(this.project(), this.media());
  }

  private async checkSaved(): Promise<void> {
    if (!(await this.claimSaving(false))) {
      this.otherTab.set(true);
      return;
    }
    try {
      const found = await loadProject();
      if (found && !this.media().length && !this.project().clips.length) {
        this.restoreOffer.set(found);
        return;
      }
      if (found) for (const m of found.media) URL.revokeObjectURL(m.url);
    } catch {
      // No storage (private window): the editor still works, it just does not save.
    }
    this.canSave = true;
  }

  protected restore(): void {
    const offer = this.restoreOffer();
    if (!offer) return;
    for (const m of this.media()) URL.revokeObjectURL(m.url);
    this.media.set(offer.media);
    for (const m of offer.media) this.savedMedia.add(m.id);
    this.project.set(offer.saved.project);
    this.history.set([]);
    this.future.set([]);
    for (const m of offer.media) void this.enrich(m);
    this.restoreOffer.set(null);
    this.canSave = true;
    this.saveState.set('saved');
    void this.seek(0);
  }

  protected async discardSaved(): Promise<void> {
    const offer = this.restoreOffer();
    if (offer) for (const m of offer.media) URL.revokeObjectURL(m.url);
    this.restoreOffer.set(null);
    this.savedMedia.clear();
    await clearProject().catch(() => undefined);
    this.canSave = true;
    this.scheduleSave(this.project(), this.media());
  }

  /** Saves a second after the last change, so typing and dragging do not write constantly. */
  private scheduleSave(project: Project, media: readonly MediaItem[]): void {
    if (!this.canSave) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      this.saveState.set('saving');
      try {
        await saveProject(project, media, this.savedMedia);
        this.saveState.set('saved');
      } catch {
        this.saveState.set('failed');
      }
    }, 1000);
  }

  protected removeMedia(id: string): void {
    const used = this.project().clips.some((c) => c.mediaId === id);
    if (used && !confirm('This file is used on the timeline. Remove it and its clips?')) return;
    if (used) this.commit({ ...this.project(), clips: this.project().clips.filter((c) => c.mediaId !== id) });
    const item = this.media().find((m) => m.id === id);
    if (item) URL.revokeObjectURL(item.url);
    this.media.update((list) => list.filter((m) => m.id !== id));
  }

  // ---------- history ----------
  /**
   * Each history entry holds the project as it was before a step, and the step's name.
   * `future` holds undone steps: the project after each, and its name.
   */
  private commit(next: Project, before = this.project(), label = 'Edit'): void {
    if (next === before) return;
    this.history.update((h) => [...h.slice(-99), { project: before, label }]);
    this.future.set([]);
    this.project.set(next);
  }

  protected undo(): void {
    const previous = this.history().at(-1);
    if (!previous) return;
    this.future.update((f) => [{ project: this.project(), label: previous.label }, ...f]);
    this.history.update((h) => h.slice(0, -1));
    this.project.set(previous.project);
  }

  protected redo(): void {
    const next = this.future()[0];
    if (!next) return;
    this.history.update((h) => [...h, { project: this.project(), label: next.label }]);
    this.future.update((f) => f.slice(1));
    this.project.set(next.project);
  }

  /** Goes back so that `steps` history steps remain. */
  protected goToHistory(steps: number): void {
    while (this.history().length > steps) this.undo();
  }

  protected redoTo(index: number): void {
    for (let i = 0; i <= index; i++) this.redo();
  }

  protected change(id: string, change: Partial<Clip>, label = 'Change clip'): void {
    const clip = this.project().clips.find((c) => c.id === id);
    if (clip && this.isLocked(clip.track)) {
      this.tell('This clip is on a locked track. Unlock the track (🔒) to change it.');
      return;
    }
    this.commit(updateClip(this.project(), id, change), this.project(), label);
  }

  /** Tracks that can take new clips, lowest first. */
  private openTracks(): number[] {
    return this.project()
      .tracks.filter((t) => !t.locked && !t.captions)
      .map((t) => t.id)
      .sort((a, b) => a - b);
  }

  private readonly allLocked = 'All tracks are locked. Unlock a track (🔒) or add one with ＋ Track.';

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
    const failed: string[] = [];
    for (const original of files) {
      let url = '';
      try {
        if (original.size > MAX_VIDEO_BYTES) throw new ImportProblem(`over ${formatBytes(MAX_VIDEO_BYTES)}`);
        if (!original.size) throw new ImportProblem('the file is empty');
        if (isPicture(original)) {
          // iPhone (HEIC), TIFF and SVG pictures are turned into PNG so every browser can draw them.
          const file = await readPicture(original);
          const bitmap = await createImageBitmap(file);
          url = URL.createObjectURL(file);
          added.push({ id: makeId('media'), name: original.name, kind: 'image', duration: 0, width: bitmap.width, height: bitmap.height, hasAudio: false, url, file });
          bitmap.close();
        } else {
          if (!isMedia(original)) throw new ImportProblem('not a video, sound or picture');
          const file = original;
          url = URL.createObjectURL(file);
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
        if (url) URL.revokeObjectURL(url);
        failed.push(`${original.name} (${e instanceof ImportProblem ? e.message : 'damaged, or a format this browser cannot open'})`);
      }
    }
    if (failed.length) {
      const message = `Could not import ${failed.length === 1 ? failed[0] : `${failed.length} files: ${failed.join(', ')}`}.`;
      this.error.set(message);
      this.tell(message);
    }
    const first = !this.media().length && added.length > 0;
    this.media.update((list) => [...list, ...added]);
    for (const m of added) void this.enrich(m);
    // Bring the whole editor into view, so the timeline is on screen too.
    if (first) this.editorRoot().nativeElement.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
    if (!id || this.isLocked(track)) return;
    event.preventDefault();
    const media = this.mediaById().get(id);
    if (!media) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const time = Math.max(0, (event.clientX - box.left) / this.pps());
    this.place(media, track, this.snapping() ? snap(this.project(), time, 10 / this.pps(), '', [this.time()]) : time);
  }

  /** Double-click: audio goes on the lowest track, pictures on the lowest track that is free at the playhead. */
  /**
   * ＋ or double-click: videos and photos line up one after another on the lowest track;
   * sounds go on a track of their own under the pictures, starting at the playhead.
   */
  protected addAtPlayhead(media: MediaItem): void {
    const open = this.openTracks();
    if (!open.length) return this.tell(this.allLocked);
    const kinds = this.mediaById();
    const hasPictures = (track: number) => this.project().clips.some((c) => c.track === track && !c.audioOnly && (c.title || kinds.get(c.mediaId ?? '')?.kind !== 'audio'));
    if (media.kind !== 'audio') {
      const track = open.find((t) => hasPictures(t)) ?? open[0];
      this.place(media, track, this.time());
      return;
    }
    // After watching to the end, music still starts with the video, not after it.
    const time = this.pictureEnd() > 0 && this.time() >= this.pictureEnd() - 0.05 ? 0 : this.time();
    const free = (t: number) => !this.project().clips.some((c) => c.track === t && time < clipEnd(c) && time + media.duration > c.start);
    const track = open.find((t) => !hasPictures(t) && free(t)) ?? open.find((t) => !hasPictures(t)) ?? this.freeTrackAt(time, media.duration);
    this.place(media, track, time);
  }

  /** On a phone, one tap on a file adds it (phones have no double-click). */
  protected tapFile(media: MediaItem, event: MouseEvent): void {
    if (this.lastPointer === 'touch' && event.detail <= 1) this.addAtPlayhead(media);
  }

  /** The lowest unlocked track free at `time` for `length` seconds (or the lowest unlocked one). */
  private freeTrackAt(time: number, length: number): number {
    const open = this.openTracks();
    for (const track of open) {
      const busy = this.project().clips.some((c) => c.track === track && time < clipEnd(c) && time + length > c.start);
      if (!busy) return track;
    }
    return open[0] ?? this.project().tracks[0].id;
  }

  private place(media: MediaItem, track: number, time: number): void {
    const { project, clip } = addMediaClip(this.project(), media, track, time);
    this.commit(project, this.project(), `Add ${media.name}`);
    this.selectedIds.set([clip.id]);
    // Show where it went when it landed after other clips.
    if (Math.abs(clip.start - time) > 0.01) void this.seek(clip.start);
  }

  protected addTitle(style: TitleStyle): void {
    const open = this.openTracks();
    if (!open.length) return this.tell(this.allLocked);
    const top = open[open.length - 1];
    const { project, clip } = addTitleClip(this.project(), { ...style }, top, this.time());
    this.commit(project, this.project(), 'Add title');
    this.selectedIds.set([clip.id]);
    this.tab.set('properties');
    // Titles animate in from nothing: show the moment they have settled, so the new title is visible.
    void this.seek(clip.start + Math.min(1.1, clipLength(clip) / 2));
  }

  protected setTitle(clip: Clip, change: Partial<TitleStyle>, save: boolean): void {
    const current = this.project().clips.find((c) => c.id === clip.id);
    if (!current?.title) return;
    const next = updateClip(this.project(), clip.id, { title: { ...current.title, ...change } });
    // Typing updates the preview straight away; the undo step is saved when the field is left.
    if (save) this.commit(next, this.titleEditStart ?? this.project(), 'Edit title');
    else {
      this.titleEditStart ??= this.project();
      this.project.set(next);
    }
    if (save) this.titleEditStart = null;
  }
  private titleEditStart: Project | null = null;

  // ---------- transitions and effects ----------
  protected transitionOf(clip: Clip, side: 'in' | 'out'): Transition | undefined {
    return side === 'in' ? clip.transitionIn : clip.transitionOut;
  }

  protected setTransition(side: 'in' | 'out', type: TransitionType | ''): void {
    const clip = this.selected();
    if (!clip) return;
    const key = side === 'in' ? 'transitionIn' : 'transitionOut';
    const duration = Math.min(1, clipLength(clip) / 2);
    this.change(clip.id, { [key]: type ? { type, duration: clip[key]?.duration ?? duration } : undefined }, type ? 'Add transition' : 'Remove transition');
  }

  protected setTransitionDuration(side: 'in' | 'out', value: number): void {
    const clip = this.selected();
    const key = side === 'in' ? 'transitionIn' : 'transitionOut';
    const current = clip?.[key];
    if (!clip || !current || !Number.isFinite(value) || value <= 0) return;
    this.change(clip.id, { [key]: { ...current, duration: Math.min(value, clipLength(clip)) } });
  }

  protected effectValue(clip: Clip, key: keyof Effects): number {
    return Number((clip.effects ?? NO_EFFECTS)[key] ?? 0);
  }

  protected setChromaColour(clip: Clip, colour: string): void {
    this.change(clip.id, { effects: { ...(clip.effects ?? NO_EFFECTS), chromaColour: colour } }, 'Green screen colour');
  }

  protected applyEffect(effects: Partial<Effects>): void {
    const clip = this.selected();
    if (clip) this.change(clip.id, { effects: { ...NO_EFFECTS, ...effects } }, 'Add effect');
  }

  private effectEditStart: Project | null = null;

  /** Sliders preview while dragging; the undo step is saved when the slider is released. */
  protected setEffect(key: keyof Effects, value: number, save: boolean): void {
    const clip = this.selected();
    if (!clip || !Number.isFinite(value)) return;
    const next = updateClip(this.project(), clip.id, { effects: { ...(clip.effects ?? NO_EFFECTS), [key]: value } });
    if (save) {
      this.commit(next, this.effectEditStart ?? this.project(), 'Change effect');
      this.effectEditStart = null;
    } else {
      this.effectEditStart ??= this.project();
      this.project.set(next);
    }
  }

  protected resetEffects(): void {
    const clip = this.selected();
    if (clip) this.change(clip.id, { effects: undefined });
  }

  protected setStart(clip: Clip, value: number): void {
    if (Number.isFinite(value)) this.change(clip.id, { start: Math.max(0, value) });
  }

  protected setLength(clip: Clip, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.commit(trimClip(this.project(), clip.id, 'end', clip.start + value, this.sourceLength(clip)), this.project(), 'Change length');
  }

  // ---------- project ----------
  protected newProjectClick(): void {
    if (this.project().clips.length && !confirm('Start a new project? The timeline will be cleared.')) return;
    this.commit({ ...newProject(), width: this.project().width, height: this.project().height });
    this.selectedIds.set([]);
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

  protected toggleTrack(id: number, field: 'muted' | 'hidden' | 'locked'): void {
    this.commit({ ...this.project(), tracks: this.project().tracks.map((t) => (t.id === id ? { ...t, [field]: !t[field] } : t)) }, this.project(), `Track ${field === 'locked' ? 'lock' : field === 'muted' ? 'mute' : 'hide'}`);
  }

  protected isLocked(track: number): boolean {
    return !!this.project().tracks.find((t) => t.id === track)?.locked;
  }

  // ---------- playback ----------
  protected togglePlay(): void {
    if (!this.previewer) return;
    if (this.previewer.isPlaying) {
      this.previewer.pause();
      this.playing.set(false);
      this.levels.set([0, 0]);
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
    const chosen = this.selected();
    if (chosen && !this.isLocked(chosen.track)) {
      const t = this.time();
      if (t <= chosen.start || t >= clipEnd(chosen)) {
        // Cutting some other clip would be a surprise: say what to do instead.
        return this.tell('The playhead is not over the selected clip. Move the playhead onto it, or click an empty spot on the timeline first to cut every track.');
      }
    }
    const id = chosen && !this.isLocked(chosen.track) ? chosen.id : null;
    const next = id ? splitClip(this.project(), id, this.time()) : splitAll(this.project(), this.time());
    this.commit(next === this.project() && id ? splitAll(this.project(), this.time()) : next, this.project(), 'Split');
  }

  protected deleteSelected(): void {
    const ids = this.selectedIds().filter((id) => !this.isLocked(this.project().clips.find((c) => c.id === id)?.track ?? -1));
    if (!ids.length) return;
    const media = this.mediaById();
    const isPicture = (c: Clip) => !c.title && !c.audioOnly && media.get(c.mediaId ?? '')?.kind !== 'audio';
    const next = this.ripple() ? rippleDelete(this.project(), ids, isPicture) : ids.reduce((p, id) => removeClip(p, id), this.project());
    this.commit(next, this.project(), ids.length > 1 ? `Delete ${ids.length} clips` : 'Delete clip');
    this.selectedIds.set([]);
  }

  protected copy(): void {
    this.clipboard.set(this.project().clips.filter((c) => this.selectedIds().includes(c.id)));
  }

  protected paste(at = this.time()): void {
    const open = this.openTracks();
    const captionTracks = new Set(this.project().tracks.filter((t) => t.captions && !t.locked).map((t) => t.id));
    // Clips from a locked track go to the nearest unlocked one.
    const clips = this.clipboard().map((c) => {
      if (!this.isLocked(c.track) && this.project().tracks.some((t) => t.id === c.track)) return c;
      const near = c.caption && captionTracks.size ? [...captionTracks][0] : open.reduce((best, t) => (Math.abs(t - c.track) < Math.abs(best - c.track) ? t : best), open[0]);
      return near === undefined ? null : { ...c, track: near };
    });
    if (clips.some((c) => !c)) return this.tell(this.allLocked);
    const { project, ids } = pasteClips(this.project(), clips as Clip[], at);
    this.commit(project, this.project(), ids.length > 1 ? `Paste ${ids.length} clips` : 'Paste clip');
    this.selectedIds.set(ids);
  }

  protected toggleMarker(): void {
    const t = this.time();
    const exists = (this.project().markers ?? []).some((m) => Math.abs(m - t) <= 0.05);
    this.commit(exists ? removeMarker(this.project(), t) : addMarker(this.project(), t), this.project(), exists ? 'Remove marker' : 'Add marker');
  }

  protected removeMarkerAt(time: number): void {
    this.commit(removeMarker(this.project(), time), this.project(), 'Remove marker');
  }

  protected fullscreen(): void {
    const box = this.previewBox().nativeElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen?.().catch(() => undefined);
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
    } else if (mod && event.key.toLowerCase() === 'c') {
      if (this.selectedIds().length) {
        event.preventDefault();
        this.copy();
      }
    } else if (mod && event.key.toLowerCase() === 'v') {
      if (this.clipboard().length) {
        event.preventDefault();
        this.paste();
      }
    } else if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      const chosen = this.project().clips.filter((c) => this.selectedIds().includes(c.id));
      if (chosen.length) {
        this.clipboard.set(chosen);
        this.paste(Math.max(...chosen.map((c) => clipEnd(c))));
      }
    } else if (!mod && event.key.toLowerCase() === 'm') {
      this.toggleMarker();
    } else if (!mod && (event.key.toLowerCase() === 's' || event.key.toLowerCase() === 'c')) {
      this.splitAtPlayhead();
    } else if (event.key === 'Escape') {
      this.showShortcuts.set(false);
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
    return Math.max(0, (clientX - box.left - this.header() + this.scroller().nativeElement.scrollLeft) / this.pps());
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
    this.selectedIds.set([]);
    // A finger on an empty track scrolls the timeline; moving the playhead is done on the ruler.
    if (event.pointerType === 'touch') return;
    this.scrubStart(event);
  }

  protected clipDown(event: PointerEvent, clip: Clip): void {
    event.stopPropagation();
    event.preventDefault();
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      // Add to or remove from the selection; no drag.
      this.selectedIds.update((ids) => (ids.includes(clip.id) ? ids.filter((i) => i !== clip.id) : [...ids, clip.id]));
      return;
    }
    const group = clip.group ? this.project().clips.filter((c) => c.group === clip.group).map((c) => c.id) : [clip.id];
    if (!this.selectedIds().includes(clip.id)) this.selectedIds.set([...group.filter((i) => i !== clip.id), clip.id]);
    else this.selectedIds.update((ids) => [...ids.filter((i) => i !== clip.id), clip.id]);
    if (this.isLocked(clip.track)) return;
    this.dragStartProject = this.project();
    this.drag = { kind: 'move', id: clip.id, grabOffset: this.timeAt(event.clientX) - clip.start, pointer: event.pointerId };
  }

  protected trimDown(event: PointerEvent, clip: Clip, edge: 'start' | 'end'): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedIds.set([clip.id]);
    if (this.isLocked(clip.track)) return;
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
      // Clips on locked tracks stay where they are.
      const others = this.selectedIds().filter((id) => id !== clip.id && !this.isLocked(base.clips.find((c) => c.id === id)?.track ?? -1));
      if (others.length) {
        // Several clips move together, keeping their tracks.
        this.project.set(moveClips(base, [clip.id, ...others], start - clip.start));
        return;
      }
      const target = this.trackAt(event.clientY) ?? clip.track;
      const track = this.isLocked(target) ? clip.track : target;
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
      if (after !== this.dragStartProject) this.commit(after, this.dragStartProject, drag.kind === 'move' ? 'Move' : 'Trim');
      this.dragStartProject = null;
      void this.previewer?.seek(this.time());
    }
  };

  // ---------- export ----------
  protected async exportVideo(): Promise<void> {
    if (this.exporting()) return;
    if (this.useRange() && this.rangeEnd() <= this.rangeStart()) {
      this.error.set('In "Only a part", To must be after From.');
      this.tab.set('files');
      return;
    }
    this.previewer?.pause();
    this.playing.set(false);
    this.exporting.set(true);
    this.exported.set(null);
    this.error.set('');
    this.exportAbort = new AbortController();
    try {
      const { blob, extension } = await exportProject(
        this.project(),
        this.media(),
        (fraction, stage) => {
          this.exportPercent.set(Math.round(fraction * 100));
          this.exportStage.set(stage);
        },
        { ...this.exportOptions(), signal: this.exportAbort.signal },
      );
      this.exported.set({ blob, name: this.exportName(extension) });
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'The video could not be exported.';
      if (message !== CANCELLED) {
        this.error.set(message);
        this.tab.set('files');
      }
    } finally {
      this.exporting.set(false);
      this.exportAbort = null;
    }
  }

  private exportAbort: AbortController | null = null;

  protected cancelExport(): void {
    this.exportAbort?.abort();
  }

  /** "Only a part" starts as the whole timeline, so the boxes never show a meaningless 0 to 0. */
  protected setUseRange(on: boolean): void {
    if (on && this.rangeEnd() <= this.rangeStart()) {
      this.rangeStart.set(0);
      this.rangeEnd.set(Math.round(this.duration() * 100) / 100);
    }
    this.useRange.set(on);
  }

  protected exportOptions() {
    const range = this.useRange() ? { start: this.rangeStart(), end: Math.max(this.rangeStart(), this.rangeEnd()) } : undefined;
    return { format: this.exportFormat(), quality: this.exportQuality(), resolution: this.exportResolution(), fps: this.exportFps() || undefined, range };
  }

  protected setResolution(value: string): void {
    this.exportResolution.set(value === 'project' ? 'project' : (Number(value) as ExportResolution));
  }

  protected rangeFromPlayhead(edge: 'start' | 'end'): void {
    if (edge === 'start') this.rangeStart.set(this.time());
    else this.rangeEnd.set(this.time());
  }

  /** Files are named after the first file on the timeline (not just the first one imported). */
  private exportName(extension: string, suffix = 'edit'): string {
    const used = [...this.project().clips].sort((a, b) => a.start - b.start || a.track - b.track).find((c) => c.mediaId && this.mediaById().has(c.mediaId));
    const first = used ? this.mediaById().get(used.mediaId!) : undefined;
    return `${first ? baseName(first.name) : 'video'}-${suffix}.${extension}`;
  }

  protected async saveFrame(type: 'png' | 'jpg'): Promise<void> {
    try {
      const blob = await exportFrame(this.project(), this.media(), this.time(), type);
      downloadBlob(blob, this.exportName(type, `frame-${this.time().toFixed(2)}s`));
    } catch {
      this.error.set('The frame could not be saved.');
      this.tab.set('files');
    }
  }

  protected saveSrt(): void {
    const cues = projectCues(this.project());
    if (cues.length) downloadBlob(new Blob([toSrt(cues)], { type: 'application/x-subrip' }), this.exportName('srt', 'subtitles'));
  }

  protected saveEdl(): void {
    downloadBlob(new Blob([toEdl(this.project(), this.media())], { type: 'text/plain' }), this.exportName('edl', 'timeline'));
  }

  protected saveXml(): void {
    downloadBlob(new Blob([toFcpXml(this.project(), this.media())], { type: 'application/xml' }), this.exportName('xml', 'timeline'));
  }

  // ---------- captions ----------
  protected addCaption(): void {
    if (captionsLocked(this.project())) return this.tell('The Captions track is locked. Unlock it (🔒) to add captions.');
    const { project, ids } = addCues(this.project(), [{ start: this.time(), end: this.time() + 3, text: 'Caption text' }], 0, true);
    this.commit(project, this.project(), 'Add caption');
    this.selectedIds.set(ids);
    this.tab.set('properties');
  }

  protected async importSrt(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    const cues = parseSrt(await file.text());
    if (!cues.length) {
      this.error.set('No subtitle lines were found in this file. Choose an .srt file.');
      this.tab.set('files');
      return;
    }
    if (captionsLocked(this.project())) return this.tell('The Captions track is locked. Unlock it (🔒) to add captions.');
    const { project, ids } = addCues(this.project(), cues);
    this.commit(project, this.project(), `Import ${cues.length} captions`);
    this.selectedIds.set(ids.slice(0, 1));
  }

  // ---------- slideshow, tracks, background ----------
  protected makeSlideshow(): void {
    const images = this.media().filter((m) => m.kind === 'image');
    if (!images.length) return;
    const track = this.openTracks()[0];
    if (track === undefined) return this.tell(this.allLocked);
    const { project, ids } = slideshow(this.project(), images, track, this.time(), this.slideSeconds(), this.slideFade());
    this.commit(project, this.project(), 'Slideshow');
    this.selectedIds.set(ids);
  }

  protected startRename(id: number): void {
    this.renaming.set(id);
    setTimeout(() => {
      const input = this.scroller().nativeElement.querySelector<HTMLInputElement>('input[aria-label^="Rename"]');
      input?.focus();
      input?.select();
    });
  }

  protected finishRename(id: number, name: string): void {
    if (this.renaming() !== id) return;
    this.renaming.set(null);
    this.commit(renameTrack(this.project(), id, name), this.project(), 'Rename track');
  }

  protected setBackground(kind: Background['kind'], colour?: string): void {
    const background: Background | undefined = kind === 'black' ? undefined : { kind, colour: colour ?? this.project().background?.colour ?? '#1e293b' };
    this.commit({ ...this.project(), background }, this.project(), 'Empty space');
  }

  protected stepFrame(direction: 1 | -1): void {
    const fps = this.project().fps;
    void this.seek(Math.round(this.time() * fps + direction) / fps);
  }

  // ---------- ramps, scale, curves, mirror ----------
  protected setRamp(clip: Clip, shape: RampShape, amount: number): void {
    this.change(clip.id, { ramp: shape === 'none' ? undefined : { shape, amount } }, 'Speed ramp');
  }

  protected setScaleMode(clip: Clip, fit: ScaleMode): void {
    this.change(clip.id, { transform: { ...(clip.transform ?? NO_TRANSFORM), fit: fit === 'fit' ? undefined : fit } }, 'Scale mode');
  }

  protected keyEaseOf(clip: Clip): KeyEase {
    return keyframeEase(clip);
  }

  protected setKeyEase(clip: Clip, kind: KeyEase): void {
    this.change(clip.id, { keyframes: easeKeyframes(clip, kind) }, 'Keyframe curve');
  }

  /** Effects a clip can show: titles are drawn as text, so only the colour, blur and opacity effects apply. */
  protected effectFieldsFor(clip: Clip) {
    return clip.title ? this.effectFields.filter((f) => TITLE_EFFECTS.has(f.key)) : this.effectFields;
  }

  /**
   * After a dropdown, tick box or slider is used with the mouse, focus goes back to the page so
   * shortcuts (Space, S, Delete…) work again. Keyboard users keep their place.
   */
  protected releaseFocus(event: Event): void {
    const target = event.target as HTMLElement;
    if (document.documentElement.dataset['input'] !== 'pointer') return;
    if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && ['checkbox', 'range', 'color'].includes(target.type))) target.blur();
  }

  protected fadeOf(clip: Clip, side: 'in' | 'out'): number {
    const t = side === 'in' ? clip.transitionIn : clip.transitionOut;
    return t?.type === 'fade' ? Math.round(t.duration * 10) / 10 : 0;
  }

  /** Fade in / out in seconds (0 removes it): a fade transition, which fades the sound and the picture. */
  protected setFade(clip: Clip, side: 'in' | 'out', seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const key = side === 'in' ? 'transitionIn' : 'transitionOut';
    const value = seconds > 0 ? { type: 'fade' as const, duration: Math.min(seconds, clipLength(clip)) } : undefined;
    this.change(clip.id, { [key]: value }, side === 'in' ? 'Fade in' : 'Fade out');
  }

  protected fitToVideo(clip: Clip): void {
    if (this.isLocked(clip.track)) return this.tell('This clip is on a locked track. Unlock the track (🔒) to change it.');
    const length = this.sourceLength(clip) ?? clipLength(clip);
    const { project, ids } = fitAudio(this.project(), clip.id, this.pictureEnd(), length);
    this.commit(project, this.project(), 'Fit music to video');
    this.selectedIds.set(ids.slice(-1));
  }

  protected setMirror(clip: Clip, on: boolean): void {
    this.change(clip.id, { effects: { ...(clip.effects ?? NO_EFFECTS), mirror: on || undefined } }, 'Mirror');
  }

  protected downloadExport(): void {
    const e = this.exported();
    if (e) downloadBlob(e.blob, e.name);
  }

  // ---------- thumbnails and waveforms ----------
  /** Makes the timeline pictures and waveform for a file in the background. */
  private async enrich(item: MediaItem): Promise<void> {
    try {
      const extra: Partial<MediaItem> = {};
      if (item.kind === 'video') extra.thumbs = await thumbnails(item.file, item.duration);
      if (item.hasAudio) extra.peaks = await peaks(item.file);
      this.media.update((list) => list.map((m) => (m.id === item.id ? { ...m, ...extra } : m)));
    } catch {
      // Pictures and waveforms are a nice extra; editing works without them.
    }
  }

  protected clipThumbs(clip: Clip): { left: number; url: string }[] {
    const item = clip.mediaId ? this.mediaById().get(clip.mediaId) : undefined;
    if (!item?.thumbs?.length || clip.audioOnly) return [];
    const out: { left: number; url: string }[] = [];
    let last = -Infinity;
    for (const th of item.thumbs) {
      if (th.t < clip.in - 0.01 || th.t > clip.out) continue;
      // Where on the timeline this picture shows (speed, reverse and ramps included).
      const left = (timelineTime(clip, th.t) - clip.start) * this.pps();
      // Keep pictures at least a thumbnail apart.
      if (Math.abs(left - last) < 90) continue;
      last = left;
      out.push({ left, url: th.url });
    }
    return out;
  }

  /** An SVG path of the clip's loudness, mirrored around the middle, or null for clips without sound shown. */
  protected waveform(clip: Clip): { width: number; path: string } | null {
    const item = clip.mediaId ? this.mediaById().get(clip.mediaId) : undefined;
    if (!item?.peaks?.length || clip.muted || (item.kind === 'video' && !clip.audioOnly)) return null;
    const width = Math.max(1, Math.round(clipLength(clip) * this.pps()));
    const points = Math.min(width, 400);
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const t = sourceTime(clip, clip.start + (i / points) * clipLength(clip));
      const peak = item.peaks[Math.min(item.peaks.length - 1, Math.max(0, Math.floor(t * 20)))] ?? 0;
      const h = Math.max(1, peak * 45);
      top.push(`${x.toFixed(1)},${(50 - h).toFixed(1)}`);
      bottom.push(`${x.toFixed(1)},${(50 + h).toFixed(1)}`);
    }
    return { width, path: `M${top.join('L')}L${bottom.reverse().join('L')}Z` };
  }

  // ---------- clip kinds ----------
  protected isVideo(clip: Clip): boolean {
    return !clip.audioOnly && this.mediaById().get(clip.mediaId ?? '')?.kind === 'video';
  }

  protected isAudioMedia(clip: Clip): boolean {
    return this.mediaById().get(clip.mediaId ?? '')?.kind === 'audio';
  }

  /** Clips whose length comes from a source and so can change speed. */
  protected isTimed(clip: Clip): boolean {
    const kind = this.mediaById().get(clip.mediaId ?? '')?.kind;
    return kind === 'video' || kind === 'audio';
  }

  protected canSeparate(clip: Clip): boolean {
    return this.isVideo(clip) && this.hasSound(clip) && !clip.muted;
  }

  // ---------- speed, sound, transform ----------
  protected setSpeed(clip: Clip, speed: number): void {
    this.change(clip.id, speedChange(clip, speed), `Speed ${speed}×`);
  }

  protected audioFx(clip: Clip): AudioFx {
    return clip.audio ?? NO_AUDIO_FX;
  }

  protected setAudioFx(clip: Clip, change: Partial<AudioFx>): void {
    this.change(clip.id, { audio: { ...this.audioFx(clip), ...change } }, 'Sound effect');
  }

  protected transformValue(clip: Clip, key: KeyProp): number {
    const now = this.time();
    const inside = now >= clip.start && now <= clipEnd(clip);
    return transformAt(clip, inside ? now : clip.start)[key];
  }

  protected hasKeyframeHere(clip: Clip, key: KeyProp): boolean {
    const t = this.time() - clip.start;
    return !!clip.keyframes?.[key]?.some((f) => Math.abs(f.t - t) <= 1 / 60);
  }

  private transformEditStart: Project | null = null;

  /** With keyframes, a slider sets the keyframe at the playhead; without, it sets the clip's value. */
  protected setTransformValue(clip: Clip, key: KeyProp, value: number, save: boolean): void {
    if (!Number.isFinite(value)) return;
    const current = this.project().clips.find((c) => c.id === clip.id);
    if (!current) return;
    let change: Partial<Clip>;
    if (current.keyframes?.[key]?.length) {
      const t = Math.min(Math.max(0, this.time() - current.start), clipLength(current));
      change = { keyframes: setKeyframe(current, key, t, value) };
    } else if (key === 'opacity') {
      change = { effects: { ...(current.effects ?? NO_EFFECTS), opacity: Math.round(value * 100) } };
    } else {
      change = { transform: { ...(current.transform ?? NO_TRANSFORM), [key]: value } };
    }
    const next = updateClip(this.project(), clip.id, change);
    if (save) {
      this.commit(next, this.transformEditStart ?? this.project(), 'Transform');
      this.transformEditStart = null;
    } else {
      this.transformEditStart ??= this.project();
      this.project.set(next);
    }
  }

  protected toggleKeyframe(clip: Clip, key: KeyProp): void {
    const t = Math.min(Math.max(0, this.time() - clip.start), clipLength(clip));
    const keyframes = this.hasKeyframeHere(clip, key) ? removeKeyframe(clip, key, t) : setKeyframe(clip, key, t, this.transformValue(clip, key));
    const empty = Object.values(keyframes).every((list) => !list?.length);
    this.change(clip.id, { keyframes: empty ? undefined : keyframes }, 'Keyframe');
  }

  protected setCrop(clip: Clip, key: keyof Transform, value: number): void {
    this.change(clip.id, { transform: { ...(clip.transform ?? NO_TRANSFORM), [key]: value } }, 'Crop');
  }

  protected resetTransform(clip: Clip): void {
    this.change(clip.id, { transform: undefined, keyframes: undefined }, 'Reset transform');
  }

  // ---------- separate audio, freeze frame ----------
  protected separate(clip: Clip): void {
    if (this.isLocked(clip.track)) return this.tell('This clip is on a locked track. Unlock the track (🔒) to change it.');
    const target = this.openTracks().find((t) => t !== clip.track && !this.project().clips.some((c) => c.track === t && clip.start < clipEnd(c) && clipEnd(clip) > c.start));
    if (target === undefined) return this.tell('There is no free unlocked track for the sound. Add one with ＋ Track.');
    this.commit(separateAudio(this.project(), clip.id, target), this.project(), 'Separate audio');
  }

  /** Takes the picture at the playhead and adds it as a 3-second still above the clip. */
  protected async freezeFrame(clip: Clip): Promise<void> {
    const item = this.mediaById().get(clip.mediaId ?? '');
    if (!item) return;
    const at = Math.min(Math.max(this.time(), clip.start), clipEnd(clip) - 0.01);
    try {
      const mb = await import('mediabunny');
      const input = await openMedia(item.file);
      try {
        const track = await input.getPrimaryVideoTrack();
        const sample = track ? await new mb.VideoSampleSink(track).getSample(sourceTime(clip, at)) : null;
        if (!sample) throw new Error('no frame');
        const canvas = document.createElement('canvas');
        canvas.width = sample.displayWidth;
        canvas.height = sample.displayHeight;
        sample.draw(canvas.getContext('2d')!, 0, 0);
        sample.close();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('no frame');
        const file = new File([blob], `${baseName(item.name)}-frame-${at.toFixed(1)}s.png`, { type: 'image/png' });
        const still: MediaItem = { id: makeId('media'), name: file.name, kind: 'image', duration: 0, width: canvas.width, height: canvas.height, hasAudio: false, url: URL.createObjectURL(file), file };
        this.media.update((list) => [...list, still]);
        const above = this.openTracks().filter((id) => id > clip.track);
        const stillTrack = above.find((id) => !this.project().clips.some((c) => c.track === id && at < clipEnd(c) && at + 3 > c.start)) ?? above[0];
        if (stillTrack === undefined) throw new Error('There is no unlocked track above this clip for the still. Add one with ＋ Track.');
        const placed = addMediaClip(this.project(), still, stillTrack, at);
        const added = placed.clip;
        this.commit(updateClip(placed.project, added.id, { out: 3 }), this.project(), 'Freeze frame');
        this.selectedIds.set([added.id]);
      } finally {
        input.dispose();
      }
    } catch (e) {
      this.tell(e instanceof Error && e.message.startsWith('There is') ? e.message : 'The frame could not be captured.');
    }
  }

  // ---------- project files ----------
  protected async saveProjectZip(): Promise<void> {
    try {
      downloadBlob(await saveProjectFile(this.project(), this.media()), 'video-project.zip');
    } catch {
      this.error.set('The project could not be saved.');
      this.tab.set('files');
    }
  }

  protected async openProjectZip(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    if (this.project().clips.length && !confirm('Open this project? The current timeline will be replaced.')) return;
    try {
      const { project, media } = await openProjectFile(file);
      for (const m of this.media()) URL.revokeObjectURL(m.url);
      this.media.set(media);
      this.commit(project, this.project(), 'Open project');
      this.selectedIds.set([]);
      for (const m of media) void this.enrich(m);
      void this.seek(0);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'The project could not be opened.');
      this.tab.set('files');
    }
  }
}
