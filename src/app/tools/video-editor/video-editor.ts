import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { baseName, downloadBlob, formatBytes } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { MAX_VIDEO_BYTES, describe, openMedia, peaks, thumbnails } from '../video/media';
import { ago, clearProject, loadProject, saveProject } from './autosave';
import { EXPORT_FORMATS, ExportFormat, ExportQuality, exportProject } from './export';
import { openProjectFile, saveProjectFile } from './project-file';
import {
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
          <button type="button" class="tool" (click)="saveProjectZip()">💾 Save project</button>
          <button type="button" class="tool" (click)="projectInput.click()">📁 Open project</button>
          <input #projectInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept=".zip,application/zip" (change)="openProjectZip(projectInput)" />
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
          <span class="mr-2 text-xs text-[#9aa0ab]" role="status" aria-label="Save status">
            @switch (saveState()) {
              @case ('saving') { Saving… }
              @case ('saved') { ✓ Saved in this browser }
              @case ('failed') { <span class="text-red-400">Not saved: browser storage is full</span> }
            }
          </span>
          <select class="input" aria-label="Export format" [disabled]="exporting()" (change)="exportFormat.set($any($event.target).value)">
            @for (f of exportFormats; track f.id) { <option [value]="f.id" [selected]="f.id === exportFormat()">{{ f.label }}</option> }
          </select>
          <select class="input" aria-label="Export quality" [disabled]="exporting()" (change)="exportQuality.set($any($event.target).value)">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high" selected>High</option>
            <option value="very-high">Very high</option>
          </select>
          <button type="button" class="tool !bg-[#6d83f2] !text-white" [disabled]="exporting() || !project().clips.length" (click)="exportVideo()">⬇ Export video</button>
        </div>
        @if (restoreOffer(); as offer) {
          <div class="flex flex-wrap items-center gap-2 border-b border-[#343842] bg-[#2a2f3c] px-3 py-2 text-sm" role="alert">
            <span>You have a project saved {{ ago(offer.saved.savedAt) }} ({{ offer.saved.project.clips.length }} clips, {{ offer.media.length }} files).</span>
            <button type="button" class="tool !bg-[#6d83f2] !text-white" (click)="restore()">Restore it</button>
            <button type="button" class="tool" (click)="discardSaved()">Start fresh</button>
          </div>
        }

        <div class="grid gap-1 p-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <!-- Left: project files / titles / properties -->
          <div class="panel flex min-h-72 flex-col rounded lg:max-h-[34rem]">
            <div class="flex border-b border-[#343842]" role="tablist" aria-label="Panels">
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
                          <p class="mt-1 flex items-center justify-between gap-1"><span class="truncate">{{ m.name }}</span>
                            <button type="button" class="rounded px-1 text-[#9aa0ab] hover:bg-[#343842] hover:text-white" [attr.aria-label]="'Remove ' + m.name + ' from the project'" (click)="removeMedia(m.id)">✕</button>
                          </p>
                          <p class="text-[#9aa0ab]">{{ m.kind === 'image' ? 'Image' : timecodeShort(m.duration) }}</p>
                        </li>
                      }
                    </ul>
                  }
                  @if (importing()) { <p class="mt-2 text-xs text-[#9aa0ab]" role="status">Importing…</p> }
                  @if (error()) { <p class="mt-2 text-xs text-red-400" role="alert">{{ error() }}</p> }
                }
                @case ('transitions') {
                  <p class="mb-2 text-xs text-[#9aa0ab]">{{ selected() ? 'Add to the selected clip: ' + clipName(selected()!) : 'Select a clip on the timeline first.' }}</p>
                  <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Transitions">
                    @for (t of transitions; track t.type) {
                      <li class="rounded border border-[#343842] bg-[#1b1d23] p-2 text-center text-xs">
                        <div class="grid aspect-video place-items-center rounded bg-gradient-to-r from-[#111] to-[#6d83f2] text-2xl">{{ t.icon }}</div>
                        <p class="mt-1 font-semibold">{{ t.label }}</p>
                        <span class="mt-1 flex justify-center gap-1">
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!selected()" [attr.aria-label]="t.label + ' at start'" (click)="setTransition('in', t.type)">Start</button>
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!selected()" [attr.aria-label]="t.label + ' at end'" (click)="setTransition('out', t.type)">End</button>
                        </span>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[#9aa0ab]">Tip: overlap two clips on different tracks and fade the upper one in for a cross-fade.</p>
                }
                @case ('effects') {
                  <p class="mb-2 text-xs text-[#9aa0ab]">{{ selected() ? 'Apply to the selected clip: ' + clipName(selected()!) : 'Select a clip on the timeline first.' }}</p>
                  <ul class="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Effects">
                    @for (e of effectPresets; track e.name) {
                      <li>
                        <button type="button" class="w-full rounded border border-[#343842] bg-[#1b1d23] p-2 text-center text-xs hover:border-[#6d83f2] disabled:opacity-40" [disabled]="!selected()" (click)="applyEffect(e.effects)">
                          <div class="text-2xl">{{ e.icon }}</div>
                          {{ e.name }}
                        </button>
                      </li>
                    }
                  </ul>
                  <p class="mt-2 text-xs text-[#9aa0ab]">Fine-tune every effect in Properties.</p>
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
                @case ('history') {
                  <ol class="flex flex-col gap-0.5 text-xs" aria-label="History">
                    <li><button type="button" class="w-full rounded px-2 py-1 text-left hover:bg-[#343842]" [class.text-[#9aa0ab]]="history().length > 0" (click)="goToHistory(0)">Start</button></li>
                    @for (h of history(); track $index; let i = $index) {
                      <li><button type="button" class="w-full rounded px-2 py-1 text-left hover:bg-[#343842]" (click)="goToHistory(i + 1)">{{ i + 1 }}. {{ h.label }}</button></li>
                    }
                    @for (f of future(); track $index; let i = $index) {
                      <li><button type="button" class="w-full rounded px-2 py-1 text-left text-[#6b7280] line-through hover:bg-[#343842]" (click)="redoTo(i)">{{ f.label }}</button></li>
                    }
                  </ol>
                  <p class="mt-2 text-xs text-[#9aa0ab]">Click a step to go back to it. Crossed-out steps can be redone.</p>
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
                      @if (isTimed(clip)) {
                        <label class="flex items-center justify-between gap-2">Speed
                          <select class="input" aria-label="Clip speed" (change)="setSpeed(clip, +$any($event.target).value)">
                            @for (sp of speeds; track sp) { <option [value]="sp" [selected]="(clip.speed ?? 1) === sp">{{ sp }}×</option> }
                          </select>
                        </label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Play backwards" [checked]="!!clip.reverse" (change)="change(clip.id, { reverse: $any($event.target).checked }, 'Reverse')" /> Play backwards (reverse)</label>
                      }
                      @if (hasSound(clip) && !clip.muted) {
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
                      @if (hasSound(clip) && !clip.muted) {
                        <p class="mt-2 font-semibold text-white">Sound effects</p>
                        <label class="flex items-center justify-between gap-2">Echo {{ Math.round(audioFx(clip).echo * 100) }}%
                          <input type="range" min="0" max="1" step="0.05" class="w-32" aria-label="Echo" [value]="audioFx(clip).echo" (change)="setAudioFx(clip, { echo: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Bass {{ audioFx(clip).bass }} dB
                          <input type="range" min="-12" max="12" step="1" class="w-32" aria-label="Bass" [value]="audioFx(clip).bass" (change)="setAudioFx(clip, { bass: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center justify-between gap-2">Treble {{ audioFx(clip).treble }} dB
                          <input type="range" min="-12" max="12" step="1" class="w-32" aria-label="Treble" [value]="audioFx(clip).treble" (change)="setAudioFx(clip, { treble: $any($event.target).valueAsNumber })" />
                        </label>
                        <label class="flex items-center gap-2"><input type="checkbox" aria-label="Clean up voice" [checked]="audioFx(clip).clean" (change)="setAudioFx(clip, { clean: $any($event.target).checked })" /> Clean up voice (cut rumble and hiss)</label>
                      }
                      @if (!clip.audioOnly && !isAudioMedia(clip)) {
                        <p class="mt-2 flex items-center justify-between font-semibold text-white">Transform
                          <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!clip.transform && !clip.keyframes" (click)="resetTransform(clip)">Reset</button>
                        </p>
                        <p class="text-[#9aa0ab]">◆ adds a keyframe at the playhead, so the value can change over time.</p>
                        @for (f of transformFields; track f.key) {
                          <div class="flex items-center justify-between gap-2">
                            <span>{{ f.label }} {{ round(transformValue(clip, f.key)) }}</span>
                            <span class="flex items-center gap-1">
                              <input type="range" class="w-28" [min]="f.min" [max]="f.max" [step]="f.step" [attr.aria-label]="'Transform ' + f.label" [value]="transformValue(clip, f.key)" (input)="setTransformValue(clip, f.key, $any($event.target).valueAsNumber, false)" (change)="setTransformValue(clip, f.key, $any($event.target).valueAsNumber, true)" />
                              <button type="button" class="rounded px-1" [class.text-amber-300]="hasKeyframeHere(clip, f.key)" [attr.aria-label]="'Keyframe ' + f.label" (click)="toggleKeyframe(clip, f.key)">◆</button>
                              <span class="w-4 text-[10px] text-[#9aa0ab]">{{ clip.keyframes?.[f.key]?.length || '' }}</span>
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
                      <p class="mt-2 font-semibold text-white">Transitions</p>
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
                      <p class="mt-2 flex items-center justify-between font-semibold text-white">Effects
                        <button type="button" class="tool !px-1.5 !py-0.5" [disabled]="!clip.effects" (click)="resetEffects()">Reset</button>
                      </p>
                      @if (effectValue(clip, 'chroma')) {
                        <label class="flex items-center justify-between gap-2">Green screen colour
                          <input type="color" class="h-6 w-10" aria-label="Green screen colour" [value]="clip.effects?.chromaColour ?? '#00ff00'" (change)="setChromaColour(clip, $any($event.target).value)" />
                        </label>
                      }
                      @for (f of effectFields; track f.key) {
                        <label class="flex items-center justify-between gap-2">{{ f.label }} {{ effectValue(clip, f.key) }}{{ f.unit }}
                          <input type="range" class="w-32" [min]="f.min" [max]="f.max" [step]="f.step" [attr.aria-label]="'Effect ' + f.label" [value]="effectValue(clip, f.key)" (input)="setEffect(f.key, $any($event.target).valueAsNumber, false)" (change)="setEffect(f.key, $any($event.target).valueAsNumber, true)" />
                        </label>
                      }
                      <span class="mt-2 flex flex-wrap gap-1">
                        @if (canSeparate(clip)) { <button type="button" class="tool !bg-[#2c3a4a]" (click)="separate(clip)">🔈 Separate audio</button> }
                        @if (isVideo(clip)) { <button type="button" class="tool !bg-[#2c3a4a]" (click)="freezeFrame(clip)">❄ Freeze frame</button> }
                        <button type="button" class="tool !bg-[#4a2a2a]" (click)="deleteSelected()">🗑 Remove clip</button>
                      </span>
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
            <div #previewBox class="grid flex-1 place-items-center bg-black p-1">
              <canvas #preview class="max-h-[46vh] max-w-full [:fullscreen_&]:max-h-screen" role="img" aria-label="Video preview" (dblclick)="fullscreen()"></canvas>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-1 border-t border-[#343842] px-2 py-1.5">
              <button type="button" class="tool" aria-label="Jump to start" (click)="seek(0)">⏮</button>
              <button type="button" class="tool" aria-label="Back one second" (click)="seek(time() - 1)">⏪</button>
              <button type="button" class="tool text-base" [attr.aria-label]="playing() ? 'Pause' : 'Play'" (click)="togglePlay()">{{ playing() ? '⏸' : '▶' }}</button>
              <button type="button" class="tool" aria-label="Forward one second" (click)="seek(time() + 1)">⏩</button>
              <button type="button" class="tool" aria-label="Jump to end" (click)="seek(duration())">⏭</button>
              <span class="ml-2 font-mono text-xs" aria-label="Current time">{{ timecode(time(), project().fps) }}</span>
              <span class="font-mono text-xs text-[#9aa0ab]">/ {{ timecode(duration(), project().fps) }}</span>
              <button type="button" class="tool ml-2" aria-label="Full screen preview" (click)="fullscreen()">⛶</button>
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
              <span>Ready: {{ e.name }} ({{ formatBytes(e.blob.size) }})</span>
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
            <button type="button" class="tool" [disabled]="!selectedIds().length" aria-label="Copy clips" (click)="copy()">⧉ Copy</button>
            <button type="button" class="tool" [disabled]="!clipboard().length" aria-label="Paste clips" (click)="paste()">📋 Paste</button>
            <button type="button" class="tool" aria-label="Add marker" (click)="toggleMarker()">⚑ Marker</button>
            @if (selectedIds().length > 1) { <span class="text-xs text-[#9aa0ab]">{{ selectedIds().length }} clips selected</span> }
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
                  @for (m of project().markers ?? []; track m) {
                    <button type="button" class="absolute top-0 z-10 -ml-1.5 text-xs leading-none text-amber-300" [style.left.px]="m * pps()" [attr.aria-label]="'Marker at ' + timecodeShort(m)" title="Click to jump, double-click to remove" (pointerdown)="$event.stopPropagation()" (click)="seek(m)" (dblclick)="removeMarkerAt(m)">⚑</button>
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
                      <button type="button" class="rounded px-1" [class.opacity-40]="!track.locked" [attr.aria-label]="(track.locked ? 'Unlock ' : 'Lock ') + track.name" (click)="toggleTrack(track.id, 'locked')">🔒</button>
                    </span>
                  </div>
                  <div class="relative flex-1" [class]="track.locked ? 'bg-[repeating-linear-gradient(45deg,#1f2228_0_8px,#262a31_8px_16px)]' : 'bg-[#1f2228]'" [attr.data-track]="track.id" (pointerdown)="emptyDown($event)" (drop)="dropOnTrack($event, track.id)" (dragover)="$event.preventDefault()">
                    @for (clip of clipsOn(track.id); track clip.id) {
                      <div
                        class="absolute top-1 bottom-1 overflow-hidden rounded border text-[11px] leading-tight"
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
                        <span class="pointer-events-none relative block truncate px-2 opacity-80">{{ timecodeShort(length(clip)) }}@if ((clip.speed ?? 1) !== 1) { · {{ clip.speed }}× }@if (clip.reverse) { · ⟲ }@if (clip.effects) { · fx }@if (clip.keyframes) { · ◆ }@if (clip.muted) { · 🔇 }</span>
                        @if (clip.transitionIn) {
                          <span class="pointer-events-none absolute top-0 bottom-0 left-0 bg-gradient-to-r from-black/60 to-transparent" [style.width.px]="Math.min(length(clip), clip.transitionIn.duration) * pps()"></span>
                        }
                        @if (clip.transitionOut) {
                          <span class="pointer-events-none absolute top-0 right-0 bottom-0 bg-gradient-to-l from-black/60 to-transparent" [style.width.px]="Math.min(length(clip), clip.transitionOut.duration) * pps()"></span>
                        }
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
  ];
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
    inject(DestroyRef).onDestroy(() => {
      if (typeof window === 'undefined') return;
      removeEventListener('pointermove', this.onMove);
      removeEventListener('pointerup', this.onUp);
      clearTimeout(this.saveTimer);
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
  private async checkSaved(): Promise<void> {
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
    this.commit(updateClip(this.project(), id, change), this.project(), label);
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
    for (const m of added) void this.enrich(m);
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
    this.commit(project, this.project(), `Add ${media.name}`);
    this.selectedIds.set([clip.id]);
  }

  protected addTitle(style: TitleStyle): void {
    const top = Math.max(...this.project().tracks.map((t) => t.id));
    const { project, clip } = addTitleClip(this.project(), { ...style }, top, this.time());
    this.commit(project, this.project(), 'Add title');
    this.selectedIds.set([clip.id]);
    this.tab.set('properties');
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

  private isLocked(track: number): boolean {
    return !!this.project().tracks.find((t) => t.id === track)?.locked;
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
    this.commit(next === this.project() && id ? splitAll(this.project(), this.time()) : next, this.project(), 'Split');
  }

  protected deleteSelected(): void {
    const ids = this.selectedIds().filter((id) => !this.isLocked(this.project().clips.find((c) => c.id === id)?.track ?? -1));
    if (!ids.length) return;
    this.commit(ids.reduce((p, id) => removeClip(p, id), this.project()), this.project(), ids.length > 1 ? `Delete ${ids.length} clips` : 'Delete clip');
    this.selectedIds.set([]);
  }

  protected copy(): void {
    this.clipboard.set(this.project().clips.filter((c) => this.selectedIds().includes(c.id)));
  }

  protected paste(at = this.time()): void {
    const { project, ids } = pasteClips(this.project(), this.clipboard(), at);
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
    this.selectedIds.set([]);
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
    if (!this.selectedIds().includes(clip.id)) this.selectedIds.set([clip.id]);
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
      const others = this.selectedIds().filter((id) => id !== clip.id);
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
    this.previewer?.pause();
    this.playing.set(false);
    this.exporting.set(true);
    this.exported.set(null);
    this.error.set('');
    try {
      const { blob, extension } = await exportProject(
        this.project(),
        this.media(),
        (fraction, stage) => {
          this.exportPercent.set(Math.round(fraction * 100));
          this.exportStage.set(stage);
        },
        { format: this.exportFormat(), quality: this.exportQuality() },
      );
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
    const speed = clip.speed ?? 1;
    const out: { left: number; url: string }[] = [];
    let last = -Infinity;
    for (const th of item.thumbs) {
      if (th.t < clip.in - 0.01 || th.t > clip.out) continue;
      const left = ((clip.reverse ? clip.out - th.t : th.t - clip.in) / speed) * this.pps();
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
    this.change(clip.id, { speed: speed === 1 ? undefined : speed }, `Speed ${speed}×`);
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
    const track = this.freeTrackAt(clip.start, clipLength(clip));
    const target = track === clip.track ? Math.min(...this.project().tracks.map((t) => t.id)) : track;
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
        const above = this.project().tracks.map((t) => t.id).filter((id) => id > clip.track).sort((a, b) => a - b);
        const stillTrack = above.find((id) => !this.project().clips.some((c) => c.track === id && at < clipEnd(c) && at + 3 > c.start)) ?? above[0] ?? clip.track;
        const placed = addMediaClip(this.project(), still, stillTrack, at);
        const added = placed.clip;
        this.commit(updateClip(placed.project, added.id, { out: 3 }), this.project(), 'Freeze frame');
        this.selectedIds.set([added.id]);
      } finally {
        input.dispose();
      }
    } catch {
      this.error.set('The frame could not be captured.');
      this.tab.set('files');
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
