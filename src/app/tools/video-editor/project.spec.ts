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
