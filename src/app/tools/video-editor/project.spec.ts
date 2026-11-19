import { frameTimes } from './export';
import {
  MediaItem,
  addMediaClip,
  addTitleClip,
  clipEnd,
  clipsAt,
  fitRect,
  freeStart,
  newProject,
  projectDuration,
  rulerStep,
  snap,
  splitAll,
  splitClip,
  timecode,
  trimClip,
} from './project';

const video = { id: 'v', name: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true, url: '', file: new File([], 'a.mp4') } as MediaItem;
const image = { ...video, id: 'i', name: 'p.png', kind: 'image', duration: 0, hasAudio: false } as MediaItem;
const title = { text: 'Hi', size: 10, colour: '#fff', x: 0.5, y: 0.5, background: false };

describe('video editor project', () => {
  it('places clips without covering others on the same track', () => {
    let { project } = addMediaClip(newProject(), video, 1, 0);
    const second = addMediaClip(project, video, 1, 4);
    project = second.project;
    expect(second.clip.start).toBe(10);
    expect(projectDuration(project)).toBe(20);
    expect(freeStart(project, 2, 3, 5)).toBe(3);
  });

  it('gives images and titles a default length', () => {
    const { clip } = addMediaClip(newProject(), image, 1, 2);
    expect(clipEnd(clip)).toBe(7);
    expect(addTitleClip(newProject(), title, 5, 0).clip.out).toBe(5);
  });

  it('splits a clip into two that keep their source times', () => {
    const { project, clip } = addMediaClip(newProject(), video, 1, 2);
    const split = splitClip(project, clip.id, 5);
    expect(split.clips).toHaveLength(2);
    expect(split.clips[0]).toMatchObject({ start: 2, in: 0, out: 3 });
    expect(split.clips[1]).toMatchObject({ start: 5, in: 3, out: 10 });
    expect(splitClip(project, clip.id, 1)).toBe(project);
    expect(splitAll(project, 5).clips).toHaveLength(2);
  });

  it('trims videos within their source and stretches images freely', () => {
    const { project, clip } = addMediaClip(newProject(), video, 1, 0);
    expect(trimClip(project, clip.id, 'end', 4, 10).clips[0]).toMatchObject({ in: 0, out: 4 });
    expect(trimClip(project, clip.id, 'end', 40, 10).clips[0].out).toBe(10);
    expect(trimClip(project, clip.id, 'start', 3, 10).clips[0]).toMatchObject({ start: 3, in: 3, out: 10 });
    const still = addMediaClip(newProject(), image, 1, 0);
    expect(trimClip(still.project, still.clip.id, 'end', 12, null).clips[0].out).toBe(12);
  });

  it('draws lower tracks first and snaps to edges', () => {
    let { project } = addMediaClip(newProject(), video, 2, 0);
    project = addTitleClip(project, title, 1, 0).project;
    expect(clipsAt(project, 1).map((c) => c.track)).toEqual([1, 2]);
    expect(snap(project, 9.95, 0.1, '')).toBe(10);
    expect(snap(project, 9.5, 0.1, '')).toBe(9.5);
  });

  it('formats timecode, ruler steps and fitting', () => {
    expect(timecode(65.5, 30)).toBe('00:01:05:15');
    expect(rulerStep(60)).toBe(2);
    expect(fitRect(400, 300, 1280, 720)).toEqual({ x: 160, y: 0, width: 960, height: 720 });
  });

  it('lists the source time of every output frame a clip covers', () => {
    const { clip } = addMediaClip(newProject(), video, 1, 1);
    const trimmed = { ...clip, in: 2, out: 2.5 };
    expect(frameTimes(trimmed, 4)).toEqual([2, 2.25]);
  });
});

import { ago } from './autosave';
import { NO_EFFECTS, effectsFilter, transitionGain, transitionProgress } from './project';

describe('video editor transitions and effects', () => {
  const clip = { id: 'c', track: 1, start: 10, in: 0, out: 4, volume: 1, transitionIn: { type: 'fade' as const, duration: 1 }, transitionOut: { type: 'wipe-left' as const, duration: 2 } };

  it('tracks how far into each transition a clip is', () => {
    expect(transitionProgress(clip, 10.5)).toEqual({ in: 0.5, out: null });
    expect(transitionProgress(clip, 12)).toEqual({ in: null, out: null });
    expect(transitionProgress(clip, 13)).toEqual({ in: null, out: 0.5 });
    expect(transitionGain(clip, 10.25)).toBe(0.25);
    expect(transitionGain(clip, 11.5)).toBe(1);
  });

  it('keeps the opening transition on the first part when split', () => {
    const project = { ...newProject(), clips: [clip] };
    const [left, right] = splitClip(project, 'c', 12).clips;
    expect(left.transitionIn).toBeDefined();
    expect(left.transitionOut).toBeUndefined();
    expect(right.transitionIn).toBeUndefined();
    expect(right.transitionOut).toBeDefined();
  });

  it('turns effects into a canvas filter', () => {
    expect(effectsFilter(undefined, 720)).toBe('');
    expect(effectsFilter(NO_EFFECTS, 720)).toBe('');
    expect(effectsFilter({ ...NO_EFFECTS, grayscale: 100, brightness: 120, blur: 4 }, 1440)).toBe('brightness(120%) grayscale(100%) blur(8px)');
  });

  it('says how long ago a project was saved', () => {
    const now = 1_000_000_000;
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 hours ago');
  });
});

import { chromaKey, sharpen } from './pixels';
import { addMarker, moveClips, pasteClips, removeMarker, separateAudio, setKeyframe, sourceTime, transformAt, valueAt } from './project';

describe('video editor advanced editing', () => {
  const base = { id: 'c', track: 2, start: 10, in: 2, out: 8, volume: 1, mediaId: 'v' };

  it('maps timeline time to source time with speed and reverse', () => {
    expect(sourceTime(base, 12)).toBe(4);
    expect(sourceTime({ ...base, speed: 2 }, 12)).toBe(6);
    expect(sourceTime({ ...base, reverse: true }, 11)).toBe(7);
  });

  it('shortens a faster clip and splits a reversed one correctly', () => {
    const fast = { ...base, speed: 2 };
    expect(clipEnd(fast)).toBe(13);
    const project = { ...newProject(), clips: [{ ...base, reverse: true }] };
    const [left, right] = splitClip(project, 'c', 12).clips;
    expect(left).toMatchObject({ start: 10, in: 6, out: 8 });
    expect(right).toMatchObject({ start: 12, in: 2, out: 6 });
  });

  it('trims a faster clip in source seconds', () => {
    const project = { ...newProject(), clips: [{ ...base, speed: 2 }] };
    expect(trimClip(project, 'c', 'end', 11, 20).clips[0].out).toBe(4);
  });

  it('interpolates keyframes and applies them over the transform', () => {
    expect(valueAt([{ t: 0, v: 1 }, { t: 2, v: 3 }], 1, 0)).toBe(2);
    expect(valueAt([{ t: 0, v: 1 }], 5, 0)).toBe(1);
    expect(valueAt(undefined, 5, 7)).toBe(7);
    const clip = { ...base, keyframes: setKeyframe({ ...base, keyframes: setKeyframe(base, 'scale', 0, 1) }, 'scale', 2, 2) };
    expect(transformAt(clip, 11).scale).toBe(1.5);
    expect(transformAt(clip, 11).x).toBe(0.5);
  });

  it('separates audio onto its own clip and mutes the picture', () => {
    const project = separateAudio({ ...newProject(), clips: [base] }, 'c', 1);
    expect(project.clips).toHaveLength(2);
    expect(project.clips[0].muted).toBe(true);
    expect(project.clips[1]).toMatchObject({ track: 1, audioOnly: true, start: 10, in: 2, out: 8 });
  });

  it('pastes and moves clips, and keeps markers', () => {
    const project = { ...newProject(), clips: [base, { ...base, id: 'd', track: 3, start: 12 }] };
    const pasted = pasteClips(project, project.clips, 20);
    expect(pasted.project.clips.slice(2).map((c) => c.start)).toEqual([20, 22]);
    expect(moveClips(project, ['c', 'd'], -20).clips.map((c) => c.start)).toEqual([0, 2]);
    const marked = addMarker(addMarker(project, 5), 1);
    expect(marked.markers).toEqual([1, 5]);
    expect(removeMarker(marked, 5).markers).toEqual([1]);
    expect(snap(marked, 4.95, 0.1, '')).toBe(5);
  });

  it('keys out green and sharpens edges', () => {
    const data = new Uint8ClampedArray([0, 255, 0, 255, 200, 50, 50, 255]);
    chromaKey(data, [0, 255, 0], 40);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    const flat = new Uint8ClampedArray(3 * 3 * 4).fill(100);
    flat[(4) * 4] = 150;
    expect(sharpen(flat, 3, 3, 100)[(4) * 4]).toBeGreaterThan(150);
  });
});

import { colourEffects } from './pixels';
import { easeOutBack, titleEntrance } from './project';
import { shade } from './render';

describe('video editor titles and fallbacks', () => {
  it('times title entrances', () => {
    expect(titleEntrance(0.5, 6, 'pop')).toBe(0.5);
    expect(titleEntrance(5, 6, 'pop')).toBe(1);
    expect(titleEntrance(0, 6, 'none')).toBe(1);
    expect(titleEntrance(1.25, 10, 'typewriter')).toBe(0.5);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });

  it('darkens colours for 3D letter sides', () => {
    expect(shade('#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
  });

  it('does colour effects on pixels when canvas filters are missing', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255]);
    colourEffects(data, { brightness: 100, contrast: 100, saturation: 100, grayscale: 100, sepia: 0, invert: 0, hue: 0 });
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    const dark = new Uint8ClampedArray([10, 20, 30, 255]);
    colourEffects(dark, { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, invert: 100, hue: 0 });
    expect([...dark.slice(0, 3)]).toEqual([245, 235, 225]);
  });
});
